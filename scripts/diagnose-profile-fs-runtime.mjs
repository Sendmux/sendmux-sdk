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
const evidence = resolve(process.argv[3] ?? process.argv[2] ?? ".tmp/profile-fs-runtime");
const ownedMode = process.argv[2] === "--owned-command";
const credentialSentinels = ["native_access_", "native_refresh_", "smx_mbx_", "smx_agent_"];
const persistentPattern = "Windows (bounds persistent OAuth reservation replacement denial before HTTP|denies agent registration when intent-lock access stays obstructed|never replays a spent OAuth token after persistent post-token replacement denial)";
const fixedPattern = `${persistentPattern}|profile lock acquisition applies one deadline across missing names and Windows access denial`;

if (ownedMode) {
  await runOwnedDiagnostic();
} else {
  await runOwnedAdapter();
}

async function runOwnedAdapter() {
  assert(!existsSync(evidence), "Preserve the prior profile filesystem runtime receipt directory");
  mkdirSync(evidence, { recursive: true });
  const profiles = resolve(root, "packages/ts/cli/dist/profiles.js");
  assert(existsSync(profiles), "Build the CLI before profile filesystem runtime sensitivity");
  const original = readFileSync(profiles);
  const originalSha256 = sha256(original);
  const lifecycle = [];
  const originalLog = console.log;
  let outerTimedOut = false;
  let failure;
  writeFileSync(join(evidence, "profiles.before.js"), original, { mode: 0o600 });
  console.log = (...values) => {
    originalLog(...values);
    if (values.length !== 1 || typeof values[0] !== "string") return;
    try {
      const receipt = JSON.parse(values[0]);
      if (receipt.job || receipt.job_closed || receipt.child_pid) lifecycle.push(receipt);
    } catch {}
  };
  const timer = setTimeout(() => {
    outerTimedOut = true;
    process.kill(process.pid, "SIGTERM");
  }, 180_000);

  try {
    await run(process.execPath, [script, "--owned-command", evidence], {
      cwd: root,
      captureOutput: true,
    });
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timer);
    console.log = originalLog;
    writeFileSync(profiles, original);
    writeFileSync(join(evidence, "profiles.restored.js"), readFileSync(profiles), {
      mode: 0o600,
    });
  }

  const opened = lifecycle.find((receipt) => receipt.job);
  const controller = lifecycle.find(
    (receipt) => receipt.child_pid && receipt.command === process.execPath,
  );
  const closed = lifecycle.find((receipt) => receipt.job_closed);
  const cleanupConfirmed = Boolean(opened?.job && opened.job === closed?.job_closed);
  const restoredSha256 = sha256(readFileSync(profiles));
  const owner = {
    active_processes: cleanupConfirmed ? 0 : null,
    assertion: failure?.message ?? null,
    command_succeeded: !failure,
    controller_pid: controller?.child_pid ?? null,
    job: opened?.job ?? null,
    job_closed: closed?.job_closed ?? null,
    lifecycle,
    orphan: !failure && cleanupConfirmed ? false : null,
    original_sha256: originalSha256,
    outer_timed_out: outerTimedOut,
    owner_pid: process.pid,
    owner_returned: cleanupConfirmed,
    restored: restoredSha256 === originalSha256,
    restored_sha256: restoredSha256,
    workspace: opened?.workspace ?? null,
  };
  writeJson(join(evidence, "owner.json"), owner);

  assert(owner.restored, "Outer owner did not restore built profiles.js byte-for-byte");
  if (failure) throw new Error("Owned profile filesystem diagnostic failed; see retained receipts");
  assert(owner.job && owner.job === owner.job_closed, "Owned Windows Job closure receipt is incomplete");
  assert(Number.isInteger(owner.controller_pid), "Owned Windows Job controller PID is missing");
  assert.equal(owner.active_processes, 0);
  assert.equal(owner.orphan, false);
  console.log(JSON.stringify({ resource: "profile_fs_runtime_owner", ...owner }));
}

