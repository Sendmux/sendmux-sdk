import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertRequiredResults, requiredServerScenarios } from "./mcp-conformance.mjs";

assert.equal(requiredServerScenarios("2025-11-25").length, 30);
assert.equal(requiredServerScenarios("2026-07-28").length, 37);
assert.equal(requiredServerScenarios("2025-11-25")[0], "server-initialize");
assert.equal(requiredServerScenarios("2026-07-28")[0], "server-stateless");

for (const mutation of ["empty", "unknown", "skip", "missing"]) {
  const root = mkdtempSync(join(tmpdir(), "sendmux-mcp-conformance-"));
  try {
    const scenarios = requiredServerScenarios("2025-11-25");
    for (const scenario of scenarios) {
      const directory = join(root, `server-${scenario}-result`);
      mkdirSync(directory);
      writeFileSync(join(directory, "checks.json"), JSON.stringify([{ id: `${scenario}-ok`, status: "SUCCESS" }]));
    }
    const first = join(root, `server-${scenarios[0]}-result`, "checks.json");
    writeFileSync(
      first,
      JSON.stringify(Array.from({ length: 41 }, (_, index) => ({ id: `required-success-${index}`, status: "SUCCESS" }))),
    );
    assert.deepEqual(assertRequiredResults("2025-11-25", root), { SUCCESS: 70, INFO: 0, SKIPPED: 0 });
    if (mutation === "empty") writeFileSync(first, "[]");
    if (mutation === "unknown") writeFileSync(first, JSON.stringify([{ id: "unknown", status: "WARNING" }]));
    if (mutation === "skip") writeFileSync(first, JSON.stringify([{ id: "unexpected", status: "SKIPPED", details: { note: "not applicable" } }]));
    if (mutation === "missing") rmSync(join(root, `server-${scenarios[0]}-result`), { recursive: true });

    assert.throws(() => assertRequiredResults("2025-11-25", root));
  } finally {
    rmSync(root, { recursive: true });
  }
}

console.log("MCP conformance result accounting tests passed");
