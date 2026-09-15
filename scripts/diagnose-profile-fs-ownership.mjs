#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startWindowsConsumer } from "./windows-consumer-owner.mjs";

assert.equal(process.platform, "win32", "Profile filesystem ownership sensitivity requires actual Windows");

const root = resolve(import.meta.dirname, "..");
const evidence = resolve(root, ".tmp/profile-fs-ownership");
const profiles = resolve(root, "packages/ts/cli/dist/profiles.js");
const testName = "Windows waits for a successful OAuth config lock open before refreshing";
const expectedFailure = "OAuth refresh request began before successful exclusive config lock ownership";
const before = `        catch (error) {
            if (!isNodeError(error) || error.code !== "EEXIST")
                throw error;
        }
        try {
            const lock = await stat(lockPath);`;
const after = `        catch (error) {
            if (isNodeError(error) && error.code === "EBUSY")
                return async () => {};
            if (!isNodeError(error) || error.code !== "EEXIST")
                throw error;
        }
        try {
            const lock = await stat(lockPath);`;

assert(!existsSync(evidence), "Preserve the prior profile filesystem ownership receipt directory");
mkdirSync(evidence, { recursive: true });
assert(existsSync(profiles), "Build the CLI before running profile filesystem ownership sensitivity");

const original = readFileSync(profiles);
const source = original.toString("utf8");
const result = {
  built_file: profiles,
  mutation: "return a no-op release after EBUSY lock-open denial",
  original_sha256: sha256(original),
  test_name: testName,
};
let failure;

writeFileSync(resolve(evidence, "profiles.before.js"), original);
writeFileSync(resolve(evidence, "mutation.json"), `${JSON.stringify({ before, after }, null, 2)}\n`);

try {
  assert.equal(
    source.split(before).length,
    2,
    "Ownership mutation must match only the acquisition catch before lock inspection",
  );
  const mutated = source.replace(before, after);
  assert.notEqual(mutated, source, "Ownership mutation did not change the built runtime");
  result.mutated_sha256 = sha256(mutated);
  writeFileSync(resolve(evidence, "profiles.mutated.js"), mutated);
  writeFileSync(profiles, mutated);
  assert.equal(sha256(readFileSync(profiles)), result.mutated_sha256);

  const run = await runOwnedTest();
  Object.assign(result, {
    controller_pid: run.controller_pid,
    job: run.job,
    status: run.status,
    timed_out: run.timed_out,
  });
  const combined = `${run.stdout}\n${run.stderr}`;
  for (const sentinel of ["native_access_", "native_refresh_", "smx_"]) {
    assert(!combined.includes(sentinel), "Credential-like fixture value reached sensitivity output");
  }
  result.stdout = run.stdout;
  result.stderr = run.stderr;
  writeFileSync(resolve(evidence, "test.stdout.log"), run.stdout);
  writeFileSync(resolve(evidence, "test.stderr.log"), run.stderr);

  assert.notEqual(run.status, 0, "No-op-on-EBUSY mutation unexpectedly passed the strengthened OAuth lock test");
  assert(!run.timed_out, "No-op-on-EBUSY sensitivity exceeded its bounded child deadline");
  assert(combined.includes(expectedFailure), "Sensitivity failed outside the ownership-before-network assertion");
  const boundary = boundaryReceipt(combined);
  result.boundary = boundary;
  assert.equal(boundary.request_observed, true, "Sensitivity did not observe the refresh request");
  assert.equal(boundary.receipt?.code, "EBUSY");
  assert.equal(boundary.receipt?.operation, "open");
  assert.equal(boundary.receipt?.injected, 1, "Sensitivity did not activate the selected denial");
  assert.equal(
    boundary.receipt?.exclusive_open_succeeded,
    0,
    "Sensitivity did not prove refresh preceded exclusive lock ownership",
  );
  result.verdict = "passed";
} catch (error) {
  result.verdict = "failed";
  result.assertion = error.message;
  failure = error;
} finally {
  writeFileSync(profiles, original);
  result.restored_sha256 = sha256(readFileSync(profiles));
  result.restored = result.restored_sha256 === result.original_sha256;
  writeFileSync(resolve(evidence, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    controller_pid: result.controller_pid ?? null,
    evidence,
    mutated_sha256: result.mutated_sha256 ?? null,
    original_sha256: result.original_sha256,
    restored: result.restored,
    restored_sha256: result.restored_sha256,
    verdict: result.verdict,
  }));
  assert(result.restored, "Built profiles.js was not restored byte-for-byte after sensitivity");
}

if (failure) throw failure;

async function runOwnedTest() {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const owner = startWindowsConsumer(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      `--test-name-pattern=${testName}`,
      "scripts/test-cli-oauth-login.mjs",
    ],
    { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] },
  );
  const child = owner.child;
  const receipt = {
    controller_pid: child.pid,
    stderr: "",
    stdout: "",
  };
  console.log(JSON.stringify({ controller_pid: child.pid, command: process.execPath, test_name: testName }));
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { receipt.stdout += chunk; });
  child.stderr.on("data", (chunk) => { receipt.stderr += chunk; });

  let shutdownTimer;
  let timedOut = false;
  let stopError;
  let rejectShutdown;
  const shutdownFailed = new Promise((_, reject) => { rejectShutdown = reject; });
  const timer = setTimeout(() => {
    timedOut = true;
    try { owner.stop(); } catch (error) { stopError = error; }
    shutdownTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (error) { stopError ??= error; }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      rejectShutdown(new Error(`Profile filesystem sensitivity shutdown unconfirmed: ${child.pid}`));
    }, 2_000);
  }, 30_000);

  try {
    const closed = new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("close", accept);
    });
    receipt.status = await Promise.race([closed, shutdownFailed]);
  } finally {
    clearTimeout(timer);
    clearTimeout(shutdownTimer);
  }
  receipt.timed_out = timedOut;
  receipt.job = await owner.confirm();
  assert(!receipt.job.orphan, "Sensitivity child left an owned Windows descendant");
  assert(!stopError, `Sensitivity child stop failed: ${stopError?.message}`);
  console.log(JSON.stringify({
    controller_closed: child.pid,
    status: receipt.status,
    timed_out: receipt.timed_out,
  }));
  return receipt;
}

function boundaryReceipt(output) {
  for (const line of output.split(/\r?\n/)) {
    const start = line.indexOf('{"boundary":"oauth_refresh"');
    if (start === -1) continue;
    const value = JSON.parse(line.slice(start));
    if (value.resource === "profile_filesystem_ownership_boundary") return value;
  }
  throw new Error("Sensitivity output omitted the OAuth ownership boundary receipt");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
