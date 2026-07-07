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
assert.equal(plan.summary.total, 103);
assert.equal(plan.summary.executable, 54);
assert.equal(plan.summary.gated, 49);
assert.equal(plan.summary.blocked, 0);
assert.equal(plan.summary.gatedByRisk.mutation, 30);
assert.equal(plan.summary.gatedByRisk.destructive, 8);
assert.equal(plan.summary.gatedByRisk.binary, 8);
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
assert.equal(byOperation.get("mailboxWaitForMessage")?.status, "gated");
assert.match(byOperation.get("mailboxWaitForMessage")?.reason ?? "", /SENDMUX_LIVE_E2E_MUTATIONS=1/);
assert.equal(byOperation.get("mailboxReadAttachment")?.status, "gated");
assert.match(byOperation.get("mailboxReadAttachment")?.reason ?? "", /SENDMUX_LIVE_E2E_BINARY=1/);
assert.equal(byOperation.get("sendingSendEmail")?.status, "gated");
assert.match(byOperation.get("sendingSendEmail")?.reason ?? "", /SENDMUX_STAGING_SEND=1/);
for (const operationId of [
  "sendingCompleteAttachmentUpload",
  "sendingCreateAttachmentUpload",
  "sendingGetAttachment",
  "sendingUploadAttachment",
]) {
  assert.equal(byOperation.get(operationId)?.status, "gated");
  assert.match(byOperation.get(operationId)?.reason ?? "", /SENDMUX_LIVE_E2E_BINARY=1/);
}
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
assert.equal(gatedPlan.summary.total, 103);
assert.equal(gatedPlan.summary.executable, 103);
assert.equal(gatedPlan.summary.gated, 0);
assert.equal(gatedPlan.summary.blocked, 0);

