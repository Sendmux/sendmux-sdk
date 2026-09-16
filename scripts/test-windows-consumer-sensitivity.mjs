import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./ci-consumers.mjs";

assert.equal(process.platform, "win32", "Sensitivity requires the actual Windows owner");
const scripts = dirname(fileURLToPath(import.meta.url));
const temp = resolve(scripts, "../.tmp");
mkdirSync(temp, { recursive: true });
const files = ["ci-consumers.mjs", "windows-consumer-owner.mjs", "windows-consumer-command.mjs", "windows-consumer-job.ps1", "diagnose-windows-consumer-ownership.mjs"];
const mutations = [
  { name: "healthy" },
  { name: "lost-stdout", from: 'stdio: "inherit"', to: 'stdio: ["ignore", "ignore", "inherit"]', expected: /Captured command stdout/ },
  { name: "wrong-exit", from: "process.exitCode = code ?? 1", to: "process.exitCode = 1", expected: /exit 1, interrupted=false/ },
];

const readinessFailures = [];
for (const mutation of ["cold-controller-start", "started-never-ready"]) {
  const directory = mkdtempSync(join(temp, "windows-readiness-sensitivity-"));
  console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid, mutation }));
  let completed = false;
  try {
    for (const file of files) copyFileSync(join(scripts, file), join(directory, file));
    if (mutation === "cold-controller-start") {
      const job = join(directory, "windows-consumer-job.ps1");
      const original = readFileSync(job, "utf8");
      const bootstrap = "    $bootstrap = [Diagnostics.Process]::Start($start)";
      const delayed = "    Start-Sleep -Seconds 12\n" + bootstrap;
      assert.equal(original.split(bootstrap).length, 2, "Cold-start mutation must delay exactly one real bootstrap start");
      writeFileSync(job, original.replace(bootstrap, delayed));
      assert.notEqual(readFileSync(job, "utf8"), original);
    } else {
      const diagnostic = join(directory, "diagnose-windows-consumer-ownership.mjs");
      const original = readFileSync(diagnostic, "utf8");
      const actualReadyWrite = "fs.writeFileSync(${JSON.stringify(ready)},'ready');";
      assert.equal(original.split(actualReadyWrite).length, 2, "Never-ready mutation must remove exactly one Node fixture ready write");
      writeFileSync(diagnostic, original.replace(actualReadyWrite, ""));
      assert.notEqual(readFileSync(diagnostic, "utf8"), original);
    }
    const evidence = join(directory, "evidence");
    const command = run(process.execPath, [join(directory, "diagnose-windows-consumer-ownership.mjs"), evidence]);
    if (mutation === "cold-controller-start") await command;
    else await assert.rejects(command, /exit 1/);
    const rows = JSON.parse(readFileSync(join(evidence, "results.json"), "utf8"));
    assert.equal(rows.length, 3);
    assert.equal(rows[0].kind, "node-leader-control");
    if (mutation === "cold-controller-start") {
      assert.equal(rows[0].verdict, "passed");
      assert.equal(rows[0].result, "success");
    } else {
      assert.equal(rows[0].verdict, "failed");
      assert.equal(rows[0].result, "failure");
      assert.match(rows[0].assertion, /Fixture did not become ready/);
      assert.match(rows[0].error, /interrupted=true/, "A started fixture that misses readiness must take the owned deadline cleanup path");
    }
    assert(rows.every((row) => row.paths_absent && !row.cleanup_error));
    assert(rows.slice(1).every((row) => row.verdict === "passed"), "Unchanged PowerShell assertions must still pass");
    completed = true;
    console.log(JSON.stringify({ sensitivity: mutation, detected: true, results: rows }));
  } catch (error) {
    readinessFailures.push({ mutation, directory, error });
    console.error(JSON.stringify({ sensitivity: mutation, detected: false, retained_workspace: directory, error: error.message }));
  } finally {
    if (completed) {
      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 });
      assert(!existsSync(directory));
      console.log(JSON.stringify({ removed_workspace: directory }));
    } else {
      console.error(JSON.stringify({ retained_workspace: directory, reason: "Readiness sensitivity did not establish the expected result" }));
    }
  }
}
assert.equal(
  readinessFailures.length,
  0,
  `Windows readiness sensitivity failures:\n${readinessFailures.map(({ mutation, directory, error }) => `${mutation} (${directory}): ${error.stack}`).join("\n")}`,
);

