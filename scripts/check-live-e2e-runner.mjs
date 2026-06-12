#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/run-live-e2e.mjs", "--plan", "--json"], {
  encoding: "utf8",
  env: {
    ...process.env,
    SENDMUX_LIVE_E2E_ROOT_API_KEY: "",
    SENDMUX_LIVE_E2E_MAILBOX_API_KEY: "",
    SENDMUX_STAGING_ROOT_API_KEY: "",
    SENDMUX_STAGING_MAILBOX_API_KEY: "",
  },
});

assert.equal(result.status, 0, result.stderr || result.stdout);

const plan = JSON.parse(result.stdout);
assert.equal(plan.ok, true);
assert.equal(plan.summary.total, 93);
assert.equal(plan.summary.executable, 53);
assert.equal(plan.summary.blocked, 40);
assert.equal(plan.summary.blockedByRisk.mutation, 28);
assert.equal(plan.summary.blockedByRisk.destructive, 7);
assert.equal(plan.summary.blockedByRisk.binary, 2);
assert.equal(plan.summary.blockedByRisk.send, 2);
assert.equal(plan.summary.blockedByRisk.stream, 1);

const byOperation = new Map(plan.operations.map((operation) => [operation.operationId, operation]));
const bySource = new Map(plan.sources.map((source) => [source.name, source]));
assert.equal(byOperation.get("mailboxGetMessage")?.status, "executable");
assert.equal(byOperation.get("managementGetDomain")?.status, "executable");
assert.equal(byOperation.get("managementGetDomainZoneFile")?.responseKind, "text");
assert.equal(byOperation.get("mailboxBatchDeleteMessages")?.status, "blocked");
assert.match(byOperation.get("mailboxBatchDeleteMessages")?.reason ?? "", /requires SENDMUX_LIVE_E2E_MUTATIONS=1/);
assert.equal(byOperation.get("sendingSendEmail")?.status, "blocked");
assert.match(byOperation.get("sendingSendEmail")?.reason ?? "", /requires SENDMUX_STAGING_SEND=1/);
assert.deepEqual(bySource.get("mailboxSubmissionId")?.setupGates, [
  "SENDMUX_LIVE_E2E_FIXTURE_SETUP=1",
  "SENDMUX_LIVE_E2E_FIXTURE_SEND_TO allowlist",
]);
assert.deepEqual(bySource.get("managementWebhookId")?.setupGates, [
  "SENDMUX_LIVE_E2E_FIXTURE_SETUP=1",
  "SENDMUX_LIVE_E2E_WEBHOOK_URL allowlist",
]);
assert.deepEqual(bySource.get("managementWebhookDeliveryId")?.setupGates, [
  "SENDMUX_LIVE_E2E_FIXTURE_SETUP=1",
  "SENDMUX_LIVE_E2E_WEBHOOK_URL allowlist",
]);

const unsafeResult = spawnSync(process.execPath, ["scripts/run-live-e2e.mjs", "--operation", "sendingSendEmail"], {
  encoding: "utf8",
  env: {
    ...process.env,
    SENDMUX_LIVE_E2E: "1",
    SENDMUX_LIVE_E2E_ROOT_API_KEY: "",
    SENDMUX_LIVE_E2E_MAILBOX_API_KEY: "",
    SENDMUX_STAGING_ROOT_API_KEY: "",
    SENDMUX_STAGING_MAILBOX_API_KEY: "",
  },
});

assert.notEqual(unsafeResult.status, 0);
assert.match(unsafeResult.stderr, /sendingSendEmail is blocked/);

console.log("Live E2E runner contract checks passed.");
