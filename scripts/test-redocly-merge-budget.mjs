import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { run, workspace } from "./ci-consumers.mjs";

const filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(filename), "..");
const cli = join(root, "node_modules/@redocly/cli/bin/cli.js");
const cases = [
  { name: "ordinary-merges", mappings: 2, targets: 2, mapping: "{}", error: null },
  { name: "populated-budget", mappings: 100, targets: 101, mapping: "{marker: true}", error: "maxTotalMergeKeys" },
  { name: "empty-budget", mappings: 100, targets: 101, mapping: "{}", error: "maxTotalMergeKeys" },
  { name: "oversized-sequence", mappings: 101, targets: 1, mapping: "{}", error: "abnormal merge sequence size" },
];

function collectResults(directory) {
  return cases.map(({ name, mappings, targets, mapping }) => {
    const input = join(directory, `${name}.yaml`);
    const yaml = "openapi: 3.1.0\ninfo:\n  title: Merge budget fixture\n  version: 1.0.0\npaths: {}\n"
      + "x-sources: &sources [" + Array(mappings).fill(mapping).join(",") + "]\n"
      + "x-targets:\n" + "  - <<: *sources\n".repeat(targets);
    writeFileSync(input, yaml);
    const child = spawnSync(process.execPath, [cli, "lint", input, "--extends=spec", "--format=json"], {
      cwd: directory, encoding: "utf8", timeout: 15000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024,
    });
    console.log(JSON.stringify({ name, pid: child.pid, status: child.status, signal: child.signal, error: child.error?.message }));
    assert(Number.isSafeInteger(child.pid) && child.pid > 0, "CLI must start");
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" }, "CLI must close");
    assert.ifError(child.error);
    assert.equal(child.signal, null, "CLI must finish without a timeout or signal");
    return { name, status: child.status, stdout: child.stdout, stderr: child.stderr };
  });
}

if (process.argv[2] === "--fixtures") {
  writeFileSync(join(process.cwd(), "results.json"), JSON.stringify(collectResults(process.cwd())));
} else {
  await test("YAML merge work is bounded for empty and populated sources", async () => {
    await workspace("redocly-merge-budget", async (directory) => {
      // Own the fixture driver and all real CLI children through the existing group/Job owner.
      await run(process.execPath, [filename, "--fixtures"], { cwd: directory });
      const results = JSON.parse(readFileSync(join(directory, "results.json"), "utf8"));
      console.log(JSON.stringify({ redocly_merge_results: results }));
      assert.deepEqual(results.map((result, index) => ({
        name: result.name,
        accepted: result.status === 0,
        expected_error: cases[index].error === null || result.stderr.includes(cases[index].error),
      })), cases.map(({ name, error }) => ({ name, accepted: error === null, expected_error: true })));
    });
  });
}
