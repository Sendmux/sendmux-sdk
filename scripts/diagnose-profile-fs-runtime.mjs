#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./ci-consumers.mjs";

assert.equal(process.platform, "win32", "Profile filesystem runtime sensitivity requires actual Windows");

const root = resolve(import.meta.dirname, "..");
const script = fileURLToPath(import.meta.url);
const mode = process.argv[2];
const evidence = resolve(process.argv[3] ?? process.argv[2] ?? ".tmp/profile-fs-runtime");
const credentialSentinels = ["native_access_", "native_refresh_", "smx_mbx_", "smx_agent_"];
const redAssertions = [
  "persistent reservation denial was not retried",
  "persistent intent-lock denial was not retried",
  "persistent post-token denial was not retried",
];
const persistentPattern = "Windows (bounds persistent OAuth reservation replacement denial before HTTP|denies agent registration when intent-lock access stays obstructed|never replays a spent OAuth token after persistent post-token replacement denial)";
const fixedPattern = `${persistentPattern}|profile lock acquisition applies one deadline across missing names and Windows access denial`;
const retryPredicate = /function isRetryableWindowsProfileFsError\(error\) \{\r?\n\s+return \(process\.platform === "win32" &&\r?\n\s+isNodeError\(error\) &&\r?\n\s+\(error\.code === "EPERM" \|\| error\.code === "EACCES" \|\| error\.code === "EBUSY"\)\);\r?\n\}/g;

if (mode === "--red-command") {
  runTestPhase("retry-disabled-red", persistentPattern, 65_000, {
    tests: 3, pass: 0, fail: 3, skipped: 0,
  }, redAssertions);
} else if (mode === "--green-command") {
  runTestPhase("fixed-green", fixedPattern, 85_000, {
    tests: 4, pass: 4, fail: 0, skipped: 0,
  });
} else {
  await runOwnedAdapter();
}

async function runOwnedAdapter() {
  assert(!existsSync(evidence), "Preserve the prior profile filesystem runtime receipt directory");
  mkdirSync(evidence, { recursive: true });
  const profiles = resolve(root, "packages/ts/cli/dist/profiles.js");
  assert(existsSync(profiles), "Build the CLI before profile filesystem runtime sensitivity");
  const original = readFileSync(profiles);
  const source = original.toString("utf8");
  const matches = [...source.matchAll(retryPredicate)];
  const lifecycle = [];
  const originalLog = console.log;
  let failure;
  let interrupted = false;
  const result = {
    original_sha256: sha256(original),
    profiles,
    restoration: "pending",
    verdict: "failed",
  };
  const recordLifecycle = (...values) => {
    originalLog(...values);
    if (values.length !== 1 || typeof values[0] !== "string") return;
    try {
      const receipt = JSON.parse(values[0]);
      if (receipt.job || receipt.job_closed || receipt.child_pid || receipt.child_closed) {
        lifecycle.push(receipt);
      }
    } catch {}
  };
  const recordInterruption = () => { interrupted = true; };

  writeFileSync(join(evidence, "profiles.before.js"), original, { mode: 0o600 });
  console.log = recordLifecycle;
  process.on("SIGINT", recordInterruption);
  process.on("SIGTERM", recordInterruption);
  try {
    assert.equal(matches.length, 1, "Retry-disabled mutation must match one built predicate");
    const mutated = source.replace(retryPredicate, [
      "function isRetryableWindowsProfileFsError(error) {",
      "    return false;",
      "}",
    ].join("\n"));
    result.mutated_sha256 = sha256(mutated);
    writeFileSync(join(evidence, "profiles.mutated.js"), mutated, { mode: 0o600 });
    writeFileSync(profiles, mutated);
    assert.equal(sha256(readFileSync(profiles)), result.mutated_sha256);
    assert(!interrupted, "Profile filesystem diagnostic interrupted before RED ownership");

    result.red_owner = await runOwnedCommand("--red-command", 75_000, lifecycle);
    assert(result.red_owner.shutdown_confirmed, "RED Windows Job shutdown is unconfirmed; restoration pending");

    writeFileSync(profiles, original);
    result.restored_sha256 = sha256(readFileSync(profiles));
    assert.equal(result.restored_sha256, result.original_sha256, "Built profiles.js restore mismatch");
    writeFileSync(join(evidence, "profiles.restored.js"), readFileSync(profiles), { mode: 0o600 });
    result.restoration = "completed_after_red_shutdown";

    assert(result.red_owner.command_succeeded, "Owned RED command failed; GREEN suppressed");
    assert(!interrupted, "Profile filesystem diagnostic interrupted; GREEN suppressed");
    result.green_owner = await runOwnedCommand("--green-command", 95_000, lifecycle);
    assert(result.green_owner.shutdown_confirmed, "GREEN Windows Job shutdown is unconfirmed");
    assert(result.green_owner.command_succeeded, "Owned GREEN command failed");
    assert(!interrupted, "Profile filesystem diagnostic interrupted during GREEN");
    result.verdict = "passed";
  } catch (error) {
    failure = error;
    result.assertion = error.message;
  } finally {
    process.removeListener("SIGINT", recordInterruption);
    process.removeListener("SIGTERM", recordInterruption);
    console.log = originalLog;
    result.current_sha256 = sha256(readFileSync(profiles));
    result.interrupted = interrupted;
    result.restoration_confirmed = result.restoration === "completed_after_red_shutdown";
    result.lifecycle = lifecycle;
    writeJson(join(evidence, "results.json"), result);
    writeJson(join(evidence, "owner.json"), {
      green: result.green_owner ?? null,
      red: result.red_owner ?? null,
      restoration: result.restoration,
      restoration_confirmed: result.restoration_confirmed,
    });
    originalLog(JSON.stringify({
      current_sha256: result.current_sha256,
      resource: "profile_fs_runtime_result",
      restoration: result.restoration,
      verdict: result.verdict,
    }));
  }

  if (failure) throw new Error("Owned profile filesystem diagnostic failed; see retained receipts");
}