const runnerSource = readFileSync("scripts/run-live-e2e.mjs", "utf8");
const manifestWriterSource = readFileSync("scripts/write-live-e2e-audit-manifest.mjs", "utf8");
const goLiveE2eSource = readFileSync("go/livee2e/main.go", "utf8");
const phpLiveE2eSource = readFileSync("scripts/live-e2e-php.php", "utf8");
const rubyLiveE2eSource = readFileSync("scripts/live-e2e-ruby.rb", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const liveE2eWorkflowSource = readFileSync(".github/workflows/live-e2e.yml", "utf8");
assert.match(
  runnerSource,
  /const credentials = credentialsForRun\(sdk, selectedOperations\);/,
  "live E2E credentials must be derived from selected operations, not the entire suite",
);
assert.match(
  runnerSource,
  /function requiredKeyKindsFor\(selectedOperations\)[\s\S]*?operation\.surface === "management"[\s\S]*?kinds\.add\("root"\)[\s\S]*?operation\.surface === "sending"[\s\S]*?kinds\.add\("mailbox"\)/,
  "Sending-only live E2E slices must not require a root key",
);
assert.match(
  goLiveE2eSource,
  /clients, err := createClients\(input\.Operations\)/,
  "Go live E2E must derive required credentials from selected operations",
);
assert.match(
  goLiveE2eSource,
  /func createClients\(operations \[\]operation\)[\s\S]*?needed := map\[string\]bool\{\}[\s\S]*?if needed\["management"\][\s\S]*?rootAPIKey\(\)[\s\S]*?if needed\["sending"\][\s\S]*?mailboxAPIKey\(\)/,
  "Go live E2E must not require a root key for Sending-only slices",
);
assert.match(
  phpLiveE2eSource,
  /createAttachmentsApi\(mailboxApiKey\(\), sendingBaseUrl\(\)\)/,
  "PHP live E2E must include the Sending attachments API",
);
assert.match(
  rubyLiveE2eSource,
  /\[client\.attachments, client\.emails, client\.meta\]/,
  "Ruby live E2E must include the Sending attachments API",
);
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
const waitForMessageMatch = runnerSource.match(/async function prepareMailboxWaitForMessage[\s\S]*?\n}/);
assert.ok(waitForMessageMatch, "prepareMailboxWaitForMessage helper must exist");
const readAttachmentMatch = runnerSource.match(/async function prepareMailboxReadAttachment[\s\S]*?\n}/);
assert.ok(readAttachmentMatch, "prepareMailboxReadAttachment helper must exist");
const sendingUploadAttachmentMatch = runnerSource.match(/async function prepareSendingUploadAttachment[\s\S]*?\n}/);
assert.ok(sendingUploadAttachmentMatch, "prepareSendingUploadAttachment helper must exist");
const sendingCreateAttachmentUploadMatch = runnerSource.match(/async function prepareSendingCreateAttachmentUpload[\s\S]*?\n}/);
assert.ok(sendingCreateAttachmentUploadMatch, "prepareSendingCreateAttachmentUpload helper must exist");
const sendingCompleteAttachmentUploadMatch = runnerSource.match(
  /async function prepareSendingCompleteAttachmentUpload[\s\S]*?\n}/,
);
assert.ok(sendingCompleteAttachmentUploadMatch, "prepareSendingCompleteAttachmentUpload helper must exist");
const sendingGetAttachmentMatch = runnerSource.match(/async function prepareSendingGetAttachment[\s\S]*?\n}/);
assert.ok(sendingGetAttachmentMatch, "prepareSendingGetAttachment helper must exist");
assert.match(
  readAttachmentMatch[0],
  /attachment_id:\s*owned\.attachmentId,[\s\S]*?message_id:\s*owned\.messageId/,
  "mailboxReadAttachment live E2E must pass message_id and attachment_id directly to the MCP tool",
);
assert.match(
  readAttachmentMatch[0],
  /data\.text"\), owned\.attachmentContent/,
  "mailboxReadAttachment live E2E must assert server-side text reads",
);
assert.match(
  sendingUploadAttachmentMatch[0],
  /content_base64:[\s\S]*Buffer\.from\(attachment\.content,[\s\S]*?base64/,
  "sendingUploadAttachment MCP live E2E must use token-cheap base64 only for the tiny fixture body",
);
assert.match(
  sendingUploadAttachmentMatch[0],
  /assertSendingAttachmentMetadata/,
  "sendingUploadAttachment live E2E must verify returned attachment metadata",
);
assert.match(
  sendingCreateAttachmentUploadMatch[0],
  /completeSendingAttachmentUploadUrl/,
  "sendingCreateAttachmentUpload live E2E must verify the delegated upload URL is usable",
);
assert.match(
  sendingCompleteAttachmentUploadMatch[0],
  /X-Sendmux-Upload-Token/,
  "sendingCompleteAttachmentUpload live E2E must pass the short-lived upload token header",
);
assert.match(
  sendingGetAttachmentMatch[0],
  /uploadOwnedSendingAttachment[\s\S]*?attachment_id:\s*attachment\.attachmentId/,
  "sendingGetAttachment live E2E must read metadata for an owned uploaded attachment",
);
assert.match(
  runnerSource,
  /async function assertSendingAttachmentMetadata[\s\S]*?sendingGetAttachment/,
  "Sending attachment upload live E2E must re-read uploaded metadata through sendingGetAttachment",
);
assert.match(
  waitForMessageMatch[0],
  /const after = new Date\(Date\.now\(\) - 60_000\)\.toISOString\(\);[\s\S]*?\bsubject,[\s\S]*?timeout_seconds:\s*5/,
  "mailboxWaitForMessage live E2E must filter by a supported subject plus an after checkpoint",
);
assert.doesNotMatch(
  waitForMessageMatch[0],
  /message_id:/,
  "mailboxWaitForMessage live E2E must not pass unsupported message_id tool arguments",
);
assert.doesNotMatch(
  waitForMessageMatch[0],
  /data\.message\.id/,
  "mailboxWaitForMessage live E2E must not assume sent and received self-mail message IDs match",
);
assert.match(
  waitForMessageMatch[0],
  /data\.message\.subject"\), subject/,
  "mailboxWaitForMessage live E2E must identify the owned self-mail message by subject",
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
  /const sdkOperationTimeoutMs = 60_000;/,
  "live E2E in-process SDK calls must use a bounded timeout",
);
assert.match(
  runnerSource,
  /async function runBoundedSdkOperation[\s\S]*?withAbortSignal\([\s\S]*?sdkOperation\(\{[\s\S]*?signal,[\s\S]*?sdkOperationTimeoutMs/,
  "live E2E in-process SDK calls must pass an abort signal through the generated SDK",
);
assert.match(
  runnerSource,
  /const response = await runBoundedSdkOperation\(\{[\s\S]*?client,[\s\S]*?operation,[\s\S]*?request: prepared\.request,[\s\S]*?sdkOperation,[\s\S]*?\}\);/,
  "TypeScript SDK live E2E operations must use the bounded SDK runner",
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
  /const fixtureTeardownTimeoutMs = 30_000;/,
  "live E2E runner must bound fixture teardown cleanup calls",
);
assert.match(
  runnerSource,
  /async teardown\(\)[\s\S]*?for \(const cleanup of teardowns\.reverse\(\)\)[\s\S]*?withTimeout\([\s\S]*?cleanup\(\)[\s\S]*?fixtureTeardownTimeoutMs/,
  "live E2E fixture teardown must wrap each cleanup in the bounded timeout helper",
);
assert.match(
  runnerSource,
  /function withTimeout\(promise, timeoutMs, message\)[\s\S]*?Promise\.race[\s\S]*?timeout\.unref\?\.\(\)[\s\S]*?clearTimeout\(timeout\)/,
  "live E2E runner must implement a non-blocking timeout helper for cleanup",
);
assert.match(
  runnerSource,
  /function fetchWithTimeout\(input, label, init = \{\}\)[\s\S]*?withAbortSignal\([\s\S]*?fetch\(input, \{ \.\.\.init, signal \}\)[\s\S]*?presignedFetchTimeoutMs/,
  "live E2E presigned URL fetch checks must use abortable bounded fetch",
);
assert.match(
  runnerSource,
  /function withAbortSignal\(run, timeoutMs, message\)[\s\S]*?new AbortController\(\)[\s\S]*?setTimeout\([\s\S]*?controller\.abort\(\)[\s\S]*?timeout\.unref\?\.\(\)[\s\S]*?clearTimeout\(timeout\)/,
  "live E2E runner must implement abortable timeouts for HTTP requests",
);
assert.match(
  runnerSource,
  /async function assertPresignedAttachmentDownload[\s\S]*?fetchWithTimeout\(downloadUrl, "presigned attachment download"\)/,
  "presigned attachment download assertions must use bounded fetch",
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
assert.ok(
  packageJson.scripts["build:live-e2e-surfaces"],
  "live E2E workflow must use a dedicated build target that can run before the audit manifest refresh",
);
assert.doesNotMatch(
  packageJson.scripts["build:live-e2e-surfaces"],
  /check:live-e2e/,
  "live E2E surface build must not validate the stale audit manifest before refreshing it",
);
assert.match(
  liveE2eWorkflowSource,
  /run:\s*pnpm build:live-e2e-surfaces/,
  "live E2E workflow must avoid top-level pnpm build so audit-manifest refreshes are not self-blocking",
);
assert.doesNotMatch(
  liveE2eWorkflowSource,
  /run:\s*pnpm build\s*(?:\r?\n|$)/,
  "live E2E workflow must not run top-level pnpm build before writing the audit manifest",
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
assert.match(
  goLiveE2eSource,
  /context\.WithTimeout\(context\.Background\(\), operationTimeout\(op\)\)/,
  "Go live E2E calls must derive request timeouts from the operation",
);
assert.match(
  goLiveE2eSource,
  /func operationTimeout\(op operation\) time\.Duration[\s\S]*?op\.OperationID != "mailboxStreamEvents"[\s\S]*?45 \* time\.Second[\s\S]*?intValue\(op\.Request\.Query\["close_after"\], 30\)[\s\S]*?closeAfter\+20/,
  "Go live E2E stream timeout must include close_after plus a live-network buffer",
);
assert.match(
  phpLiveE2eSource,
  /\$timeout = operationTimeout\(\$operation\);[\s\S]*?new \\GuzzleHttp\\Client\(\['timeout' => \$timeout\]\)[\s\S]*?\$client->send\(\$request, \['timeout' => \$timeout\]\)/,
  "PHP live E2E raw requests must use the operation timeout consistently",
);
assert.match(
  phpLiveE2eSource,
  /function operationTimeout\(array \$operation\): int[\s\S]*?\$operation\['operationId'\][\s\S]*?mailboxStreamEvents[\s\S]*?return 40;[\s\S]*?\$operation\['request'\]\['query'\]\['close_after'\][\s\S]*?return \$closeAfter \+ 20;/,
  "PHP live E2E stream timeout must include close_after plus a live-network buffer",
);

console.log("Live E2E runner contract checks passed.");