for (const mutation of Array.from({ length: 4 }, (_, iteration) => mutations.map((mutation) => ({ ...mutation, iteration }))).flat()) {
  // Checkout-local so the real cross-spawn dependency resolves; never alter source.
  const directory = mkdtempSync(join(temp, "windows-job-sensitivity-"));
  console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid, mutation: mutation.name, iteration: mutation.iteration }));
  let completed = false;
  try {
    for (const file of files) copyFileSync(join(scripts, file), join(directory, file));
    if (mutation.from) {
      const bridge = join(directory, "windows-consumer-command.mjs");
      const original = readFileSync(bridge, "utf8");
      assert.equal(original.split(mutation.from).length, 2, "Mutation must change exactly one real bridge behavior");
      writeFileSync(bridge, original.replace(mutation.from, mutation.to));
      assert.notEqual(readFileSync(bridge, "utf8"), original);
    }
    const evidence = join(directory, "evidence");
    const command = run(process.execPath, [join(directory, "diagnose-windows-consumer-ownership.mjs"), evidence]);
    if (mutation.from) await assert.rejects(command, /exit 1/);
    else await command;
    const rows = JSON.parse(readFileSync(join(evidence, "results.json"), "utf8"));
    assert.equal(rows.length, 3);
    assert.equal(rows[0].kind, "node-leader-control");
    if (mutation.from) {
      assert.equal(rows[0].verdict, "failed");
      assert.match(rows[0].error, mutation.expected);
      assert.match(rows[0].assertion, /healthy Node consumer must still succeed/);
    } else {
      assert.equal(rows[0].verdict, "passed");
      assert.equal(rows[0].result, "success");
    }
    assert(rows.every((row) => row.paths_absent && !row.cleanup_error));
    assert(rows.slice(1).every((row) => row.verdict === "passed"), "Unchanged orphan/deadline assertions must still pass");
    completed = true;
    console.log(JSON.stringify({ sensitivity: mutation.name, iteration: mutation.iteration, detected: true, results: rows }));
  } finally {
    if (completed) {
      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 });
      assert(!existsSync(directory));
      console.log(JSON.stringify({ removed_workspace: directory }));
    } else {
      console.error(JSON.stringify({ retained_workspace: directory, reason: "Sensitivity or cleanup did not establish the expected result" }));
    }
  }
}

{
  const mutation = "swallowed-cleanup-error";
  const directory = mkdtempSync(join(temp, "windows-cleanup-sensitivity-"));
  console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid, mutation }));
  let completed = false;
  try {
    for (const file of ["ci-consumers.mjs", "windows-consumer-owner.mjs", "windows-consumer-command.mjs", "windows-consumer-job.ps1", "test-windows-workspace-cleanup.mjs"]) {
      copyFileSync(join(scripts, file), join(directory, file));
    }
    const helper = join(directory, "ci-consumers.mjs");
    const original = readFileSync(helper, "utf8");
    const removal = "      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 });";
    const swallowed = "      try { await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { if (error.code === \"EBUSY\") return; throw error; }";
    assert.equal(original.split(removal).length, 2, "Mutation must change exactly one real workspace cleanup");
    writeFileSync(helper, original.replace(removal, swallowed));
    assert.notEqual(readFileSync(helper, "utf8"), original);
    const evidence = join(directory, "evidence");
    await assert.rejects(run(process.execPath, [join(directory, "test-windows-workspace-cleanup.mjs"), evidence]), /exit 1/);
    const rows = JSON.parse(readFileSync(join(evidence, "results.json"), "utf8"));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].mode, "transient");
    assert.equal(rows[0].verdict, "passed");
    assert.equal(rows[1].mode, "persistent");
    assert.equal(rows[1].command_closed, true);
    assert.equal(rows[1].lock_confirmed, true);
    assert.equal(rows[1].verdict, "failed");
    assert.match(rows[1].assertion, /Persistent lock must fail, not certify cleanup/);
    assert(rows.every((row) => row.holder_absent && row.path_absent_after_recovery && !row.cleanup_error));
    completed = true;
    console.log(JSON.stringify({ sensitivity: mutation, detected: true, results: rows }));
  } finally {
    if (completed) {
      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 });
      assert(!existsSync(directory));
      console.log(JSON.stringify({ removed_workspace: directory }));
    } else {
      console.error(JSON.stringify({ retained_workspace: directory, reason: "Cleanup sensitivity did not establish the expected result" }));
    }
  }
}
