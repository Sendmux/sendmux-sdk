import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { booleanGates } from "./live-e2e-contract.mjs";

const result = spawnSync(process.execPath, ["scripts/check-live-e2e-runner.mjs"], {
  encoding: "utf8",
  env: {
    ...process.env,
    ...Object.fromEntries(booleanGates.map((name) => [name, "1"])),
    SENDMUX_LIVE_E2E_DRAFT_ID: "draft_existing",
    SENDMUX_LIVE_E2E_USAGE_START: "2026-10-01T00:00:00.000Z",
    SENDMUX_LIVE_E2E_USAGE_END: "2026-10-02T00:00:00.000Z",
  },
});
assert.equal(result.status, 0, result.stderr || result.stdout);
process.stdout.write(result.stdout);
