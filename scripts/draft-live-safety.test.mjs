import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("draft sending and scheduling require the protected send gate", () => {
  const result = spawnSync(process.execPath, ["scripts/run-live-e2e.mjs", "--plan", "--json"], {
    encoding: "utf8", env: { ...process.env, SENDMUX_STAGING_SEND: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  const scenarios = JSON.parse(readFileSync("test/live-e2e/scenarios.json", "utf8")).scenarios;
  for (const id of ["mailboxSendDraft", "mailboxControlDraftSchedule"]) {
    const operation = plan.operations.find((item) => item.operationId === id);
    assert.equal(operation.risk, "send");
    assert.equal(operation.status, "gated");
    assert.ok(scenarios[id].gates.includes("SENDMUX_STAGING_SEND=1"));
  }
});