async function runOwnedCommand(commandMode, timeout, lifecycle) {
  const lifecycleStart = lifecycle.length;
  let commandFailure;
  let ownerTimedOut = false;
  const timer = setTimeout(() => {
    ownerTimedOut = true;
    process.emit("SIGTERM");
  }, timeout);
  try {
    await run(process.execPath, [script, commandMode, evidence], {
      cwd: root,
      captureOutput: true,
    });
  } catch (error) {
    commandFailure = error;
  } finally {
    clearTimeout(timer);
  }

  const receipts = lifecycle.slice(lifecycleStart);
  const opened = receipts.find((receipt) => receipt.job);
  const controller = receipts.find(
    (receipt) => receipt.child_pid && receipt.command === process.execPath,
  );
  const closed = receipts.find((receipt) => receipt.job_closed);
  const controllerClosed = receipts.find(
    (receipt) => receipt.child_closed === controller?.child_pid,
  );
  const jobClosed = Boolean(opened?.job && opened.job === closed?.job_closed);
  const shutdownConfirmed = Boolean(
    jobClosed &&
    controller?.child_pid &&
    controllerClosed,
  );
  return {
    active_processes: jobClosed ? 0 : null,
    assertion: commandFailure?.message ?? null,
    command: commandMode,
    command_succeeded: !commandFailure && !ownerTimedOut,
    controller_closed: Boolean(controllerClosed),
    controller_pid: controller?.child_pid ?? null,
    job: opened?.job ?? null,
    job_closed: closed?.job_closed ?? null,
    lifecycle: receipts,
    orphan: !commandFailure && shutdownConfirmed ? false : null,
    owner_timed_out: ownerTimedOut,
    shutdown_confirmed: shutdownConfirmed,
    workspace: opened?.workspace ?? null,
  };
}

function runTestPhase(label, namePattern, timeout, expectedCounts, expectedAssertions = []) {
  assert(existsSync(evidence), "Outer owner must create the profile filesystem evidence directory");
  console.log(JSON.stringify({ resource: "profile_fs_runtime_worker", phase: label, worker_pid: process.pid }));
  const receipt = runTests(label, namePattern, timeout, expectedAssertions);
  assert.equal(receipt.status, label === "retry-disabled-red" ? 1 : 0, `${label} exit was unexpected`);
  assert.equal(receipt.signal, null, `${label} test runner was terminated`);
  assert.equal(receipt.timed_out, false, `${label} test runner exceeded its bound`);
  assertCounts(receipt.counts, expectedCounts);
  assert.deepEqual(receipt.assertions, expectedAssertions, `${label} omitted a required assertion`);
  console.log(JSON.stringify({ resource: "profile_fs_runtime_phase", phase: label, verdict: "passed" }));
}

function runTests(label, namePattern, timeout, expectedAssertions) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const child = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "--test-reporter=tap",
      `--test-name-pattern=${namePattern}`,
      "scripts/test-cli-oauth-login.mjs",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: environment,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
      timeout,
    },
  );
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const combined = `${stdout}\n${stderr}`;
  const unsafe = credentialSentinels.filter((sentinel) => combined.includes(sentinel));
  const counts = Object.fromEntries(
    ["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((name) => {
      const matches = [...combined.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
      return [name, Number(matches.at(-1)?.[1])];
    }),
  );
  const receipt = {
    assertions: expectedAssertions.filter((message) => combined.includes(message)),
    child_pid: child.pid ?? null,
    counts,
    raw_streams_retained: unsafe.length === 0,
    signal: child.signal,
    spawn_error: child.error?.code ?? null,
    status: child.status,
    stderr_bytes: Buffer.byteLength(stderr),
    stdout_bytes: Buffer.byteLength(stdout),
    synthetic_credential_markers: unsafe.length,
    timed_out: child.error?.code === "ETIMEDOUT",
  };
  writeJson(join(evidence, `${label}.json`), receipt);
  console.log(JSON.stringify({ resource: "profile_fs_runtime_test", label, ...receipt }));
  assert.equal(unsafe.length, 0, `${label} output contains a synthetic credential marker`);
  writeFileSync(join(evidence, `${label}.stdout.log`), stdout, { mode: 0o600 });
  writeFileSync(join(evidence, `${label}.stderr.log`), stderr, { mode: 0o600 });
  return receipt;
}

function assertCounts(actual, expected) {
  for (const [name, count] of Object.entries(expected)) {
    assert.equal(actual[name], count, `Expected ${name}=${count}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
