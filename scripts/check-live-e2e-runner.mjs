#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
assert.deepEqual(plan.adapters, ["typescript", "python", "go", "php", "ruby", "cli", "mcp"]);
assert.equal(plan.summary.total, 95);
assert.equal(plan.summary.executable, 53);
assert.equal(plan.summary.gated, 42);
assert.equal(plan.summary.blocked, 0);
assert.equal(plan.summary.gatedByRisk.mutation, 29);
assert.equal(plan.summary.gatedByRisk.destructive, 8);
assert.equal(plan.summary.gatedByRisk.binary, 2);
assert.equal(plan.summary.gatedByRisk.send, 2);
assert.equal(plan.summary.gatedByRisk.stream, 1);

const byOperation = new Map(plan.operations.map((operation) => [operation.operationId, operation]));
const bySource = new Map(plan.sources.map((source) => [source.name, source]));
assert.equal(byOperation.get("mailboxGetMessage")?.status, "executable");
assert.equal(byOperation.get("managementGetDomain")?.status, "executable");
assert.equal(byOperation.get("managementGetDomainZoneFile")?.responseKind, "text");
assert.equal(byOperation.get("mailboxBatchDeleteMessages")?.status, "gated");
assert.match(byOperation.get("mailboxBatchDeleteMessages")?.reason ?? "", /SENDMUX_LIVE_E2E_MUTATIONS=1/);
assert.equal(byOperation.get("sendingSendEmail")?.status, "gated");
assert.match(byOperation.get("sendingSendEmail")?.reason ?? "", /SENDMUX_STAGING_SEND=1/);
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
assert.match(unsafeResult.stderr, /sendingSendEmail is gated/);

const gatedResult = spawnSync(process.execPath, ["scripts/run-live-e2e.mjs", "--plan", "--json"], {
  encoding: "utf8",
  env: {
    ...process.env,
    SENDMUX_LIVE_E2E_BINARY: "1",
    SENDMUX_LIVE_E2E_MAILBOX_API_KEY: "",
    SENDMUX_LIVE_E2E_MUTATIONS: "1",
    SENDMUX_LIVE_E2E_ROOT_API_KEY: "",
    SENDMUX_LIVE_E2E_STREAM: "1",
    SENDMUX_STAGING_MAILBOX_API_KEY: "",
    SENDMUX_STAGING_ROOT_API_KEY: "",
    SENDMUX_STAGING_SEND: "1",
  },
});

assert.equal(gatedResult.status, 0, gatedResult.stderr || gatedResult.stdout);
const gatedPlan = JSON.parse(gatedResult.stdout);
assert.equal(gatedPlan.summary.total, 95);
assert.equal(gatedPlan.summary.executable, 95);
assert.equal(gatedPlan.summary.gated, 0);
assert.equal(gatedPlan.summary.blocked, 0);

const runnerSource = readFileSync("scripts/run-live-e2e.mjs", "utf8");
const ownedMailboxCreateMatch = runnerSource.match(/async function createOwnedManagementMailbox[\s\S]*?\n}/);
assert.ok(ownedMailboxCreateMatch, "createOwnedManagementMailbox helper must exist");
const ownedMailboxCreateSource = ownedMailboxCreateMatch[0];
assert.match(
  ownedMailboxCreateSource,
  /requireSelectedValue\(response,\s*managementMailboxKeySecretSelectors,\s*`\$\{label\} mailbox initial credential secret`\)/,
  "owned mailbox fixtures must capture the initial mailbox credential secret",
);
assert.match(
  ownedMailboxCreateSource,
  /await waitForMailboxCredentialVisible\(fixtureRuntime,\s*keySecret\);/,
  "owned mailbox fixtures must wait for mailbox credential visibility before mailbox mutations",
);
assert.match(
  runnerSource,
  /async function waitForMailboxCredentialVisible[\s\S]*?mailboxCredentialVisibilityRetryDelaysMs[\s\S]*?mailboxListGrantedMailboxes/,
  "mailbox readiness must use the bounded credential-visibility poll",
);

for (const helperName of [
  "prepareOwnedMailboxUpdate",
  "prepareOwnedMailboxSuspend",
  "prepareOwnedMailboxResume",
  "prepareOwnedMailboxKeyDelete",
  "prepareOwnedMailboxFilters",
]) {
  const helperMatch = runnerSource.match(new RegExp(`async function ${helperName}\\([\\s\\S]*?\\n}`));
  assert.ok(helperMatch, `${helperName} helper must exist`);
  assert.match(
    helperMatch[0],
    /createOwnedManagementMailbox\(fixtureRuntime,/,
    `${helperName} must use createOwnedManagementMailbox so it inherits mailbox readiness polling`,
  );
}

console.log("Live E2E runner contract checks passed.");