async function runOwnedDiagnostic() {
  assert(existsSync(evidence), "Outer owner must create the profile filesystem evidence directory");
  const profiles = resolve(root, "packages/ts/cli/dist/profiles.js");
  assert(existsSync(profiles), "Build the CLI before profile filesystem runtime sensitivity");
  const original = readFileSync(profiles);
  const source = original.toString("utf8");
  const pattern = /function isRetryableWindowsProfileFsError\(error\) \{\r?\n\s+return \(process\.platform === "win32" &&\r?\n\s+isNodeError\(error\) &&\r?\n\s+\(error\.code === "EPERM" \|\| error\.code === "EACCES" \|\| error\.code === "EBUSY"\)\);\r?\n\}/g;
  const matches = [...source.matchAll(pattern)];
  const result = {
    original_sha256: sha256(original),
    owner_pid: process.pid,
    profiles,
    verdict: "failed",
  };
  let failure;

  writeFileSync(join(evidence, "profiles.before.js"), original, { mode: 0o600 });
  console.log(JSON.stringify({ resource: "profile_fs_runtime_worker", owner_pid: process.pid }));

  try {
    assert.equal(matches.length, 1, "Retry-disabled mutation must match one built predicate");
    const mutated = source.replace(pattern, [
      "function isRetryableWindowsProfileFsError(error) {",
      "    return false;",
      "}",
    ].join("\n"));
    result.mutated_sha256 = sha256(mutated);
    writeFileSync(join(evidence, "profiles.mutated.js"), mutated, { mode: 0o600 });
    writeFileSync(profiles, mutated);
    assert.equal(sha256(readFileSync(profiles)), result.mutated_sha256);

    const red = runTests("retry-disabled-red", persistentPattern, 65_000);
    result.red = red.receipt;
    assert.equal(red.receipt.status, 1, "Retry-disabled candidate unexpectedly passed");
    assert.equal(red.receipt.signal, null, "Retry-disabled test runner was terminated");
    assert.equal(red.receipt.timed_out, false, "Retry-disabled test runner exceeded its bound");
    assertCounts(red.combined, { tests: 3, pass: 0, fail: 3, skipped: 0 });
    for (const expected of [
      "persistent reservation denial was not retried",
      "persistent intent-lock denial was not retried",
      "persistent post-token denial was not retried",
    ]) {
      assert(red.combined.includes(expected), `Retry-disabled RED omitted: ${expected}`);
    }
    result.red.assertions = [
      "persistent reservation denial was not retried",
      "persistent intent-lock denial was not retried",
      "persistent post-token denial was not retried",
    ];
  } catch (error) {
    failure = error;
    result.assertion = error.message;
  } finally {
    writeFileSync(profiles, original);
    result.restored_sha256 = sha256(readFileSync(profiles));
    result.restored = result.restored_sha256 === result.original_sha256;
    if (result.restored) {
      writeFileSync(join(evidence, "profiles.restored.js"), readFileSync(profiles), { mode: 0o600 });
    }
  }

  try {
    assert(result.restored, "Built profiles.js was not restored byte-for-byte");
    if (failure) throw failure;
    const green = runTests("fixed-green", fixedPattern, 85_000);
    result.green = green.receipt;
    assert.equal(green.receipt.status, 0, "Fixed profile filesystem cases failed");
    assert.equal(green.receipt.signal, null, "Fixed test runner was terminated");
    assert.equal(green.receipt.timed_out, false, "Fixed test runner exceeded its bound");
    assertCounts(green.combined, { tests: 4, pass: 4, fail: 0, skipped: 0 });
    result.verdict = "passed";
  } catch (error) {
    result.assertion ??= error.message;
    failure ??= error;
  } finally {
    writeJson(join(evidence, "results.json"), result);
    console.log(JSON.stringify({
      original_sha256: result.original_sha256,
      restored: result.restored,
      restored_sha256: result.restored_sha256,
      resource: "profile_fs_runtime_result",
      verdict: result.verdict,
      worker_pid: process.pid,
    }));
  }

  if (failure) throw new Error("Profile filesystem runtime diagnostic failed; see results.json");
}

function runTests(label, namePattern, timeout) {
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
    child_pid: child.pid,
    counts,
    signal: child.signal,
    status: child.status,
    stderr_bytes: Buffer.byteLength(stderr),
    stdout_bytes: Buffer.byteLength(stdout),
    synthetic_credentials_found: unsafe,
    timed_out: child.error?.code === "ETIMEDOUT",
  };
  assert.equal(unsafe.length, 0, `${label} output contains a synthetic credential marker`);
  writeFileSync(join(evidence, `${label}.stdout.log`), stdout, { mode: 0o600 });
  writeFileSync(join(evidence, `${label}.stderr.log`), stderr, { mode: 0o600 });
  writeJson(join(evidence, `${label}.json`), receipt);
  console.log(JSON.stringify({ resource: "profile_fs_runtime_test", label, ...receipt }));
  return { combined, receipt };
}

function assertCounts(output, expected) {
  for (const [name, count] of Object.entries(expected)) {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    assert.equal(Number(matches.at(-1)?.[1]), count, `Expected ${name}=${count}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
