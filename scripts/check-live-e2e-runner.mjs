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
assert.equal(plan.summary.total, 96);
assert.equal(plan.summary.executable, 54);
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
assert.equal(byOperation.get("managementCheckMailboxAvailability")?.status, "executable");
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
assert.equal(gatedPlan.summary.total, 96);
assert.equal(gatedPlan.summary.executable, 96);
assert.equal(gatedPlan.summary.gated, 0);
assert.equal(gatedPlan.summary.blocked, 0);

const runnerSource = readFileSync("scripts/run-live-e2e.mjs", "utf8");
const manifestWriterSource = readFileSync("scripts/write-live-e2e-audit-manifest.mjs", "utf8");
const goLiveE2eSource = readFileSync("go/livee2e/main.go", "utf8");
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
assert.match(
  runnerSource,
  /async function runMailboxStreamSdkOperation[\s\S]*?new AbortController\(\)[\s\S]*?mailboxStreamTimeoutMs\(prepared\.request\)[\s\S]*?signal:\s*controller\.signal[\s\S]*?Promise\.race[\s\S]*?controller\.abort\(\)/,
  "TypeScript stream live E2E must abort hung SSE handshakes with a bounded timeout",
);
assert.match(
  runnerSource,
  /function mailboxStreamTimeoutMs\(request\)[\s\S]*?close_after[\s\S]*?\+ 15\)\s*\* 1_000/,
  "mailboxStreamEvents timeout must include the requested close_after window plus buffer",
);
assert.match(
  runnerSource,
  /function cliTimeoutMsFor\(operation, request\)[\s\S]*?return mailboxStreamTimeoutMs\(request\);/,
  "CLI and TypeScript stream paths must share the same mailboxStreamEvents timeout budget",
);
assert.match(
  runnerSource,
  /runCli\(cliArgs, tempHome, cliTimeoutMsFor\(operation, prepared\.request\), \{\s*SENDMUX_API_KEY:\s*apiKey,\s*SENDMUX_BASE_URL:\s*baseUrl,\s*\}\)/,
  "live E2E CLI invocations must pass credentials through child env, not argv",
);
assert.doesNotMatch(
  runnerSource.match(/async function runCliOperation[\s\S]*?function runCli/)?.[0] ?? "",
  /"--api-key"|"--base-url"/,
  "live E2E CLI argv must not include API keys or base URLs",
);
assert.match(
  runnerSource,
  /const teardownOnce = \(\) => \{[\s\S]*?fixtureRuntime\.teardown\(\)[\s\S]*?installTeardownSignalHandlers\(teardownOnce\)/,
  "live E2E runner must share normal and signal-triggered teardown through one teardown promise",
);
assert.match(
  runnerSource,
  /process\.once\("SIGINT", handleSignal\);[\s\S]*?process\.once\("SIGTERM", handleSignal\);/,
  "live E2E runner must attempt fixture teardown before exiting on SIGINT/SIGTERM",
);
assert.match(
  runnerSource,
  /async function prepareSharedSesLimitRequest[\s\S]*?canCreateSharedSesLimitRequest\(fixtureRuntime\)[\s\S]*?expectedErrorCodes:\s*canRequest \? undefined : \["validation_error", "conflict"\]/,
  "shared SES limit request live E2E must accept the API's unavailable/pending business-rule errors when the limit is not requestable",
);
assert.match(
  runnerSource,
  /async function prepareOwnedSharedSesLimitRequestCancel[\s\S]*?canCreateSharedSesLimitRequest\(fixtureRuntime\)[\s\S]*?expectedErrorCodes:\s*\["not_found"\][\s\S]*?slir_live_e2e_missing_/,
  "shared SES limit cancellation live E2E must use a safe not_found probe when no owned request can be created",
);
assert.match(
  runnerSource,
  /async function canCreateSharedSesLimitRequest[\s\S]*?managementGetSharedAmazonSesLimitRequest[\s\S]*?data\.limit\.can_request_increase/,
  "shared SES requestability must be derived from the dedicated read endpoint",
);
assert.match(
  manifestWriterSource,
  /commitSha:\s*args\.commit\s*\|\|\s*gitSha\(\)/,
  "live E2E audit manifest writer must default blank commit args to git rev-parse HEAD",
);
assert.match(
  manifestWriterSource,
  /generatedAt:\s*args\.generatedAt\s*\|\|\s*new Date\(\)\.toISOString\(\)/,
  "live E2E audit manifest writer must default blank generated-at args to the current timestamp",
);
assert.match(
  manifestWriterSource,
  /source:\s*args\.source\s*\|\|\s*"protected-live-e2e"/,
  "live E2E audit manifest writer must default blank source args to a non-empty source",
);
assert.match(
  manifestWriterSource,
  /assert\.match\(\s*manifest\.run\.generated_at[\s\S]*?Date\.parse\(manifest\.run\.generated_at\)/,
  "live E2E audit manifest validator must reject empty or unparsable generated_at values",
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

assert.match(
  goLiveE2eSource,
  /func appBaseURL\(\) string \{\s*return firstEnvOrDefault\("https:\/\/app\.sendmux\.ai\/api\/v1", "SENDMUX_LIVE_E2E_APP_BASE_URL", "SENDMUX_STAGING_APP_BASE_URL"\)\s*\}/,
  "Go live E2E app base URL must use a real default fallback",
);
assert.match(
  goLiveE2eSource,
  /func sendingBaseURL\(\) string \{\s*return firstEnvOrDefault\("https:\/\/smtp\.sendmux\.ai\/api\/v1", "SENDMUX_LIVE_E2E_SENDING_BASE_URL", "SENDMUX_STAGING_SMTP_BASE_URL"\)\s*\}/,
  "Go live E2E sending base URL must use a real default fallback",
);
assert.doesNotMatch(
  goLiveE2eSource,
  /firstEnv\([^)]*"https:\/\/[^"]+"/,
  "Go live E2E must not pass URL literals to firstEnv",
);
assert.match(
  goLiveE2eSource,
  /func normaliseResult[\s\S]*?if closer, ok := value\.\(io\.Closer\); ok \{\s*defer func\(\) \{\s*_ = closer\.Close\(\)\s*\}\(\)\s*\}[\s\S]*?io\.ReadAll\(reader\)/,
  "Go live E2E stream readers must be closed after reading",
);
assert.match(
  goLiveE2eSource,
  /func readTextResponse[\s\S]*?if closer, ok := value\.\(io\.Closer\); ok \{\s*defer func\(\) \{\s*_ = closer\.Close\(\)\s*\}\(\)\s*\}[\s\S]*?io\.ReadAll\(reader\)/,
  "Go live E2E text readers must be closed after reading",
);

console.log("Live E2E runner contract checks passed.");
