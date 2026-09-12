import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      rmSync(directory, { recursive: true });
      assert(!existsSync(directory));
      console.log(JSON.stringify({ removed_workspace: directory }));
    } else {
      console.error(JSON.stringify({ retained_workspace: directory, reason: "Sensitivity or cleanup did not establish the expected result" }));
    }
  }
}
