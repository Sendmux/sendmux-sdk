#!/usr/bin/env node

import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { configurationFromEnv, expectedPairs, journalSelectors, validateResultPairs } from "./live-e2e-contract.mjs";

const operationsPath = "packages/ts/cli/src/generated/operations.ts";
const scenarioPath = "test/live-e2e/scenarios.json";
const fixtureRegistryPath = "test/live-e2e/fixtures.json";
const cliPath = "packages/ts/cli/bin/run.js";
const mcpPython = join(".tmp", "python-venv", "bin", "python");
const typescriptSdkAdapter = "typescript";
const sdkAdapters = [typescriptSdkAdapter, "python", "go", "php", "ruby"];
const validAdapters = new Set(["sdk", ...sdkAdapters, "cli", "mcp"]);
const executionEnvName = "SENDMUX_LIVE_E2E";
const fixtureSetupEnvName = "SENDMUX_LIVE_E2E_FIXTURE_SETUP";
const fixtureSendAllowlistEnvName = "SENDMUX_LIVE_E2E_FIXTURE_SEND_TO";
const fixtureWebhookUrlAllowlistEnvName = "SENDMUX_LIVE_E2E_WEBHOOK_URL_ALLOWLIST";
const mutationGateEnvName = "SENDMUX_LIVE_E2E_MUTATIONS";
const binaryGateEnvName = "SENDMUX_LIVE_E2E_BINARY";
const streamGateEnvName = "SENDMUX_LIVE_E2E_STREAM";
const sendGateEnvName = "SENDMUX_STAGING_SEND";
const progressEnvName = "SENDMUX_LIVE_E2E_PROGRESS";
const childHarnessTimeoutMs = 90_000;
const sdkOperationTimeoutMs = 60_000;
const adapterOperationTimeoutMs = 120_000;
const presignedFetchTimeoutMs = 30_000;
const fixtureTeardownTimeoutMs = 30_000;
const cancellationScope = new AsyncLocalStorage();
const activeOperations = new Map();
const activeChildren = new Map();
const shutdownGraceMs = 5_000;
let stopping = false;
let unconfirmedActiveWork = false;
class UnmetPrecondition extends Error {}
class UnconfirmedCancellation extends Error {}
const managementMailboxIdSelectors = ["data.mailbox.id"];
const managementMailboxKeyIdSelectors = ["data.credential.public_id"];
const managementMailboxKeySecretSelectors = ["data.credential.secret"];
const mailboxCredentialVisibilityRetryDelaysMs = [0, 250, 500, 1_000, 2_000, 4_000, 8_000, 15_000];
const customMcpOperations = [
  {
    bodyKind: "json",
    commandKeyKind: "mailbox",
    requiredKeyKind: "mailbox",
    customMcpOnly: true,
    description: "Read a mailbox attachment through the curated MCP server.",
    headerParams: [],
    method: "mcp",
    operationId: "mailboxReadAttachment",
    path: "mcp://mailbox_read_attachment",
    pathParams: [],
    queryParams: [],
    requestBodyRequired: false,
    responseKind: "json",
    surface: "mailbox",
  },
  {
    bodyKind: "json",
    commandKeyKind: "mailbox",
    requiredKeyKind: "mailbox",
    customMcpOnly: true,
    description: "Wait briefly for a mailbox message through the curated MCP server.",
    headerParams: [],
    method: "mcp",
    operationId: "mailboxWaitForMessage",
    path: "mcp://mailbox_wait_for_message",
    pathParams: [],
    queryParams: [],
    requestBodyRequired: false,
    responseKind: "json",
    surface: "mailbox",
  },
];
const operationRequestFactories = {
  mailboxBatchDeleteMessages: prepareOwnedMailboxBatchDelete,
  mailboxBatchGetMessages: prepareOwnedMailboxBatchGet,
  mailboxBatchUpdateMessages: prepareOwnedMailboxBatchUpdate,
  mailboxCreateAttachmentUpload: prepareMailboxCreateAttachmentUpload,
  mailboxCreateFolder: prepareMailboxCreateFolder,
  mailboxDeleteFolder: prepareOwnedMailboxDeleteFolder,
  mailboxDeleteMessage: prepareOwnedMailboxDeleteMessage,
  mailboxGetMessageAttachment: prepareMailboxGetMessageAttachment,
  mailboxReadAttachment: prepareMailboxReadAttachment,
  mailboxWaitForMessage: prepareMailboxWaitForMessage,
  mailboxSendMessage: prepareMailboxSendMessage,
  mailboxStreamEvents: prepareMailboxStreamEvents,
  mailboxUpdateFolder: prepareOwnedMailboxUpdateFolder,
  mailboxUpdateIdentity: prepareMailboxUpdateIdentity,
  mailboxUpdateMessage: prepareOwnedMailboxUpdateMessage,
  mailboxUploadAttachment: prepareMailboxUploadAttachment,
  managementActivateProvider: prepareOwnedProviderActivate,
  managementCancelSharedAmazonSesLimitRequest: prepareOwnedSharedSesLimitRequestCancel,
  managementCreateDomain: prepareManagementCreateDomain,
  managementCreateMailbox: prepareManagementCreateMailbox,
  managementCreateMailboxKey: prepareManagementCreateMailboxKey,
  managementCreateProvider: prepareManagementCreateProvider,
  managementCreateSharedAmazonSesLimitRequest: prepareSharedSesLimitRequest,
  managementCreateWebhook: prepareManagementCreateWebhook,
  managementDeactivateProvider: prepareOwnedProviderDeactivate,
  managementDeleteDomain: prepareOwnedDomainDelete,
  managementDeleteMailbox: prepareOwnedMailboxDelete,
  managementDeleteMailboxKey: prepareOwnedMailboxKeyDelete,
  managementDeleteProvider: prepareOwnedProviderDelete,
  managementDeleteWebhook: prepareOwnedWebhookDelete,
  managementRequestSendingAccountLimitIncrease: prepareSendingAccountLimitRequest,
  managementResumeMailbox: prepareOwnedMailboxResume,
  managementRotateWebhookSecret: prepareOwnedWebhookRotateSecret,
  managementSetDomainFilters: prepareOwnedDomainFilters,
  managementSetMailboxFilters: prepareOwnedMailboxFilters,
  managementSuspendMailbox: prepareOwnedMailboxSuspend,
  managementTestProvider: prepareOwnedProviderTest,
  managementTestWebhook: prepareOwnedWebhookTest,
  managementUpdateDomain: prepareOwnedDomainUpdate,
  managementUpdateMailbox: prepareOwnedMailboxUpdate,
  managementUpdateProvider: prepareOwnedProviderUpdate,
  managementUpdateWebhook: prepareOwnedWebhookUpdate,
  managementVerifyDomain: prepareOwnedDomainVerify,
  sendingCompleteAttachmentUpload: prepareSendingCompleteAttachmentUpload,
  sendingCreateAttachmentUpload: prepareSendingCreateAttachmentUpload,
  sendingGetAttachment: prepareSendingGetAttachment,
  sendingSendEmail: prepareSendingSendEmail,
  sendingSendEmailBatch: prepareSendingSendEmailBatch,
  sendingUploadAttachment: prepareSendingUploadAttachment,
};

const operations = [...loadOperations(), ...customMcpOperations].sort((left, right) =>
  left.operationId.localeCompare(right.operationId),
);
const scenarios = readJson(scenarioPath).scenarios ?? {};
const fixtures = readJson(fixtureRegistryPath);

export async function runLiveE2E(argv = process.argv.slice(2)) {
stopping = false;
unconfirmedActiveWork = false;
const args = parseArgs(argv);
const operationPlan = buildOperationPlan(operations, scenarios, fixtures);
const adapters = normaliseAdapters(args.adapters.length > 0 ? args.adapters : ["sdk", "cli", "mcp"]);
const selectedOperations = selectOperations(operationPlan, args.operations, adapters);

if (args.help) {
  printHelp();
  return;
}

if (args.plan) {
  printPlan(operationPlan, selectedOperations, scenarios, adapters, args.json);
  return;
}

if (process.env[executionEnvName] !== "1") {
  throw new Error(`Live E2E execution is protected. Set ${executionEnvName}=1 or run with --plan.`);
}

assertLivePlatform();
assertAdapters(adapters);
assertAllScenariosExist(selectedOperations, scenarios);
assertBuiltArtifacts(adapters);

const sdk = await import("@sendmux/sdk");
const credentials = credentialsForRun(sdk, selectedOperations);
const sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
assert.match(sourceSha, /^[0-9a-f]{40}$/);
assert.equal(spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout.trim(), "", "Live certification requires a clean source checkout");
const runId = process.env.SENDMUX_LIVE_E2E_RUN_ID || randomUUID();
assert.match(runId, /^[a-zA-Z0-9_-]+$/, "Invalid run ID");
const runDirectory = join(".tmp", "live-e2e", runId);
mkdirSync(dirname(runDirectory), { recursive: true });
mkdirSync(runDirectory);
const startedAt = new Date().toISOString();
const fixtureRuntime = createFixtureRuntime({ credentials, fixtures, operations, runId, sdk });
const results = [];
const errors = [];
let cleanupOk = true;
let teardownPromise;
const teardownOnce = () => {
  teardownPromise ??= fixtureRuntime.teardown();
  return teardownPromise;
};
const removeSignalHandlers = installTeardownSignalHandlers();

try {
  await fixtureRuntime.preflight();
  for (const operation of selectedOperations) {
    for (const adapter of adapters) {
      if (stopping) throw new Error("Live E2E interrupted");
      results.push(
        ...(await runAdapterStep({
          adapter,
          credentials,
          fixtureRuntime,
          fixtures,
          operation,
          sdk,
        })),
      );
    }
  }
} catch (error) {
  errors.push(errorMessage(error));
} finally {
  try {
    await teardownOnce();
  } catch (error) {
    cleanupOk = false;
    errors.push(errorMessage(error));
  }
}

const pairs = expectedPairs(selectedOperations.map(item => item.operationId), adapters, scenarios);
for (const pair of pairs) {
  if (!results.some(item => item.adapter === pair.adapter && item.operationId === pair.operationId)) results.push({ adapter: pair.adapter, operationId: pair.operationId, status: pair.applicable ? "unmet_precondition" : "inapplicable", reason: "Runner stopped before this pair" });
}
validateResultPairs(results, pairs);
const failed = results.filter(result => ["failed", "unmet_precondition"].includes(result.status));
const report = { ok: failed.length === 0 && cleanupOk && errors.length === 0, errors, results, run: {
  id: runId, source_sha: sourceSha, started_at: startedAt, ended_at: new Date().toISOString(),
  operation_ids: selectedOperations.map(item => item.operationId), adapters,
  applicable_pairs: pairs.filter(pair => pair.applicable).map(({ applicable, ...pair }) => pair),
  configuration: configurationFromEnv(process.env), fixture_proof: fixtureRuntime.proof ?? {},
  cleanup: { ok: cleanupOk, ...fixtureRuntime.ledger },
} };
await finishLiveRun(report, runDirectory);
removeSignalHandlers();
console.log(JSON.stringify(report, null, 2));
if (!report.ok && !process.exitCode) process.exitCode = 1;
return report;
}

export async function finishLiveRun(report, runDirectory) {
  if (unconfirmedActiveWork) {
    report.ok = false;
    report.run.cleanup.ok = false;
    report.run.cleanup.status = "blocked_active_work";
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(join(runDirectory, "resources.json"), `${JSON.stringify({ ...report.run.cleanup, runId: report.run.id, status: "incomplete" }, null, 2)}\n`, { mode: 0o600, flush: true });
    writeFileSync(join(runDirectory, "result.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flush: true });
    const retainedChildren = [...activeChildren.values()]
      .filter(child => child.recoveryDirectory)
      .map(child => ({ pid: child.pid, directory: child.recoveryDirectory, status: "unconfirmed" }));
    if (retainedChildren.length) {
      writeFileSync(join(runDirectory, "child-recovery.json"), `${JSON.stringify({ status: "incomplete", children: retainedChildren }, null, 2)}\n`, { mode: 0o600, flush: true });
    }
    report.errors ??= [];
    // The cancellation grace has expired; signal delivery is not proof of close.
    for (const child of activeChildren.values()) {
      child.forceTerminate();
      report.errors.push(`Owned child ${child.pid} shutdown unconfirmed after cancellation grace`);
      for (const failure of child.signalErrors) report.errors.push(`Owned child ${child.pid} ${failure.signal} failed: ${failure.code}`);
    }
  }
  writeFileSync(join(runDirectory, "result.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flush: true });
  if (unconfirmedActiveWork) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runLiveE2E();
}

export { createFixtureRuntime, runAdapterStep, runLanguageSdkOperations, runMcpOperations,
  runChildHarness, withAbortSignal, fetchWithTimeout, installTeardownSignalHandlers, expectedCliErrorMatches, selectOperations, buildOperationPlan,
  operations, scenarios, fixtures };

async function runAdapterStep({ adapter, credentials, fixtureRuntime, fixtures, operation, sdk }) {
  const startedAt = Date.now();
  reportProgress("adapter_step_start", { adapter, operationId: operation.operationId });
  try {
    const stepResults = await withAbortSignal(
      () => runAdapterStepInner({ adapter, credentials, fixtureRuntime, fixtures, operation, sdk }),
      adapterOperationTimeoutMs,
      `${adapter}:${operation.operationId} timed out after ${adapterOperationTimeoutMs}ms`,
    );
    reportProgress("adapter_step_end", {
      adapter,
      duration_ms: Date.now() - startedAt,
      operationId: operation.operationId,
      status: "completed",
    });
    return stepResults;
  } catch (error) {
    reportProgress("adapter_step_end", {
      adapter,
      duration_ms: Date.now() - startedAt,
      error: errorMessage(error),
      operationId: operation.operationId,
      status: "failed",
    });
    return [failResult(adapter, operation.operationId, error)];
  }
}

async function runAdapterStepInner({ adapter, credentials, fixtureRuntime, fixtures, operation, sdk }) {
  if (operation.customMcpOnly && adapter !== "mcp") {
    return [
      {
        adapter,
        operationId: operation.operationId,
        reason: "custom MCP-only operation",
        status: "inapplicable",
      },
    ];
  }

  if (adapter === "mcp" && !isMcpCurated(operation)) {
    return [skippedMcpResult(operation)];
  }

  const prepared = await safeRequestOptionsFor({ adapter, fixtureRuntime, fixtures, operation });
  if (!prepared.ok) {
    return [failResult(adapter, operation.operationId, prepared.error)];
  }
  if (operation.responseKind === "json") prepared.value.observeResult = value => fixtureRuntime.observeResult(operation.operationId, prepared.value.request, value);
  fixtureRuntime.beginOperation(operation.operationId, prepared.value.request);
  prepared.value.journalPath = fixtureRuntime.journalPath(adapter, operation.operationId);
  prepared.value.recoverJournal = () => fixtureRuntime.recoverJournal(prepared.value.journalPath, operation.operationId, prepared.value.request);

  if (adapter === typescriptSdkAdapter) {
    return [await runSdkOperation({ credentials, operation, prepared: prepared.value, sdk })];
  }

  if (adapter === "cli") {
    return [await runCliOperation({ credentials, operation, prepared: prepared.value })];
  }

  if (adapter === "mcp") {
    return runMcpOperations({
      credentials,
      operations: [operation],
      requests: new Map([[operation.operationId, prepared.value]]),
    });
  }

  return runLanguageSdkOperations({
    adapter,
    credentials,
    operations: [operation],
    requests: new Map([[operation.operationId, prepared.value]]),
  });
}

function parseArgs(argv) {
  const parsed = {
    adapters: [],
    help: false,
    json: false,
    operations: [],
    plan: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--plan") {
      parsed.plan = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--adapter") {
      const value = requireArgValue(argv, index, arg);
      index += 1;
      parsed.adapters.push(...value.split(",").filter(Boolean));
      continue;
    }
    if (arg === "--operation") {
      const value = requireArgValue(argv, index, arg);
      index += 1;
      parsed.operations.push(...value.split(",").filter(Boolean));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function installTeardownSignalHandlers() {
  let isHandlingSignal = false;
  const handleSignal = (signal) => {
    if (isHandlingSignal) {
      return;
    }
    isHandlingSignal = true;
    stopping = true;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    for (const controller of activeOperations.keys()) controller.abort(new Error(`Interrupted by ${signal}`));
    for (const child of activeChildren.values()) child.terminate();
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  return () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  };
}

function requireArgValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/run-live-e2e.mjs [--plan] [--json] [--adapter sdk,cli,mcp] [--operation operationId]

Runs the protected live E2E suite for operations with safe executable fixtures. Normal CI should keep using pnpm check:live-e2e.

Execution requires:
  SENDMUX_LIVE_E2E=1
  SENDMUX_LIVE_E2E_ROOT_API_KEY or SENDMUX_STAGING_ROOT_API_KEY
  SENDMUX_LIVE_E2E_MAILBOX_API_KEY or SENDMUX_STAGING_MAILBOX_API_KEY

Optional:
  SENDMUX_LIVE_E2E_APP_BASE_URL or SENDMUX_STAGING_APP_BASE_URL
  SENDMUX_LIVE_E2E_SENDING_BASE_URL or SENDMUX_STAGING_SMTP_BASE_URL
  SENDMUX_LIVE_E2E_ALLOWED_APP_BASE_URLS
  SENDMUX_LIVE_E2E_ALLOWED_SENDING_BASE_URLS
  SENDMUX_LIVE_E2E_DOMAIN_NAME defaults to dev.sendmux.app
  SENDMUX_LIVE_E2E_* fixture ID overrides listed in ${fixtureRegistryPath}`);
  console.log(`
Optional fixture setup:
  SENDMUX_LIVE_E2E_FIXTURE_SETUP=1
  SENDMUX_LIVE_E2E_FIXTURE_SEND_TO comma-separated recipient allowlist
  SENDMUX_LIVE_E2E_WEBHOOK_URL
  SENDMUX_LIVE_E2E_WEBHOOK_URL_ALLOWLIST comma-separated URL allowlist`);
}

function loadOperations() {
  const source = readFileSync(operationsPath, "utf8");
  const match = source.match(/export const operations = ([\s\S]*?) as const satisfies/);
  if (!match) {
    throw new Error("Could not parse CLI operation manifest");
  }

  return Object.values(Function(`"use strict"; return (${match[1]});`)()).sort((left, right) =>
    left.operationId.localeCompare(right.operationId),
  );
}

function buildOperationPlan(operations, scenarios, fixtures) {
  return operations.map((operation) => {
    const scenario = scenarios[operation.operationId];
    const reason = blockedReasonFor({ operation, scenario });
    const missingGates = reason ? [] : missingExecutionGates(scenario);
    return {
      missingGates,
      operation,
      reason: reason ?? (missingGates.length > 0 ? `missing gates: ${missingGates.join(", ")}` : null),
      status: reason ? "blocked" : missingGates.length > 0 ? "gated" : "executable",
    };
  });
}

function blockedReasonFor({ operation, scenario }) {
  if (!scenario) {
    return "missing live E2E scenario";
  }
  if (scenario.risk !== "read") {
    return operationHasExecutableFixture(operation.operationId)
      ? null
      : `missing owned fixture support for ${scenario.mode}`;
  }
  if (scenario.mode === "read") {
    return null;
  }
  if (scenario.mode === "read_fixture") {
    const registryEntry = fixtures.operations?.[operation.operationId];
    return isValidFixtureRegistryEntry(operation, registryEntry)
      ? null
      : `missing executable fixture registry entry in ${fixtureRegistryPath}`;
  }
  return `requires ${scenario.gates.join(" and ") || `${scenario.mode} fixture support`}`;
}

function missingExecutionGates(scenario) {
  return gateEnvRequirements(scenario).filter(({ name, value }) => process.env[name] !== value).map(formatGate);
}

function gateEnvRequirements(scenario) {
  const requirements = new Map();
  for (const gate of scenario?.gates ?? []) {
    const match = gate.match(/^([A-Z0-9_]+)=(.+)$/);
    if (match) {
      requirements.set(match[1], match[2]);
    }
  }
  if (scenario?.risk === "mutation" || scenario?.risk === "destructive") {
    requirements.set(mutationGateEnvName, "1");
  }
  if (scenario?.risk === "binary") {
    requirements.set(binaryGateEnvName, "1");
  }
  if (scenario?.risk === "stream") {
    requirements.set(streamGateEnvName, "1");
  }
  if (scenario?.risk === "send") {
    requirements.set(sendGateEnvName, "1");
  }
  return [...requirements.entries()].map(([name, value]) => ({ name, value }));
}

function formatGate({ name, value }) {
  return `${name}=${value}`;
}

function operationHasExecutableFixture(operationId) {
  return Object.hasOwn(operationRequestFactories, operationId) || Object.hasOwn(fixtures.operations ?? {}, operationId);
}

function isValidFixtureRegistryEntry(operation, entry) {
  if (!entry || typeof entry !== "object" || entry.ownership !== "discovered-read") {
    return false;
  }

  for (const parameter of operation.pathParams) {
    if (!entry.inputs?.path?.[parameter.name]) {
      return false;
    }
  }

  for (const parameter of operation.queryParams.filter((item) => item.required)) {
    if (!entry.inputs?.query?.[parameter.name]) {
      return false;
    }
  }

  return true;
}

function selectOperations(plan, requestedIds, adapters = normaliseAdapters(["sdk", "cli", "mcp"])) {
  const executable = plan
    .filter((entry) => entry.status === "executable" && expectedPairs([entry.operation.operationId], adapters, scenarios).some(pair => pair.applicable))
    .map((entry) => entry.operation);
  if (requestedIds.length === 0) {
    return executable;
  }

  const plannedById = new Map(plan.map((entry) => [entry.operation.operationId, entry]));
  return requestedIds.map((operationId) => {
    const entry = plannedById.get(operationId);
    if (!entry) {
      throw new Error(`${operationId} is not present in the OpenAPI operation manifest.`);
    }
    if (entry.status !== "executable") {
      throw new Error(`${operationId} is ${entry.status}: ${entry.reason}`);
    }
    return entry.operation;
  });
}

function printPlan(plan, selectedOperations, scenarios, adapters, json) {
  if (json) {
    console.log(JSON.stringify(jsonPlan(plan, selectedOperations, adapters), null, 2));
    return;
  }

  const bySurface = new Map();
  for (const operation of selectedOperations) {
    const list = bySurface.get(operation.surface) ?? [];
    list.push(operation);
    bySurface.set(operation.surface, list);
  }

  const blocked = plan.filter((entry) => entry.status === "blocked");
  const gated = plan.filter((entry) => entry.status === "gated");
  console.log("Protected live E2E plan:");
  console.log(`- Adapters: ${adapters.join(", ")}`);
  console.log(`- Executable operations: ${selectedOperations.length}`);
  console.log(`- Gated operations: ${gated.length}`);
  console.log(`- Blocked operations: ${blocked.length}`);
  for (const [surface, list] of [...bySurface.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- ${surface}: ${list.length}`);
    for (const operation of list) {
      const mcp = scenarios[operation.operationId]?.adapters?.mcp;
      console.log(`  - ${operation.operationId}${mcp ? ` (MCP ${mcp})` : ""}`);
    }
  }
  if (gated.length > 0) {
    console.log("- Gated:");
    for (const entry of gated) {
      console.log(`  - ${entry.operation.operationId}: ${entry.reason}`);
    }
  }
  if (blocked.length > 0) {
    console.log("- Blocked:");
    for (const entry of blocked) {
      console.log(`  - ${entry.operation.operationId}: ${entry.reason}`);
    }
  }
}

function jsonPlan(plan, selectedOperations, adapters) {
  const blockedByRisk = {};
  const gatedByRisk = {};
  for (const entry of plan.filter((item) => item.status === "blocked")) {
    const risk = scenarios[entry.operation.operationId]?.risk ?? "missing";
    blockedByRisk[risk] = (blockedByRisk[risk] ?? 0) + 1;
  }
  for (const entry of plan.filter((item) => item.status === "gated")) {
    const risk = scenarios[entry.operation.operationId]?.risk ?? "missing";
    gatedByRisk[risk] = (gatedByRisk[risk] ?? 0) + 1;
  }

  return {
    ok: true,
    adapters,
    selectedOperationIds: selectedOperations.map(operation => operation.operationId),
    applicablePairs: expectedPairs(selectedOperations.map(operation => operation.operationId), adapters, scenarios).filter(pair => pair.applicable).map(({ applicable, ...pair }) => pair),
    summary: {
      blocked: plan.filter((entry) => entry.status === "blocked").length,
      blockedByRisk,
      executable: plan.filter((entry) => entry.status === "executable").length,
      gated: plan.filter((entry) => entry.status === "gated").length,
      gatedByRisk,
      total: plan.length,
    },
    operations: plan.map((entry) =>
      dropEmpty({
        mode: scenarios[entry.operation.operationId]?.mode,
        operationId: entry.operation.operationId,
        reason: entry.reason,
        responseKind: entry.operation.responseKind,
        risk: scenarios[entry.operation.operationId]?.risk,
        status: entry.status,
        surface: entry.operation.surface,
      }),
    ),
    sources: Object.entries(fixtures.sources ?? {}).map(([name, source]) =>
      dropEmpty({
        env: source.env,
        name,
        operationId: source.operationId,
        setupGates: source.setup?.gates,
        surface: source.surface,
      }),
    ),
  };
}

function assertAdapters(adapters) {
  for (const adapter of adapters) {
    if (!validAdapters.has(adapter)) {
      throw new Error(`Unknown live E2E adapter "${adapter}". Expected one of: ${[...validAdapters].join(", ")}`);
    }
  }
}

function normaliseAdapters(input) {
  const out = [];
  for (const adapter of input) {
    const expanded = adapter === "sdk" ? sdkAdapters : [adapter];
    for (const item of expanded) {
      if (!out.includes(item)) {
        out.push(item);
      }
    }
  }
  assertAdapters(out);
  return out;
}

function assertAllScenariosExist(selectedOperations, scenarios) {
  const missing = selectedOperations.filter((operation) => !scenarios[operation.operationId]);
  if (missing.length > 0) {
    throw new Error(`Missing live E2E scenarios: ${missing.map((operation) => operation.operationId).join(", ")}`);
  }
}

function assertBuiltArtifacts(adapters) {
  if (
    (adapters.includes(typescriptSdkAdapter) || adapters.includes("cli")) &&
    !existsSync("packages/ts/sdk/dist/index.js")
  ) {
    throw new Error("Missing TypeScript SDK build output. Run `pnpm build` or `pnpm -r --if-present build` first.");
  }
  if (adapters.includes("cli") && !existsSync("packages/ts/cli/dist/index.js")) {
    throw new Error("Missing TypeScript CLI build output. Run `pnpm --filter @sendmux/cli build` first.");
  }
  if (adapters.includes("mcp") && !existsSync(mcpPython)) {
    throw new Error("Missing MCP Python venv. Run `pnpm build:mcp` first.");
  }
  if (adapters.includes("php") && !existsSync("vendor/autoload.php")) {
    throw new Error("Missing PHP Composer autoload. Run `pnpm build:php` first.");
  }
}

function credentialsForRun(sdk, selectedOperations) {
  const requiredKeyKinds = requiredKeyKindsFor(selectedOperations);
  const rootApiKey = envValue("SENDMUX_LIVE_E2E_ROOT_API_KEY", "SENDMUX_STAGING_ROOT_API_KEY");
  const mailboxApiKey = envValue("SENDMUX_LIVE_E2E_MAILBOX_API_KEY", "SENDMUX_STAGING_MAILBOX_API_KEY");
  const appBaseUrl = envValue("SENDMUX_LIVE_E2E_APP_BASE_URL", "SENDMUX_STAGING_APP_BASE_URL") ?? "https://app.sendmux.ai/api/v1";
  const sendingBaseUrl =
    envValue("SENDMUX_LIVE_E2E_SENDING_BASE_URL", "SENDMUX_STAGING_SMTP_BASE_URL") ??
    "https://smtp.sendmux.ai/api/v1";

  if (requiredKeyKinds.has("root") && !rootApiKey) {
    throw new Error("Missing SENDMUX_LIVE_E2E_ROOT_API_KEY or SENDMUX_STAGING_ROOT_API_KEY.");
  }
  if (requiredKeyKinds.has("mailbox") && !mailboxApiKey) {
    throw new Error("Missing SENDMUX_LIVE_E2E_MAILBOX_API_KEY or SENDMUX_STAGING_MAILBOX_API_KEY.");
  }

  if (rootApiKey) {
    sdk.core.assertApiKeyKind(rootApiKey, "root");
  }
  if (mailboxApiKey) {
    sdk.core.assertApiKeyKind(mailboxApiKey, "mailbox");
  }
  assertAllowedBaseUrl("app", appBaseUrl, defaultAllowedAppBaseUrls());
  assertAllowedBaseUrl("sending", sendingBaseUrl, defaultAllowedSendingBaseUrls());

  return {
    appBaseUrl,
    mailboxApiKey,
    rootApiKey,
    sendingBaseUrl,
  };
}

function requiredKeyKindsFor(selectedOperations) {
  const kinds = new Set();
  for (const operation of selectedOperations) {
    if (operation.requiredKeyKind === "none") {
      continue;
    }
    if (operation.requiredKeyKind === "root") {
      kinds.add("root");
      continue;
    }
    if (operation.requiredKeyKind === "mailbox" || operation.requiredKeyKind === "sending") {
      kinds.add("mailbox");
    }
  }
  return kinds;
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return undefined;
}

function assertAllowedBaseUrl(label, value, defaults) {
  const envName = `SENDMUX_LIVE_E2E_ALLOWED_${label.toUpperCase()}_BASE_URLS`;
  const configured = process.env[envName]?.trim();
  const allowed = new Set(parseCsv(configured ? configured : defaults.join(",")));
  if (!allowed.has(value)) {
    throw new Error(`${label} base URL ${value} is not allowlisted by ${envName}.`);
  }
}

function defaultAllowedAppBaseUrls() {
  return ["https://app.sendmux.ai/api/v1", "http://127.0.0.1:3000/api/v1", "http://localhost:3000/api/v1"];
}

function defaultAllowedSendingBaseUrls() {
  return ["https://smtp.sendmux.ai/api/v1"];
}

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function runSdkOperation({ credentials, operation, prepared, sdk }) {
  try {
    const client = sdkClientFor({ credentials, operation, sdk });
    const module = sdk[operation.surface];
    const sdkOperation = module?.[operation.operationId];
    assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);

    if (operation.operationId === "mailboxStreamEvents") {
      const { response, value } = await runMailboxStreamSdkOperation({ client, prepared, sdkOperation });
      assertPreparedResponse(value, operation, prepared);
      await prepared.afterResult?.(value);
      return passResult(typescriptSdkAdapter, operation.operationId, response.response?.status);
    }

    const response = await runBoundedSdkOperation({
      client,
      operation,
      request: prepared.request,
      onResponse: response => prepared.observeResult?.(response.data),
      sdkOperation,
    });
    const value = response.data;
    prepared.observeResult?.(value);
    assertPreparedResponse(value, operation, prepared);
    await prepared.afterResult?.(value);

    return { ...passResult(typescriptSdkAdapter, operation.operationId, response.response?.status), status: prepared.expectedErrorCodes?.length ? "expected_negative" : "passed" };
  } catch (error) {
    if (expectedErrorMatches(error, prepared)) {
      return { ...passResult(typescriptSdkAdapter, operation.operationId), status: "expected_negative" };
    }
    return failResult(typescriptSdkAdapter, operation.operationId, error);
  }
}

async function runMailboxStreamSdkOperation({ client, prepared, sdkOperation }) {
  const timeoutMs = mailboxStreamTimeoutMs(prepared.request);
  return withAbortSignal(async signal => {
    const response = await sdkOperation({
      client,
      ...prepared.request,
      signal,
    });
    return { response, value: await firstSseEvent(response) };
  }, timeoutMs, `mailboxStreamEvents timed out after ${timeoutMs}ms`);
}

async function runBoundedSdkOperation({ client, operation, request = {}, sdkOperation, onResponse }) {
  assertSendRequestAllowed(operation.operationId, request);
  return withAbortSignal(
    async (signal) => {
      const response = await sdkOperation({
        client,
        ...request,
        signal,
      });
      onResponse?.(response);
      return response;
    },
    sdkOperationTimeoutMs,
    `${operation.operationId} SDK call timed out after ${sdkOperationTimeoutMs}ms`,
  );
}

function sdkClientFor({ credentials, operation, sdk }) {
  if (operation.surface === "management") {
    return sdk.management.createManagementClient({
      apiKey: credentials.rootApiKey,
      baseUrl: credentials.appBaseUrl,
      retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
    });
  }
  if (operation.surface === "mailbox") {
    return sdk.mailbox.createMailboxClient({
      apiKey: credentials.mailboxApiKey,
      baseUrl: credentials.appBaseUrl,
      retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
    });
  }
  return sdk.sending.createSendingClient({
    apiKey: credentials.mailboxApiKey,
    baseUrl: credentials.sendingBaseUrl,
    retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
  });
}

async function runCliOperation({ credentials, operation, prepared }) {
  assertSendRequestAllowed(operation.operationId, prepared.request);
  const tempHome = mkdtempSync(join(tmpdir(), "sendmux-live-e2e-"));
  try {
    const apiKey =
      operation.requiredKeyKind === "none"
        ? ""
        : operation.requiredKeyKind === "root"
          ? credentials.rootApiKey
          : credentials.mailboxApiKey;
    const baseUrl = operation.surface === "sending" ? credentials.sendingBaseUrl : credentials.appBaseUrl;
    const cliArgs = [
      operation.command,
      "--json",
      ...cliRequestArgsFor(prepared.request, operation),
    ];
    const result = await runCli(cliArgs, tempHome, cliTimeoutMsFor(operation, prepared.request), {
      SENDMUX_API_KEY: apiKey,
      SENDMUX_BASE_URL: baseUrl,
    });
    let recovered;
    if (operation.responseKind === "json") {
      try { recovered = JSON.parse(result.stdout); } catch { /* Incomplete output cannot establish ownership. */ }
      if (recovered?.ok === true) prepared.observeResult?.(recovered);
    }
    if (childProcessInterrupted(result)) throw new Error(childProcessFailureMessage(result));
    if (result.status !== 0) {
      if (expectedCliErrorMatches(result, prepared)) {
        return { ...passResult("cli", operation.operationId), status: "expected_negative" };
      }
      throw new Error(childProcessFailureMessage(result));
    }
    const parsed = parseCliOutput(result.stdout, operation);
    if (operation.responseKind !== "json" || recovered?.ok !== true) prepared.observeResult?.(parsed);
    assertPreparedResponse(parsed, operation, prepared);
    await prepared.afterResult?.(parsed);
    return { ...passResult("cli", operation.operationId), status: prepared.expectedErrorCodes?.length ? "expected_negative" : "passed" };
  } catch (error) {
    return failResult("cli", operation.operationId, error);
  } finally {
    if (![...activeChildren.values()].some(child => child.recoveryDirectory === tempHome)) {
      rmSync(tempHome, { force: true, recursive: true });
    }
  }
}

function runCli(args, tempHome, timeoutMs = 30_000, envOverrides = {}) {
  return runChildHarness(process.execPath, [cliPath, ...args], {
      timeout: timeoutMs,
      recoveryDirectory: tempHome,
      env: {
        ...process.env,
        HOME: tempHome,
        SENDMUX_API_KEY: "",
        SENDMUX_BASE_URL: "",
        SENDMUX_PROFILE: "",
        XDG_CONFIG_HOME: join(tempHome, ".config"),
        ...envOverrides,
      },
  });
}

function cliTimeoutMsFor(operation, request) {
  if (operation.operationId !== "mailboxStreamEvents") {
    return 30_000;
  }

  return mailboxStreamTimeoutMs(request);
}

function mailboxStreamTimeoutMs(request) {
  const closeAfterSeconds = Number(request.query?.close_after ?? 30);
  const boundedCloseAfterSeconds =
    Number.isFinite(closeAfterSeconds) && closeAfterSeconds > 0 ? closeAfterSeconds : 30;
  return (boundedCloseAfterSeconds + 15) * 1_000;
}

function parseCliOutput(stdout, operation) {
  if (operation.responseKind === "text") {
    try {
      return JSON.parse(stdout);
    } catch {
      return { text: stdout };
    }
  }

  try { return JSON.parse(stdout); }
  catch { throw new Error("CLI returned malformed JSON; output withheld from public evidence"); }
}

async function requestOptionsFor({ adapter, fixtureRuntime, fixtures, operation }) {
  if (["mailboxUploadAttachment", "mailboxGetMessageAttachment", "mailboxReadAttachment", "mailboxWaitForMessage", "sendingUploadAttachment", "sendingCreateAttachmentUpload", "sendingCompleteAttachmentUpload", "sendingGetAttachment"].includes(operation.operationId) || (adapter === "cli" && ["mailboxSendMessage", "sendingSendEmail"].includes(operation.operationId))) {
    throw new UnmetPrecondition("Attachment byte certification requires trusted storage-retention verification before upload; URL/reference expiry is not physical deletion and this public SDK runner cannot retrieve the backing storage policy");
  }
  const factory = operationRequestFactories[operation.operationId];
  if (factory) {
    return factory({ adapter, fixtureRuntime, operation });
  }

  const fixtureInputs = fixtures.operations?.[operation.operationId]?.inputs ?? {};
  const resolved = await resolveInputObject(fixtureRuntime, fixtureInputs);
  return {
    request: dropEmpty({
      body: resolved.body,
      headers: resolved.headers,
      path: resolved.path,
      query: {
        ...defaultQueryFor(operation),
        ...(resolved.query ?? {}),
      },
    }),
  };
}

async function safeRequestOptionsFor(input) {
  try {
    return { ok: true, value: await requestOptionsFor(input) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function resolveInputObject(fixtureRuntime, inputs) {
  const out = {};
  for (const key of ["body", "headers", "path", "query"]) {
    if (inputs[key] !== undefined) {
      out[key] = await resolveFixtureValue(fixtureRuntime, inputs[key]);
    }
  }
  return out;
}

async function resolveFixtureValue(fixtureRuntime, value) {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveFixtureValue(fixtureRuntime, item)));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Object.hasOwn(value, "literal")) {
    return value.literal;
  }
  if (Object.hasOwn(value, "env")) {
    const env = process.env[value.env];
    if (!env) {
      throw new Error(`Missing live E2E fixture env override ${value.env}`);
    }
    return env;
  }
  if (Object.hasOwn(value, "source")) {
    return fixtureRuntime.resolveSource(value.source);
  }

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = await resolveFixtureValue(fixtureRuntime, item);
  }
  return out;
}

function cliRequestArgsFor(request, operation) {
  const args = [];
  for (const [name, value] of Object.entries(request.path ?? {})) {
    args.push("--path", `${name}=${String(value)}`);
  }
  for (const [name, value] of Object.entries(request.query ?? {})) {
    args.push("--query", `${name}=${String(value)}`);
  }
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    args.push("--header", `${name}=${String(value)}`);
  }
  for (const filePath of request.attach ?? []) {
    args.push("--attach", String(filePath));
  }
  if (request.file) {
    args.push("--file", String(request.file));
  }
  if (request.viaPresigned) {
    args.push("--via-presigned");
  }
  if (request.contentType) {
    args.push("--content-type", String(request.contentType));
  }
  if (request.body !== undefined) {
    args.push("--body", operation.bodyKind === "binary" ? String(request.body) : JSON.stringify(request.body));
  }
  return args;
}

async function firstSseEvent(response) {
  const stream = response?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("mailboxStreamEvents did not return an async stream");
  }
  const iterator = stream[Symbol.asyncIterator]();
  try {
    const next = await iterator.next();
    if (!next.done) {
      return next.value;
    }
  } finally {
    await closeAsyncIterator(iterator);
  }
  throw new Error("mailboxStreamEvents ended before yielding an event");
}

async function closeAsyncIterator(iterator) {
  if (typeof iterator.return !== "function") {
    return;
  }
  await iterator.return();
}

function defaultQueryFor(operation) {
  const query = {};
  const queryParamNames = new Set(operation.queryParams.map((parameter) => parameter.name));
  if (queryParamNames.has("limit")) {
    query.limit = 1;
  }
  if (operation.operationId === "managementGetSpendSummary" && queryParamNames.has("days")) {
    query.days = "7";
  }
  return query;
}

async function prepareMailboxCreateFolder({ fixtureRuntime }) {
  return {
    cleanupSelectors: ["data.id"],
    request: {
      body: { name: fixtureRuntime.resourceLabel("folder") },
    },
    afterResult: async (value) => {
      const folderId = requireSelectedValue(value, ["data.id"], "mailboxCreateFolder result id");
      await cleanupMailboxFolder(fixtureRuntime, folderId);
    },
  };
}

async function prepareOwnedMailboxDeleteFolder({ fixtureRuntime }) {
  const folderId = await createOwnedMailboxFolder(fixtureRuntime, "delete-folder");
  return { request: { path: { folder_id: folderId } } };
}

async function prepareOwnedMailboxUpdateFolder({ fixtureRuntime }) {
  const folderId = await createOwnedMailboxFolder(fixtureRuntime, "update-folder");
  return {
    cleanupSelectors: ["data.id"],
    request: {
      body: { name: fixtureRuntime.resourceLabel("updated-folder") },
      path: { folder_id: folderId },
    },
    afterResult: async (value) => {
      const updatedFolderId = selectFirstValue(value, ["data.id"]) ?? folderId;
      await cleanupMailboxFolder(fixtureRuntime, updatedFolderId);
    },
  };
}

async function prepareMailboxUpdateIdentity({ fixtureRuntime }) {
  fixtureRuntime.requireDedicatedMailbox();
  const original = identityRestoreBody(await fixtureRuntime.runOperation("mailboxGetIdentity"));
  fixtureRuntime.addRestore("mailboxIdentity", fixtureRuntime.proof.mailboxId, original, () => restoreMailboxIdentity(fixtureRuntime, original));
  return {
    request: {
      body: {
        text_signature: `Sendmux live E2E ${fixtureRuntime.runId}`,
      },
    },
    afterResult: async () => {
      await restoreMailboxIdentity(fixtureRuntime, original);
    },
  };
}

function identityRestoreBody(identityResponse) {
  const body = {};
  for (const field of ["html_signature", "name", "text_signature"]) {
    const value = valueAtPath(identityResponse, `data.${field}`);
    assert.equal(typeof value, "string", `mailboxGetIdentity data.${field} must be a string for identity restore.`);
    body[field] = value;
  }
  return body;
}

function filterStateBody(filterResponse, label) {
  const mode = valueAtPath(filterResponse, "data.mode");
  const rules = valueAtPath(filterResponse, "data.rules");
  assert.equal(typeof mode, "string", `${label} data.mode must be a string for filter restore.`);
  assert.ok(Array.isArray(rules), `${label} data.rules must be an array for filter restore.`);
  return { mode, rules };
}

async function restoreMailboxIdentity(fixtureRuntime, body) {
  await fixtureRuntime.runOperation("mailboxUpdateIdentity", { body });
  assert.deepEqual(identityRestoreBody(await fixtureRuntime.runOperation("mailboxGetIdentity")), body, "Mailbox identity restore readback mismatch");
}

async function prepareMailboxUploadAttachment({ adapter, fixtureRuntime }) {
  const content = `Sendmux live E2E attachment ${fixtureRuntime.runId}\n`;
  const filename = `live-e2e-${fixtureRuntime.runId}.txt`;
  if (adapter === "cli") {
    const file = createLiveAttachmentFile(fixtureRuntime, "presigned-upload", content);
    return {
      request: {
        contentType: "text/plain",
        file: file.filePath,
        viaPresigned: true,
      },
      afterResult: async (value) => {
        await assertUploadedAttachmentRoundTrip({
          expectedContent: content,
          fixtureRuntime,
          label: "presigned-upload",
          uploadResult: value,
        });
      },
    };
  }
  if (adapter === "mcp") {
    return {
      request: {
        body: {
          content_base64: Buffer.from(content, "utf8").toString("base64"),
          content_type: "text/plain",
          filename,
        },
      },
    };
  }
  return {
    request: {
      body: content,
      query: {
        filename,
      },
    },
  };
}

async function prepareMailboxCreateAttachmentUpload({ adapter, fixtureRuntime }) {
  if (adapter === "mcp") {
    return {
      request: {
        body: {
          content_type: "text/plain",
          filename: `live-e2e-presign-${fixtureRuntime.runId}.txt`,
          presign_upload_url: true,
          size_bytes: 1,
        },
      },
    };
  }
  return {
    request: {
      body: {
        content_type: "text/plain",
        filename: `live-e2e-presign-${fixtureRuntime.runId}.txt`,
        size_bytes: 1,
      },
    },
  };
}

async function prepareMailboxGetMessageAttachment({ adapter, fixtureRuntime }) {
  const owned = await fixtureRuntime.cachedFixture("mailbox-message-attachment", () =>
    createOwnedMailboxMessage(fixtureRuntime, {
      attachment: true,
      label: "get-message-attachment",
    }),
  );
  return {
    request: {
      path: {
        attachment_id: owned.attachmentId,
        message_id: owned.messageId,
      },
    },
    afterResult: adapter === "mcp" ? async (value) => {
      const downloadUrl = selectFirstValue(value, ["data.download_url"]);
      assert.equal(typeof downloadUrl, "string", "mailbox_get_attachment did not return data.download_url");
      await assertPresignedAttachmentDownload({
        downloadUrl,
        expectedContent: owned.attachmentContent,
      });
      await assertPresignedAttachmentRejectsTamper(downloadUrl);
    } : undefined,
    returnResult: adapter === "mcp",
  };
}

async function prepareMailboxReadAttachment({ fixtureRuntime }) {
  const owned = await fixtureRuntime.cachedFixture("mailbox-message-attachment", () =>
    createOwnedMailboxMessage(fixtureRuntime, {
      attachment: true,
      label: "read-attachment",
    }),
  );
  return {
    request: {
      body: {
        attachment_id: owned.attachmentId,
        message_id: owned.messageId,
      },
    },
    afterResult: async (value) => {
      assert.equal(valueAtPath(value, "data.read_mode"), "text");
      assert.equal(valueAtPath(value, "data.text"), owned.attachmentContent);
      assert.equal(valueAtPath(value, "data.truncated"), false);
    },
    returnResult: true,
  };
}

async function prepareMailboxWaitForMessage({ fixtureRuntime }) {
  const after = new Date(Date.now() - 60_000).toISOString();
  const subject = `Sendmux live E2E wait-for-message ${fixtureRuntime.runId}`;
  const owned = await createOwnedMailboxMessage(fixtureRuntime, {
    attachment: true,
    label: "wait-for-message",
  });
  return {
    request: {
      body: {
        after,
        has_attachment: true,
        subject,
        timeout_seconds: 5,
      },
    },
    afterResult: async (value) => {
      const message = valueAtPath(value, "data.message");
      assert.ok(message && typeof message === "object", "mailbox_wait_for_message did not return data.message");
      assert.equal(valueAtPath(value, "data.message.subject"), subject);
      const attachments = valueAtPath(value, "data.message.attachments");
      assert.ok(Array.isArray(attachments), "mailbox_wait_for_message did not return attachment metadata");
      const attachment = attachments.find((item) => typeof item?.download_url === "string");
      assert.ok(attachment, "mailbox_wait_for_message did not return the owned attachment");
      assert.equal(typeof attachment.download_url, "string", "waited attachment did not include download_url");
      await assertPresignedAttachmentDownload({
        downloadUrl: attachment.download_url,
        expectedContent: owned.attachmentContent,
      });
    },
    returnResult: true,
  };
}

async function prepareMailboxSendMessage({ adapter, fixtureRuntime }) {
  const recipient = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient, sourceName: "mailboxSendMessage" });
  const attachmentFile =
    adapter === "cli"
      ? createLiveAttachmentFile(
          fixtureRuntime,
          "cli-attach-send",
          `Sendmux live E2E CLI attachment ${fixtureRuntime.runId}\n`,
        )
      : null;
  return {
    cleanupSelectors: ["data.message_id"],
    request: {
      ...(attachmentFile ? { attach: [attachmentFile.filePath] } : {}),
      body: mailboxSendBody({ fixtureRuntime, recipient, subjectLabel: "mailbox-send-message" }),
      headers: {
        "Idempotency-Key": fixtureRuntime.idempotencyKey("mailbox-send-message"),
      },
    },
    afterResult: async (value) => {
      const messageId = selectFirstValue(value, ["data.message_id"]);
      if (!messageId) return;
      try {
        if (attachmentFile) {
          await pollForMailboxMessageVisible({ fixtureRuntime, messageId });
          await assertMailboxMessageAttachmentDownload({
            expectedContent: attachmentFile.content,
            fixtureRuntime,
            messageId,
          });
        }
      } finally {
        await cleanupMailboxMessage(fixtureRuntime, messageId);
      }
    },
  };
}

async function prepareOwnedMailboxBatchGet({ fixtureRuntime }) {
  const owned = await createOwnedMailboxMessage(fixtureRuntime, { label: "batch-get" });
  return {
    request: {
      body: {
        body_mode: "none",
        ids: [owned.messageId],
        include_attachments: "metadata",
      },
    },
  };
}

async function prepareOwnedMailboxBatchUpdate({ fixtureRuntime }) {
  const owned = await createOwnedMailboxMessage(fixtureRuntime, { label: "batch-update" });
  return {
    request: {
      body: {
        ids: [owned.messageId],
        seen: true,
      },
    },
  };
}

async function prepareOwnedMailboxBatchDelete({ fixtureRuntime }) {
  const owned = await createOwnedMailboxMessage(fixtureRuntime, { cleanup: false, label: "batch-delete" });
  return {
    request: {
      body: {
        ids: [owned.messageId],
        permanent: false,
      },
    },
  };
}

async function prepareOwnedMailboxUpdateMessage({ fixtureRuntime }) {
  const owned = await createOwnedMailboxMessage(fixtureRuntime, { label: "update-message" });
  return {
    request: {
      body: { seen: true },
      path: { message_id: owned.messageId },
    },
  };
}

async function prepareOwnedMailboxDeleteMessage({ fixtureRuntime }) {
  const owned = await createOwnedMailboxMessage(fixtureRuntime, { cleanup: false, label: "delete-message" });
  return {
    request: {
      path: { message_id: owned.messageId },
    },
  };
}

async function prepareMailboxStreamEvents({ fixtureRuntime }) {
  return {
    request: {
      query: {
        close_after: 30,
        event_types: "message.received",
        last_event_id: `live-e2e-missing-${fixtureRuntime.runId}`,
        ping: 10,
      },
    },
  };
}

async function createOwnedMailboxFolder(fixtureRuntime, label) {
  let response;
  const body = { name: `live-e2e-${label}-${fixtureRuntime.runId}` };
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      response = await fixtureRuntime.runOperation("mailboxCreateFolder", { body });
      break;
    } catch (error) {
      if (attempt === 6 || !isTransientMailboxFolderCreateError(error)) {
        throw error;
      }
      await sleep(attempt * 1_000);
    }
  }
  const folderId = requireSelectedValue(response, ["data.id"], `${label} folder id`);
  fixtureRuntime.addTeardown(() => cleanupMailboxFolder(fixtureRuntime, folderId));
  return folderId;
}

function isTransientMailboxFolderCreateError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Folder could not be created");
}

async function createOwnedMailboxMessage(fixtureRuntime, opts = {}) {
  const recipient = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient, sourceName: opts.label ?? "ownedMailboxMessage" });
  const uploadedAttachment = opts.attachment
    ? await uploadOwnedMailboxAttachment(fixtureRuntime, opts.label ?? "owned-message")
    : null;
  const body = mailboxSendBody({
    attachment: uploadedAttachment?.attachment ?? null,
    fixtureRuntime,
    recipient,
    subjectLabel: opts.label ?? "owned-message",
  });
  const response = await fixtureRuntime.runOperation("mailboxSendMessage", {
    body,
    headers: {
      "Idempotency-Key": fixtureRuntime.idempotencyKey(opts.label ?? "owned-message"),
    },
  });
  const messageId = requireSelectedValue(response, ["data.message_id"], `${opts.label ?? "owned message"} message id`);
  await pollForMailboxMessageVisible({ fixtureRuntime, messageId });
  if (opts.cleanup !== false) {
    fixtureRuntime.addTeardown(() => cleanupMailboxMessage(fixtureRuntime, messageId));
  }
  if (!opts.attachment) {
    return { messageId };
  }

  const attachmentId = await pollForMailboxAttachment({ fixtureRuntime, messageId });
  await pollForMailboxAttachmentDownload({ attachmentId, fixtureRuntime, messageId });
  return { attachmentContent: uploadedAttachment.content, attachmentId, messageId };
}

async function uploadOwnedMailboxAttachment(fixtureRuntime, label) {
  const filename = `live-e2e-${label}-${fixtureRuntime.runId}.txt`;
  const content = `Sendmux live E2E attachment ${fixtureRuntime.runId}\n`;
  const response = await fixtureRuntime.runOperation("mailboxUploadAttachment", {
    body: content,
    query: { filename },
  });
  return {
    attachment: {
      blob_id: requireSelectedValue(response, ["data.blob_id"], `${label} attachment blob id`),
      content_type: selectFirstValue(response, ["data.content_type"]) ?? "text/plain",
      filename: selectFirstValue(response, ["data.filename"]) ?? filename,
    },
    content,
  };
}

function createLiveAttachmentFile(fixtureRuntime, label, content) {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-live-e2e-attachment-"));
  const filePath = join(dir, `${fixtureRuntime.resourceLabel(label)}.txt`);
  writeFileSync(filePath, content, "utf8");
  fixtureRuntime.addTeardown(() => rmSync(dir, { force: true, recursive: true }));
  return { content, filePath };
}

async function assertUploadedAttachmentRoundTrip({ expectedContent, fixtureRuntime, label, uploadResult }) {
  const recipient = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient, sourceName: label });
  const attachment = {
    blob_id: requireSelectedValue(uploadResult, ["data.blob_id"], `${label} blob id`),
    content_type: selectFirstValue(uploadResult, ["data.content_type"]) ?? "text/plain",
    filename: selectFirstValue(uploadResult, ["data.filename"]) ?? `${label}.txt`,
  };
  const response = await fixtureRuntime.runOperation("mailboxSendMessage", {
    body: mailboxSendBody({ attachment, fixtureRuntime, recipient, subjectLabel: label }),
    headers: {
      "Idempotency-Key": fixtureRuntime.idempotencyKey(label),
    },
  });
  const messageId = requireSelectedValue(response, ["data.message_id"], `${label} message id`);
  try {
    await pollForMailboxMessageVisible({ fixtureRuntime, messageId });
    await assertMailboxMessageAttachmentDownload({ expectedContent, fixtureRuntime, messageId });
  } finally {
    await cleanupMailboxMessage(fixtureRuntime, messageId);
  }
}

function mailboxSendBody({ attachment = null, fixtureRuntime, recipient, subjectLabel }) {
  return dropEmpty({
    attachments: attachment
      ? [
          attachment,
        ]
      : undefined,
    subject: `Sendmux live E2E ${subjectLabel} ${fixtureRuntime.runId}`,
    text_body: `Automated Sendmux live E2E fixture ${fixtureRuntime.runId}.`,
    to: [{ email: recipient, name: null }],
  });
}

async function cleanupMailboxFolder(fixtureRuntime, folderId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("mailboxDeleteFolder", { path: { folder_id: folderId } }));
}

async function cleanupMailboxMessage(fixtureRuntime, messageId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("mailboxDeleteMessage", { path: { message_id: messageId }, query: { permanent: true } }));
}

async function pollForMailboxMessageVisible({ fixtureRuntime, messageId }) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await fixtureRuntime.runOperation("mailboxGetMessage", { path: { message_id: messageId } });
      return;
    } catch (error) {
      lastError = error;
      if (!isMailboxMessagePending(error)) {
        throw error;
      }
      await sleep(1_000);
    }
  }
  throw new Error(`Owned message ${messageId} was not visible within 30s: ${errorMessage(lastError)}`);
}

function isMailboxMessagePending(error) {
  return error?.status === 404 || error?.code === "not_found" || error?.body?.error?.code === "not_found";
}

async function pollForMailboxAttachment({ fixtureRuntime, messageId }) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fixtureRuntime.runOperation("mailboxGetMessage", { path: { message_id: messageId } });
    const attachmentId = selectFirstValue(response, ["data.attachments.0.id", "data.attachments.0.blob_id"]);
    if (attachmentId) return attachmentId;
    await sleep(1_000);
  }
  throw new Error(`Owned message ${messageId} did not expose an attachment within 30s.`);
}

async function pollForMailboxAttachmentDownload({ attachmentId, fixtureRuntime, messageId }) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fixtureRuntime.runOperation("mailboxGetMessageAttachment", {
        path: { attachment_id: attachmentId, message_id: messageId },
      });
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(`Owned message ${messageId} attachment ${attachmentId} was not downloadable within 30s.`);
}

async function assertMailboxMessageAttachmentDownload({ expectedContent, fixtureRuntime, messageId }) {
  const attachment = await pollForMailboxAttachmentMetadata({ fixtureRuntime, messageId });
  await assertPresignedAttachmentDownload({
    downloadUrl: attachment.download_url,
    expectedContent,
  });
}

async function pollForMailboxAttachmentMetadata({ fixtureRuntime, messageId }) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fixtureRuntime.runOperation("mailboxGetMessage", { path: { message_id: messageId } });
    const attachments = valueAtPath(response, "data.attachments");
    const attachment = Array.isArray(attachments)
      ? attachments.find((item) => typeof item?.download_url === "string")
      : null;
    if (attachment) return attachment;
    await sleep(1_000);
  }
  throw new Error(`Owned message ${messageId} did not expose attachment metadata with download_url within 30s.`);
}

async function assertPresignedAttachmentDownload({ downloadUrl, expectedContent }) {
  const response = await fetchWithTimeout(downloadUrl, "presigned attachment download");
  assert.equal(response.status, 200, `presigned attachment download returned ${response.status}`);
  const actual = await response.text();
  assert.equal(actual, expectedContent, "presigned attachment download returned unexpected bytes");
}

async function assertPresignedAttachmentRejectsTamper(downloadUrl) {
  const url = new URL(downloadUrl);
  const token = url.searchParams.get("download_token");
  assert.equal(typeof token, "string", "presigned attachment URL is missing download_token");
  url.searchParams.set("download_token", `${token}tampered`);
  const response = await fetchWithTimeout(url, "tampered presigned attachment download");
  assert.ok(
    response.status === 401 || response.status === 403,
    `tampered presigned attachment URL returned ${response.status}`,
  );
}

async function prepareManagementCreateProvider({ fixtureRuntime }) {
  return {
    cleanupSelectors: ["data.id"],
    request: {
      body: providerBody(fixtureRuntime, "create"),
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-create-provider") },
    },
    afterResult: async (value) => {
      const providerId = requireSelectedValue(value, ["data.id"], "managementCreateProvider result id");
      await cleanupProvider(fixtureRuntime, providerId);
    },
  };
}

async function prepareOwnedProviderUpdate({ fixtureRuntime }) {
  const providerId = await createOwnedProvider(fixtureRuntime, "update-provider");
  return {
    request: {
      body: { name: `live-e2e-updated-${fixtureRuntime.runId}` },
      path: { public_id: providerId },
    },
  };
}

async function prepareOwnedProviderActivate({ fixtureRuntime }) {
  const providerId = await createOwnedProvider(fixtureRuntime, "activate-provider");
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeactivateProvider", { path: { public_id: providerId } }));
  return { request: { path: { public_id: providerId } } };
}

async function prepareOwnedProviderDeactivate({ fixtureRuntime }) {
  const providerId = await createOwnedProvider(fixtureRuntime, "deactivate-provider");
  return { request: { path: { public_id: providerId } } };
}

async function prepareOwnedProviderTest({ fixtureRuntime }) {
  const providerId = await createOwnedProvider(fixtureRuntime, "test-provider");
  return {
    request: { path: { public_id: providerId } },
  };
}

async function prepareOwnedProviderDelete({ fixtureRuntime }) {
  const providerId = await createOwnedProvider(fixtureRuntime, "delete-provider", { cleanup: false });
  return { request: { path: { public_id: providerId } } };
}

async function prepareManagementCreateWebhook({ fixtureRuntime }) {
  return {
    cleanupSelectors: ["data.id"],
    request: {
      body: await webhookBody(fixtureRuntime, "create"),
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-create-webhook") },
    },
    afterResult: async (value) => {
      const webhookId = requireSelectedValue(value, ["data.id"], "managementCreateWebhook result id");
      await cleanupWebhook(fixtureRuntime, webhookId);
    },
  };
}

async function prepareOwnedWebhookUpdate({ fixtureRuntime }) {
  const webhookId = await createOwnedWebhook(fixtureRuntime, "update-webhook");
  const original = webhookRestoreBody(
    await fixtureRuntime.runOperation("managementGetWebhook", { path: { public_id: webhookId } }),
  );
  fixtureRuntime.addRestore("webhook", webhookId, original, () => restoreWebhook(fixtureRuntime, webhookId, original));
  return {
    afterResult: async () => {
      await restoreWebhook(fixtureRuntime, webhookId, original);
    },
    request: {
      body: {
        enabled: true,
        event_types: ["sendmux.test"],
        name: `live-e2e-updated-${fixtureRuntime.runId}`,
        url: liveWebhookUrl("update-webhook"),
      },
      path: { public_id: webhookId },
    },
  };
}

async function prepareOwnedWebhookTest({ fixtureRuntime }) {
  const webhookId = await createOwnedWebhook(fixtureRuntime, "test-webhook");
  const original = webhookRestoreBody(
    await fixtureRuntime.runOperation("managementGetWebhook", { path: { public_id: webhookId } }),
  );
  fixtureRuntime.addRestore("webhook", webhookId, original, () => restoreWebhook(fixtureRuntime, webhookId, original));
  await fixtureRuntime.runOperation("managementUpdateWebhook", {
    body: {
      ...original,
      enabled: true,
      event_types: ["sendmux.test"],
      url: liveWebhookUrl("test-webhook"),
    },
    path: { public_id: webhookId },
  });
  return {
    afterResult: async () => {
      await restoreWebhook(fixtureRuntime, webhookId, original);
    },
    request: {
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-test-webhook") },
      path: { public_id: webhookId },
    },
  };
}

async function prepareOwnedWebhookRotateSecret({ fixtureRuntime }) {
  const webhookId = await fixtureRuntime.cachedFixture("rotate-webhook", () =>
    createOwnedWebhook(fixtureRuntime, "rotate-webhook"),
  );
  return {
    request: {
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-rotate-webhook-secret") },
      path: { public_id: webhookId },
    },
  };
}

async function prepareOwnedWebhookDelete({ fixtureRuntime }) {
  const webhookId = await createOwnedWebhook(fixtureRuntime, "delete-webhook", { cleanup: false });
  return { request: { path: { public_id: webhookId } } };
}

async function prepareManagementCreateMailbox({ fixtureRuntime }) {
  return {
    cleanupSelectors: managementMailboxIdSelectors,
    request: {
      body: await mailboxCreateBody(fixtureRuntime, "create-mailbox"),
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-create-mailbox") },
    },
    afterResult: async (value) => {
      const mailboxId = requireSelectedValue(value, managementMailboxIdSelectors, "managementCreateMailbox result id");
      await cleanupManagementMailbox(fixtureRuntime, mailboxId);
    },
  };
}

async function prepareOwnedMailboxUpdate({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "update-mailbox");
  return {
    request: {
      body: { display_name: `Live E2E Updated ${fixtureRuntime.runId}` },
      path: { public_id: mailboxId },
    },
  };
}

async function prepareOwnedMailboxSuspend({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "suspend-mailbox");
  return {
    request: {
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-suspend-mailbox") },
      path: { public_id: mailboxId },
    },
  };
}

async function prepareOwnedMailboxResume({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "resume-mailbox");
  await fixtureRuntime.runOperation("managementSuspendMailbox", {
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-resume-setup-suspend-mailbox") },
    path: { public_id: mailboxId },
  });
  return {
    request: {
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-resume-mailbox") },
      path: { public_id: mailboxId },
    },
  };
}

async function prepareOwnedMailboxDelete({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "delete-mailbox", { cleanup: false });
  return { request: { path: { public_id: mailboxId } } };
}

async function prepareManagementCreateMailboxKey({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "create-mailbox-key");
  return {
    cleanupSelectors: managementMailboxKeyIdSelectors,
    request: {
      body: { app_name: fixtureRuntime.resourceLabel("mailbox-key") },
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-create-mailbox-key") },
      path: { public_id: mailboxId },
    },
    afterResult: async (value) => {
      const keyId = requireSelectedValue(value, managementMailboxKeyIdSelectors, "managementCreateMailboxKey result id");
      await cleanupMailboxKey(fixtureRuntime, mailboxId, keyId);
    },
  };
}

async function prepareOwnedMailboxKeyDelete({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "delete-mailbox-key");
  const response = await fixtureRuntime.runOperation("managementCreateMailboxKey", {
    body: { app_name: fixtureRuntime.resourceLabel("delete-mailbox-key") },
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-delete-mailbox-key-setup") },
    path: { public_id: mailboxId },
  });
  const keyId = requireSelectedValue(response, managementMailboxKeyIdSelectors, "owned mailbox key id");
  const keySecret = requireSelectedValue(response, managementMailboxKeySecretSelectors, "owned mailbox key secret");
  await waitForMailboxCredentialVisible(fixtureRuntime, keySecret);
  return {
    request: {
      path: { key_id: keyId, public_id: mailboxId },
    },
  };
}

async function waitForMailboxCredentialVisible(fixtureRuntime, apiKey) {
  let lastError;
  for (const delayMs of mailboxCredentialVisibilityRetryDelaysMs) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      await fixtureRuntime.runMailboxOperationWithApiKey(apiKey, "mailboxListGrantedMailboxes", {
        query: { limit: 1 },
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isCredentialVisibilityPending(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Mailbox credential did not become visible before delete setup: ${errorMessage(lastError)}`);
}

function isCredentialVisibilityPending(error) {
  return error?.status === 401 || error?.code === "authentication_required" || error?.body?.error?.code === "authentication_required";
}

async function prepareOwnedMailboxFilters({ fixtureRuntime }) {
  const mailboxId = await createOwnedManagementMailbox(fixtureRuntime, "mailbox-filters");
  return {
    request: {
      body: { mode: "off", rules: [] },
      path: { public_id: mailboxId },
    },
  };
}

async function prepareManagementCreateDomain({ fixtureRuntime }) {
  await fixtureRuntime.requireDedicatedDomain();
  const domain = ownedDomainName(fixtureRuntime, "create-domain");
  return {
    request: {
      body: { domain },
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-create-domain") },
    },
  };
}

async function prepareOwnedDomainDelete({ fixtureRuntime }) {
  const domainId = await createOwnedDomain(fixtureRuntime, "delete-domain");
  return {
    request: { path: { public_id: domainId } },
  };
}

async function prepareOwnedDomainUpdate({ fixtureRuntime }) {
  const domainId = await createOwnedDomain(fixtureRuntime, "update-domain", { mode: "send_only" });
  return {
    afterResult: async () => {
      await cleanupDomain(fixtureRuntime, domainId);
    },
    request: {
      body: { mode: "send_receive" },
      path: { public_id: domainId },
    },
  };
}

async function prepareOwnedDomainFilters({ fixtureRuntime }) {
  const domainId = await fixtureRuntime.requireDedicatedDomain();
  const original = await fixtureRuntime.runOperation("managementGetDomainFilters", { path: { public_id: domainId } });
  const restoreBody = filterStateBody(original, "managementGetDomainFilters");
  fixtureRuntime.addRestore("domainFilters", domainId, restoreBody, () => restoreDomainFilters(fixtureRuntime, domainId, restoreBody));
  return {
    request: {
      body: restoreBody,
      path: { public_id: domainId },
    },
    afterResult: async () => {
      await restoreDomainFilters(fixtureRuntime, domainId, restoreBody);
    },
  };
}

async function prepareOwnedDomainVerify({ fixtureRuntime }) {
  const domainId = await fixtureRuntime.requireDedicatedDomain();
  return { request: { path: { public_id: domainId } } };
}

async function prepareSendingSendEmail({ adapter, fixtureRuntime }) {
  const email = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient: email, sourceName: "sendingSendEmail" });
  const attachmentFile =
    adapter === "cli"
      ? createLiveAttachmentFile(
          fixtureRuntime,
          "sending-cli-attach",
          `Sendmux live E2E Sending attachment ${fixtureRuntime.runId}\n`,
        )
      : null;
  return {
    request: {
      ...(attachmentFile ? { attach: [attachmentFile.filePath] } : {}),
      body: sendingEmailBody({ email, fixtureRuntime, subjectLabel: "send" }),
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("sending-send-email") },
    },
  };
}

async function prepareSendingUploadAttachment({ adapter, fixtureRuntime }) {
  const attachment = sendingAttachmentFixture(fixtureRuntime, "sending-upload-attachment");
  const afterResult = async (value) => {
    await assertSendingAttachmentMetadata({
      contentType: attachment.contentType,
      fixtureRuntime,
      label: "sendingUploadAttachment",
      metadata: value,
      sizeBytes: attachment.sizeBytes,
    });
  };

  if (adapter === "mcp") {
    return {
      afterResult,
      request: {
        body: {
          content_base64: Buffer.from(attachment.content, "utf8").toString("base64"),
          content_type: attachment.contentType,
          filename: attachment.filename,
        },
      },
    };
  }

  return {
    afterResult,
    request: {
      body: attachment.content,
      headers: {
        "Content-Length": attachment.sizeBytes,
        "Idempotency-Key": fixtureRuntime.idempotencyKey("sending-upload-attachment"),
      },
      query: {
        content_type: attachment.contentType,
        filename: attachment.filename,
      },
    },
  };
}

async function prepareSendingGetAttachment({ fixtureRuntime }) {
  const attachment = await uploadOwnedSendingAttachment(fixtureRuntime, "sending-get-attachment");
  return {
    request: {
      path: {
        attachment_id: attachment.attachmentId,
      },
    },
    afterResult: async (value) => {
      assertSendingAttachmentMetadataValue({
        attachmentId: attachment.attachmentId,
        contentType: attachment.contentType,
        label: "sendingGetAttachment",
        metadata: value,
        sizeBytes: attachment.sizeBytes,
      });
    },
  };
}

async function prepareSendingCreateAttachmentUpload({ fixtureRuntime }) {
  const attachment = sendingAttachmentFixture(fixtureRuntime, "sending-create-attachment-upload");
  return {
    request: {
      body: {
        content_type: attachment.contentType,
        filename: attachment.filename,
        size_bytes: attachment.sizeBytes,
      },
      headers: {
        "Idempotency-Key": fixtureRuntime.idempotencyKey("sending-create-attachment-upload"),
      },
    },
    afterResult: async (value) => {
      await completeSendingAttachmentUploadUrl({
        attachment,
        fixtureRuntime,
        intent: value,
        label: "sendingCreateAttachmentUpload",
      });
    },
  };
}

async function prepareSendingCompleteAttachmentUpload({ fixtureRuntime }) {
  const attachment = sendingAttachmentFixture(fixtureRuntime, "sending-complete-attachment-upload");
  const intent = await createSendingAttachmentUploadIntent({
    attachment,
    fixtureRuntime,
    label: "sending-complete-attachment-upload",
  });
  return {
    request: {
      body: attachment.content,
      headers: {
        "Content-Length": attachment.sizeBytes,
        "X-Sendmux-Upload-Token": intent.uploadToken,
      },
      path: {
        upload_id: intent.uploadId,
      },
    },
    afterResult: async (value) => {
      assertSendingAttachmentMetadataValue({
        attachmentId: selectFirstValue(value, ["data.attachment_id"]),
        contentType: attachment.contentType,
        label: "sendingCompleteAttachmentUpload",
        metadata: value,
        sizeBytes: attachment.sizeBytes,
      });
    },
  };
}

async function prepareSendingSendEmailBatch({ fixtureRuntime }) {
  const email = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient: email, sourceName: "sendingSendEmailBatch" });
  return {
    request: {
      body: {
        messages: [sendingEmailBody({ email, fixtureRuntime, subjectLabel: "send-batch" })],
      },
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("sending-send-email-batch") },
    },
  };
}

async function prepareSendingAccountLimitRequest({ fixtureRuntime }) {
  await assertLimitRequestUnavailable({
    fixtureRuntime,
    operationId: "managementGetProviderLimits",
    selectors: ["data.sending_accounts.can_request_increase", "data.can_request_increase"],
    label: "sending account limit request",
  });
  return {
    expectedErrorCodes: ["validation_error", "conflict"],
    request: {
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-sending-account-limit-request") },
    },
  };
}

async function prepareSharedSesLimitRequest({ fixtureRuntime }) {
  const canRequest = await canCreateSharedSesLimitRequest(fixtureRuntime);
  return {
    expectedErrorCodes: canRequest ? undefined : ["validation_error", "conflict"],
    cleanupSelectors: ["data.request.id"],
    request: {
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-shared-ses-limit-request") },
    },
    afterResult: async (value) => {
      const requestId = selectFirstValue(value, ["data.request.id"]);
      if (requestId) await cleanupSharedSesLimitRequest(fixtureRuntime, requestId);
    },
  };
}

async function prepareOwnedSharedSesLimitRequestCancel({ fixtureRuntime }) {
  const canRequest = await canCreateSharedSesLimitRequest(fixtureRuntime);
  if (!canRequest) {
    return {
      expectedErrorCodes: ["not_found"],
      request: { path: { request_id: `slir_live_e2e_missing_${fixtureRuntime.runId.replace(/-/g, "")}` } },
    };
  }
  const requestId = await createSharedSesLimitRequest(fixtureRuntime, "cancel-shared-ses-limit-request");
  return { request: { path: { request_id: requestId } } };
}

async function canCreateSharedSesLimitRequest(fixtureRuntime) {
  const response = await fixtureRuntime.runOperation("managementGetSharedAmazonSesLimitRequest");
  const canRequest = selectFirstValue(response, ["data.limit.can_request_increase"]);
  if (canRequest !== false) throw new UnmetPrecondition("Shared SES safe-negative certification requires explicitly observed can_request_increase=false; external support requests are not certified by this run");
  return false;
}

async function createSharedSesLimitRequest(fixtureRuntime, label) {
  const response = await fixtureRuntime.runOperation("managementCreateSharedAmazonSesLimitRequest", {
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey(label) },
  });
  const requestId = requireSelectedValue(response, ["data.request.id"], `${label} request id`);
  fixtureRuntime.addTeardown(() => cleanupSharedSesLimitRequest(fixtureRuntime, requestId));
  return requestId;
}

async function createOwnedProvider(fixtureRuntime, label, opts = {}) {
  const response = await fixtureRuntime.runOperation("managementCreateProvider", {
    body: providerBody(fixtureRuntime, label),
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey(`provider-${label}`) },
  });
  const providerId = requireSelectedValue(response, ["data.id"], `${label} provider id`);
  if (opts.cleanup !== false) {
    fixtureRuntime.addTeardown(() => cleanupProvider(fixtureRuntime, providerId));
  }
  return providerId;
}

function providerBody(fixtureRuntime, label) {
  return {
    name: fixtureRuntime.resourceLabel(label),
    smtp_host: "smtp.example.com",
    smtp_password: "live-e2e-password",
    smtp_port: 2525,
    smtp_protocol: "none",
    smtp_username: "live-e2e",
  };
}

async function createOwnedWebhook(fixtureRuntime, label, opts = {}) {
  const response = await fixtureRuntime.runOperation("managementCreateWebhook", {
    body: await webhookBody(fixtureRuntime, label),
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey(`webhook-${label}`) },
  });
  const webhookId = requireSelectedValue(response, ["data.id"], `${label} webhook id`);
  if (opts.cleanup !== false) {
    fixtureRuntime.addTeardown(() => cleanupWebhook(fixtureRuntime, webhookId));
  }
  return webhookId;
}

async function webhookBody(fixtureRuntime, label) {
  const webhookUrl = liveWebhookUrl(label);
  return {
    enabled: true,
    event_types: ["sendmux.test"],
    name: fixtureRuntime.resourceLabel(label),
    url: webhookUrl,
  };
}

function liveWebhookUrl(label) {
  const webhookUrl = process.env.SENDMUX_LIVE_E2E_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Missing SENDMUX_LIVE_E2E_WEBHOOK_URL for owned webhook live E2E fixtures.");
  }
  assertWebhookUrlAllowed({ sourceName: label, webhookUrl });
  return webhookUrl;
}

async function createOwnedDomain(fixtureRuntime, label, opts = {}) {
  await fixtureRuntime.requireDedicatedDomain();
  const response = await fixtureRuntime.runOperation("managementCreateDomain", {
    body: {
      domain: ownedDomainName(fixtureRuntime, label),
      mode: opts.mode ?? "send_only",
    },
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey(`domain-${label}`) },
  });
  const domainId = requireSelectedValue(response, ["data.id"], `${label} domain id`);
  if (opts.cleanup !== false) {
    fixtureRuntime.addTeardown(() => cleanupDomain(fixtureRuntime, domainId));
  }
  return domainId;
}

function ownedDomainName(fixtureRuntime, label) {
  return `${fixtureRuntime.resourceLabel(label)}.${liveE2eDomainName()}`;
}

async function createOwnedManagementMailbox(fixtureRuntime, label, opts = {}) {
  const response = await fixtureRuntime.runOperation("managementCreateMailbox", {
    body: await mailboxCreateBody(fixtureRuntime, label),
    headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey(`mailbox-${label}`) },
  });
  const mailboxId = requireSelectedValue(response, managementMailboxIdSelectors, `${label} mailbox id`);
  const keySecret = requireSelectedValue(response, managementMailboxKeySecretSelectors, `${label} mailbox initial credential secret`);
  if (opts.cleanup !== false) {
    fixtureRuntime.addTeardown(() => cleanupManagementMailbox(fixtureRuntime, mailboxId));
  }
  await waitForMailboxCredentialVisible(fixtureRuntime, keySecret);
  return mailboxId;
}

async function mailboxCreateBody(fixtureRuntime, label) {
  const domain = await managementDomainName(fixtureRuntime);
  const localPart = fixtureRuntime.resourceLabel(label);
  return {
    display_name: `Live E2E ${localPart}`,
    email: `${localPart}@${domain}`,
    send_scope: { type: "all" },
  };
}

async function managementDomainName(fixtureRuntime) {
  const domainId = await fixtureRuntime.requireDedicatedDomain();
  const response = await fixtureRuntime.runOperation("managementGetDomain", { path: { public_id: domainId } });
  const domain = requireSelectedValue(response, ["data.domain"], "management domain name");
  const expected = liveE2eDomainName();
  assert.equal(domain, expected, `Live E2E domain fixture must be ${expected}, got ${domain}.`);
  return domain;
}

function sendingEmailBody({ email, fixtureRuntime, subjectLabel }) {
  return {
    from: { email, name: "Sendmux Live E2E" },
    html_body: `<p>Automated Sendmux live E2E ${fixtureRuntime.runId}</p>`,
    subject: `Sendmux live E2E ${subjectLabel} ${fixtureRuntime.runId}`,
    text_body: `Automated Sendmux live E2E ${fixtureRuntime.runId}.`,
    to: { email, name: "Sendmux Live E2E" },
  };
}

function sendingAttachmentFixture(fixtureRuntime, label) {
  const content = `Sendmux live E2E Sending attachment ${fixtureRuntime.runId} ${label}\n`;
  return {
    content,
    contentType: "text/plain",
    filename: `${fixtureRuntime.resourceLabel(label)}.txt`,
    sizeBytes: Buffer.byteLength(content, "utf8"),
  };
}

async function uploadOwnedSendingAttachment(fixtureRuntime, label) {
  const attachment = sendingAttachmentFixture(fixtureRuntime, label);
  const response = await fixtureRuntime.runOperation("sendingUploadAttachment", {
    body: attachment.content,
    headers: {
      "Idempotency-Key": fixtureRuntime.idempotencyKey(label),
    },
    query: {
      content_type: attachment.contentType,
      filename: attachment.filename,
    },
  });
  return {
    ...attachment,
    attachmentId: requireSelectedValue(response, ["data.attachment_id"], `${label} attachment id`),
  };
}

async function createSendingAttachmentUploadIntent({ attachment, fixtureRuntime, label }) {
  const response = await fixtureRuntime.runOperation("sendingCreateAttachmentUpload", {
    body: {
      content_type: attachment.contentType,
      filename: attachment.filename,
      size_bytes: attachment.sizeBytes,
    },
    headers: {
      "Idempotency-Key": fixtureRuntime.idempotencyKey(label),
    },
  });
  return {
    method: requireSelectedValue(response, ["data.method"], `${label} upload method`),
    uploadId: requireSelectedValue(response, ["data.upload_id"], `${label} upload id`),
    uploadToken: requireSelectedValue(
      response,
      ["data.headers.X-Sendmux-Upload-Token", "data.headers.x-sendmux-upload-token"],
      `${label} upload token`,
    ),
    uploadUrl: requireSelectedValue(response, ["data.upload_url"], `${label} upload URL`),
  };
}

async function completeSendingAttachmentUploadUrl({ attachment, fixtureRuntime, intent, label }) {
  const method = requireSelectedValue(intent, ["data.method"], `${label} upload method`);
  const uploadUrl = requireSelectedValue(intent, ["data.upload_url"], `${label} upload URL`);
  const headers = valueAtPath(intent, "data.headers") ?? {};
  assert.equal(method, "PUT", `${label} returned unsupported upload method`);

  const response = await fetchWithTimeout(uploadUrl, `${label} delegated upload`, {
    body: attachment.content,
    headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
    method,
  });
  const payload = await response.json().catch(() => null);
  fixtureRuntime.observeResult("sendingCompleteAttachmentUpload", {}, payload);
  assert.equal(response.status, 201, `${label} delegated upload returned HTTP ${response.status}`);
  assertSendingAttachmentMetadataValue({
    attachmentId: selectFirstValue(payload, ["data.attachment_id"]),
    contentType: attachment.contentType,
    label,
    metadata: payload,
    sizeBytes: attachment.sizeBytes,
  });

  const attachmentId = requireSelectedValue(payload, ["data.attachment_id"], `${label} attachment id`);
  const metadata = await fixtureRuntime.runOperation("sendingGetAttachment", {
    path: { attachment_id: attachmentId },
  });
  assertSendingAttachmentMetadataValue({
    attachmentId,
    contentType: attachment.contentType,
    label: `${label} metadata`,
    metadata,
    sizeBytes: attachment.sizeBytes,
  });
}

async function assertSendingAttachmentMetadata({ contentType, fixtureRuntime, label, metadata, sizeBytes }) {
  const attachmentId = requireSelectedValue(metadata, ["data.attachment_id"], `${label} attachment id`);
  assertSendingAttachmentMetadataValue({ attachmentId, contentType, label, metadata, sizeBytes });
  const fetched = await fixtureRuntime.runOperation("sendingGetAttachment", {
    path: { attachment_id: attachmentId },
  });
  assertSendingAttachmentMetadataValue({
    attachmentId,
    contentType,
    label: `${label} fetched metadata`,
    metadata: fetched,
    sizeBytes,
  });
}

function assertSendingAttachmentMetadataValue({ attachmentId, contentType, label, metadata, sizeBytes }) {
  assert.equal(valueAtPath(metadata, "ok"), true, `${label} did not return ok=true`);
  assert.equal(typeof valueAtPath(metadata, "meta.request_id"), "string", `${label} did not return meta.request_id`);
  if (attachmentId) {
    assert.equal(valueAtPath(metadata, "data.attachment_id"), attachmentId, `${label} returned a different attachment_id`);
  }
  assert.equal(valueAtPath(metadata, "data.content_type"), contentType, `${label} returned a different content_type`);
  assert.equal(valueAtPath(metadata, "data.size_bytes"), sizeBytes, `${label} returned a different size_bytes`);
  assert.equal(typeof valueAtPath(metadata, "data.expires_at"), "string", `${label} did not return expires_at`);
}

async function assertLimitRequestUnavailable({ fixtureRuntime, label, operationId, selectors }) {
  const response = await fixtureRuntime.runOperation(operationId);
  const canRequest = selectors.map((selector) => valueAtPath(response, selector)).find((value) => value !== undefined);
  if (canRequest !== false) {
    throw new UnmetPrecondition(`${label} requires explicitly observed can_request_increase=false; external quota requests are not certified by this run.`);
  }
}

async function cleanupProvider(fixtureRuntime, providerId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeleteProvider", { path: { public_id: providerId } }));
}

async function cleanupWebhook(fixtureRuntime, webhookId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeleteWebhook", { path: { public_id: webhookId } }));
}

async function restoreWebhook(fixtureRuntime, webhookId, body) {
  await fixtureRuntime.runOperation("managementUpdateWebhook", { body, path: { public_id: webhookId } });
  assert.deepEqual(webhookRestoreBody(await fixtureRuntime.runOperation("managementGetWebhook", { path: { public_id: webhookId } })), body, "Webhook restore readback mismatch");
}

function webhookRestoreBody(response) {
  const webhook = response?.data;
  if (!webhook || typeof webhook !== "object") {
    throw new Error("Missing managementGetWebhook data for webhook restore.");
  }
  assert.equal(typeof webhook.url, "string", "managementGetWebhook restore URL must be a string");
  assert.equal(typeof webhook.enabled, "boolean", "managementGetWebhook restore enabled must be a boolean");
  assert.ok(Array.isArray(webhook.event_types), "managementGetWebhook restore event_types must be an array");
  return {
    enabled: webhook.enabled,
    event_types: [...webhook.event_types],
    filters: cloneJson(webhook.filters ?? { mailbox_ids: [] }),
    name: webhook.name ?? null,
    url: webhook.url,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function cleanupManagementMailbox(fixtureRuntime, mailboxId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeleteMailbox", { path: { public_id: mailboxId } }));
}

async function cleanupMailboxKey(fixtureRuntime, mailboxId, keyId) {
  await ignoreCleanupErrors(() =>
    fixtureRuntime.runOperation("managementDeleteMailboxKey", { path: { key_id: keyId, public_id: mailboxId } }),
  );
}

async function cleanupSharedSesLimitRequest(fixtureRuntime, requestId) {
  await ignoreCleanupErrors(() =>
    fixtureRuntime.runOperation("managementCancelSharedAmazonSesLimitRequest", { path: { request_id: requestId } }),
  );
}

async function cleanupDomain(fixtureRuntime, domainId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeleteDomain", { path: { public_id: domainId } }));
}

async function restoreDomainFilters(fixtureRuntime, domainId, body) {
  await fixtureRuntime.runOperation("managementSetDomainFilters", { body, path: { public_id: domainId } });
  assert.deepEqual(filterStateBody(await fixtureRuntime.runOperation("managementGetDomainFilters", { path: { public_id: domainId } }), "domain restore"), body, "Domain filter restore readback mismatch");
}

async function ignoreCleanupErrors(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!isAlreadyAbsent(error)) throw error;
  }
}

function isAlreadyAbsent(error) {
  return error?.status === 404 && error?.body?.ok === false && error?.body?.error?.code === "not_found" && typeof error?.body?.meta?.request_id === "string" && error.body.meta.request_id.length > 0;
}

function requireSelectedValue(value, selectors, label) {
  const selected = selectFirstValue(value, selectors);
  if (!selected) {
    throw new Error(`Missing ${label}`);
  }
  return selected;
}

function createFixtureRuntime({ credentials, fixtures, operations, runId, sdk, ledgerPath = join(".tmp", "live-e2e", runId, "resources.json") }) {
  const idempotencyCounts = new Map();
  const resourceCounts = new Map();
  const runSlug = runId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  const sourceCache = new Map();
  const teardowns = [];
  const deliveries = new Map();
  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));
  let proof;
  const ledger = { runId, resources: [] };
  const persist = () => {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(`${ledgerPath}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600, flush: true });
    renameSync(`${ledgerPath}.tmp`, ledgerPath);
  };

  return {
    async preflight(expected = {
      teamId: process.env.SENDMUX_LIVE_E2E_EXPECTED_TEAM_ID,
      mailboxId: process.env.SENDMUX_LIVE_E2E_EXPECTED_MAILBOX_ID,
      mailboxEmail: process.env.SENDMUX_LIVE_E2E_EXPECTED_MAILBOX_EMAIL,
    }) {
      const needsMailbox = Boolean(credentials.mailboxApiKey);
      assert.ok(expected.teamId && (!needsMailbox || (expected.mailboxId && expected.mailboxEmail)), "Missing expected connection identity (team and mailbox ID/email)");
      const surfaces = [credentials.rootApiKey && "management", needsMailbox && "mailbox", needsMailbox && "sending"].filter(Boolean);
      for (const surface of surfaces) {
        const operation = { surface, operationId: `${surface}GetConnection` };
        const client = sdkClientFor({ credentials, operation, sdk });
        const response = await runBoundedSdkOperation({ client, operation, sdkOperation: sdk[surface][operation.operationId] });
        assertLiveResponse(response.data, operation);
        assert.equal(response.data.data?.team?.id, expected.teamId, `${surface} connection team identity mismatch`);
        if (surface !== "management") {
          const mailboxes = response.data.data?.mailboxes;
          assert.ok(Array.isArray(mailboxes) && mailboxes.length === 1 && mailboxes[0].id === expected.mailboxId && mailboxes[0].email === expected.mailboxEmail, `${surface} connection mailbox identity mismatch`);
        }
      }
      proof = { ...expected, surfaces };
      if (needsMailbox) sourceCache.set("mailboxSelfEmail", expected.mailboxEmail);
      return proof;
    },
    get proof() { return proof; },
    get ledger() { return cloneJson(ledger); },
    beginOperation(operationId, request) {
      assertSendRequestAllowed(operationId, request);
      if (!["mailboxSendMessage", "sendingSendEmail", "sendingSendEmailBatch"].includes(operationId)) return;
      const messages = operationId === "sendingSendEmailBatch" ? request.body.messages : [request.body];
      for (const message of messages) {
        assert.ok(proof?.mailboxEmail, "Self-delivery cleanup requires a verified mailbox");
        assert.ok(typeof message.subject === "string" && message.subject.includes(runId), "Self-delivery cleanup requires the exact run-labelled subject");
        const recipients = [message.to, message.cc, message.bcc].flat().filter(Boolean);
        assert.ok(recipients.every(item => (typeof item === "string" ? item : item.email) === proof.mailboxEmail), "Certification sends require the verified self mailbox for delivery cleanup");
        let entry = deliveries.get(message.subject);
        if (!entry) {
          entry = { kind: "self_delivery", id: randomUUID(), subject: message.subject, expected_count: 0, received_ids: [], status: "pending_delivery" };
          deliveries.set(message.subject, entry);
          ledger.resources.push(entry);
        }
        entry.expected_count += 1;
        persist();
      }
    },
    async collectDeliveries() {
      for (const entry of deliveries.values()) {
        await withAbortSignal(async () => {
          try {
            const received = new Set();
            while (received.size < entry.expected_count) {
              let cursor;
              const seenCursors = new Set();
              do {
                const result = await this.runOperation("mailboxListMessages", { query: { subject: entry.subject, from: proof.mailboxEmail, to: proof.mailboxEmail, limit: 100, ...(cursor ? { cursor } : {}) } });
                assert.ok(Array.isArray(result.data), "Delivery search must return a message array");
                for (const message of result.data) {
                  if (message.subject !== entry.subject || message.from?.email !== proof.mailboxEmail || !message.to?.some(item => item.email === proof.mailboxEmail)) continue;
                  const alreadySent = ledger.resources.some(item => item.operationId === "mailboxSendMessage" && item.id === message.id);
                  if (!alreadySent) received.add(message.id);
                  this.observeResult("mailboxSendMessage", {}, { data: { message_id: message.id } });
                }
                cursor = result.pagination?.next_cursor;
                if (cursor) { assert.ok(!seenCursors.has(cursor), "Delivery search repeated a cursor"); seenCursors.add(cursor); }
              } while (cursor);
              entry.received_ids = [...received];
              persist();
              if (received.size < entry.expected_count) await sleep(1000);
            }
            entry.status = "captured";
          } catch (error) { entry.status = "unverified_delivery"; throw error; }
          finally { persist(); }
        }, fixtureTeardownTimeoutMs, "Self-delivery visibility timed out before cleanup could be verified");
      }
    },
    addRestore(kind, id, snapshot, restore) {
      const entry = { kind, id, status: "pending" };
      ledger.resources.push(entry);
      persist();
      writeFileSync(join(dirname(ledgerPath), `${kind}-${id}-restore.json`), `${JSON.stringify(snapshot)}\n`, { mode: 0o600, flush: true });
      teardowns.push(async () => {
        try { await restore(); entry.status = "restored"; }
        catch (error) { entry.status = "failed"; throw error; }
        finally { persist(); }
      });
    },
    journalPath(adapter, operationId) {
      mkdirSync(dirname(ledgerPath), { recursive: true });
      return join(dirname(ledgerPath), `${adapter}-${operationId}-${randomUUID()}.jsonl`);
    },
    recoverJournal(path, operationId, request) {
      if (!existsSync(path)) return;
      for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
        const record = JSON.parse(line);
        assert.equal(record.operationId, operationId, "Unexpected journal operation");
        this.observeResult(operationId, request, record.result);
      }
    },
    observeResult(operationId, request, value) {
      const retention = {
        mailboxCreateAttachmentUpload: ["data.upload_id", "url_expires_at", "upload_intent"],
        mailboxUploadAttachment: ["data.blob_id", null, "mailbox_blob"],
        sendingCreateAttachmentUpload: ["data.upload_id", "url_expires_at", "upload_intent"],
        sendingUploadAttachment: ["data.attachment_id", "reference_expires_at", "sending_attachment"],
        sendingCompleteAttachmentUpload: ["data.attachment_id", "reference_expires_at", "sending_attachment"],
      }[operationId];
      if (retention) {
        const [selector, expiryField, kind] = retention;
        const id = selectFirstValue(value, [selector]);
        if (id && !ledger.resources.some(item => item.kind === kind && item.id === id)) {
          assert.equal(typeof id, "string", "Resource ID must be a string");
          const entry = { operationId, kind, id, status: kind === "upload_intent" ? "pending" : "unverified_retention", public_delete: false, storage_cleanup: kind === "upload_intent" ? "no_uploaded_bytes" : "unverified" };
          ledger.resources.push(entry);
          persist();
          if (expiryField) {
            const expiry = requireSelectedValue(value, ["data.expires_at"], "retention expiry");
            assert.ok(typeof expiry === "string" && Number.isFinite(Date.parse(expiry)), "Invalid retention expiry");
            entry[expiryField] = expiry.replace(/\+00:00$/, "Z");
          }
          if (kind === "upload_intent") entry.status = "expiry_only";
          persist();
        }
        return;
      }
      const resources = {
        mailboxCreateFolder: ["data.id", "mailboxDeleteFolder", "mailboxGetFolder", "folder_id"],
        mailboxSendMessage: ["data.message_id", "mailboxDeleteMessage", "mailboxGetMessage", "message_id"],
        managementCreateProvider: ["data.id", "managementDeleteProvider", "managementGetProvider", "public_id"],
        managementCreateWebhook: ["data.id", "managementDeleteWebhook", "managementGetWebhook", "public_id"],
        managementCreateDomain: ["data.id", "managementDeleteDomain", "managementGetDomain", "public_id"],
        managementCreateMailbox: ["data.mailbox.id", "managementDeleteMailbox", "managementGetMailbox", "public_id"],
        managementCreateMailboxKey: ["data.credential.public_id", "managementDeleteMailboxKey", null, "key_id"],
      };
      const spec = resources[operationId];
      if (!spec) return;
      const [selector, remove, read, parameter] = spec;
      const id = selectFirstValue(value, [selector]);
      if (!id || ledger.resources.some(item => item.operationId === operationId && item.id === id)) return;
      const path = { ...(operationId === "managementCreateMailboxKey" ? request.path : {}), [parameter]: id };
      assert.equal(typeof id, "string", "Resource ID must be a string");
      const entry = { operationId, id, path, status: "pending" };
      ledger.resources.push(entry);
      persist();
      teardowns.push(async () => {
        try {
          const receipt = await ignoreCleanupErrors(() => this.runOperation(remove, { path, ...(remove === "mailboxDeleteMessage" ? { query: { permanent: true } } : {}) }));
          if (remove === "managementDeleteMailboxKey") {
            if (receipt !== undefined) assert.ok(receipt.data?.deleted === true && receipt.data?.id === id, "Invalid exact mailbox key revocation receipt");
            entry.verification = receipt === undefined ? "structured_not_found" : "exact_revocation_receipt";
          } else {
          try {
            await this.runOperation(read, { path });
            throw new Error(`Resource ${id} remains after cleanup`);
          } catch (error) { if (!isAlreadyAbsent(error)) throw error; }
            entry.verification = "get_not_found";
          }
          entry.status = "absent";
        } catch (error) { entry.status = "failed"; throw error; }
        finally { persist(); }
      });
    },
    requireDedicatedMailbox() {
      assert.ok(proof?.mailboxId && process.env.SENDMUX_LIVE_E2E_DEDICATED_MAILBOX_ID === proof.mailboxId, "Mailbox identity mutation requires the dedicated preflight-verified mailbox ID");
      return proof.mailboxId;
    },
    async requireDedicatedDomain() {
      const id = process.env.SENDMUX_LIVE_E2E_DOMAIN_ID;
      const name = process.env.SENDMUX_LIVE_E2E_DOMAIN_NAME;
      if (!id || !name) throw new UnmetPrecondition("Domain mutation requires explicit dedicated DOMAIN_ID and DOMAIN_NAME");
      const response = await this.runOperation("managementGetDomain", { path: { public_id: id } });
      assert.equal(response.data?.id, id, "Dedicated domain ID mismatch");
      assert.equal(response.data?.domain, name, "Dedicated domain name mismatch");
      return id;
    },
    addTeardown(teardown) {
      teardowns.push(teardown);
    },
    idempotencyKey(label) {
      const count = (idempotencyCounts.get(label) ?? 0) + 1;
      idempotencyCounts.set(label, count);
      return `live-e2e-${runId}-${label}-${count}`;
    },
    resourceLabel(label) {
      const count = (resourceCounts.get(label) ?? 0) + 1;
      resourceCounts.set(label, count);
      const safeLabel = String(label)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32);
      return `live-e2e-${safeLabel}-${runSlug}-${count}`;
    },
    runId,
    async runOperation(operationId, request = {}) {
      assert.ok(proof, "Connection identity preflight must succeed before fixture operations");
      this.beginOperation(operationId, request);
      const operation = operationsById.get(operationId);
      if (!operation) {
        throw new Error(`Unknown fixture setup operation ${operationId}`);
      }
      const client = sdkClientFor({ credentials, operation, sdk });
      const sdkOperation = sdk[operation.surface]?.[operation.operationId];
      assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);
      const response = await runBoundedSdkOperation({ client, operation, request, onResponse: response => this.observeResult(operationId, request, response.data), sdkOperation });
      this.observeResult(operationId, request, response.data);
      assertLiveResponse(response.data, operation);
      return response.data;
    },
    async runMailboxOperationWithApiKey(apiKey, operationId, request = {}) {
      const operation = operationsById.get(operationId);
      if (!operation) {
        throw new Error(`Unknown fixture setup operation ${operationId}`);
      }
      assert.equal(operation.surface, "mailbox", `${operationId} must be a mailbox operation`);
      const client = sdk.mailbox.createMailboxClient({
        apiKey,
        baseUrl: credentials.appBaseUrl,
        retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
      });
      const sdkOperation = sdk.mailbox?.[operation.operationId];
      assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);
      const response = await runBoundedSdkOperation({ client, operation, request, sdkOperation });
      assertLiveResponse(response.data, operation);
      return response.data;
    },
    async cachedFixture(name, factory) {
      const key = `owned:${name}`;
      if (sourceCache.has(key)) {
        return sourceCache.get(key);
      }
      const value = await factory();
      sourceCache.set(key, value);
      return value;
    },
    async teardown() {
      if (unconfirmedActiveWork) throw new UnconfirmedCancellation("Cleanup prohibited: active work did not confirm cancellation");
      const errors = [];
      try { await this.collectDeliveries(); }
      catch (error) { errors.push(errorMessage(error)); }
      for (const cleanup of teardowns.reverse()) {
        if (unconfirmedActiveWork) throw new UnconfirmedCancellation("Cleanup prohibited: active work did not confirm cancellation");
        try {
          await withAbortSignal(
            () => cleanup(),
            fixtureTeardownTimeoutMs,
            `fixture cleanup timed out after ${fixtureTeardownTimeoutMs}ms`,
          );
        } catch (error) {
          errors.push(errorMessage(error));
        }
      }
      if (errors.length > 0) {
        throw new Error(`Live E2E fixture teardown failed: ${errors.join("; ")}`);
      }
      if (ledger.resources.some(entry => entry.status === "unverified_retention")) throw new UnmetPrecondition("Attachment reference/URL expiry does not establish storage cleanup; retention verification remains unmet");
      if (ledger.resources.some(entry => entry.status === "pending")) throw new UnmetPrecondition("Resource cleanup/retention verification remains unmet");
    },
    async resolveSource(sourceName) {
      assert.ok(proof, "Connection identity preflight must succeed before fixture discovery");
      if (sourceCache.has(sourceName)) {
        return sourceCache.get(sourceName);
      }

      const source = fixtures.sources?.[sourceName];
      if (!source) {
        throw new Error(`Unknown live E2E fixture source ${sourceName}`);
      }

      const envValue = source.env ? process.env[source.env] : undefined;
      if (envValue) {
        sourceCache.set(sourceName, envValue);
        return envValue;
      }

      if (sourceName === "managementDomainId") {
        const domainId = await resolveLiveE2eDomainId(this);
        sourceCache.set(sourceName, domainId);
        return domainId;
      }

      const operation = operationsById.get(source.operationId);
      if (!operation) {
        throw new Error(`Fixture source ${sourceName} references unknown operation ${source.operationId}`);
      }

      const request = await resolveInputObject(this, source.request ?? {});
      const client = sdkClientFor({ credentials, operation, sdk });
      const sdkOperation = sdk[operation.surface]?.[operation.operationId];
      assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);

      const response = await runBoundedSdkOperation({ client, operation, request, sdkOperation });
      assertLiveResponse(response.data, operation.operationId);
      const selected = selectFirstValue(response.data, source.selectors ?? []);
      if (selected === undefined || selected === null || selected === "") {
        if (source.setup) {
          const setupValue = await setupFixtureSource({
            credentials,
            operationsById,
            runId,
            runtime: this,
            sdk,
            source,
            sourceName,
            teardowns,
          });
          sourceCache.set(sourceName, setupValue);
          return setupValue;
        }
        throw new UnmetPrecondition(
          `Fixture source ${sourceName} did not resolve a value from ${operation.operationId}. Set ${source.env ?? "a fixture env override"} or seed the controlled E2E environment.`,
        );
      }

      sourceCache.set(sourceName, selected);
      return selected;
    },
  };
}

async function resolveLiveE2eDomainId(fixtureRuntime) {
  const domainName = liveE2eDomainName();
  const response = await fixtureRuntime.runOperation("managementListDomains", { query: { limit: 100 } });
  const domain = (Array.isArray(response?.data) ? response.data : []).find((item) => item?.domain === domainName);
  if (!domain?.id) {
    throw new Error(`Live E2E requires preconfigured domain ${domainName}. Set SENDMUX_LIVE_E2E_DOMAIN_ID if list discovery is unavailable.`);
  }
  return domain.id;
}

function liveE2eDomainName() {
  return process.env.SENDMUX_LIVE_E2E_DOMAIN_NAME || "dev.sendmux.app";
}

async function setupFixtureSource({ credentials, operationsById, runId, runtime, sdk, source, sourceName, teardowns }) {
  if (source.setup?.kind === "mailbox_send_message") {
    return setupMailboxSubmissionFixture({ credentials, operationsById, runId, runtime, sdk, source, sourceName });
  }
  if (source.setup?.kind === "management_webhook") {
    return setupManagementWebhookFixture({ credentials, operationsById, runId, runtime, sdk, source, sourceName, teardowns });
  }
  if (source.setup?.kind === "management_webhook_delivery") {
    return setupManagementWebhookDeliveryFixture({ credentials, operationsById, runId, runtime, sdk, source, sourceName });
  }
  throw new Error(`Fixture source ${sourceName} uses unsupported setup kind ${source.setup?.kind ?? "missing"}.`);
}

function assertFixtureSetupEnabled({ source, sourceName }) {
  if (process.env[fixtureSetupEnvName] !== "1") {
    throw new UnmetPrecondition(
      `Fixture source ${sourceName} requires setup because ${source.operationId} returned no value. Set ${source.env ?? "a fixture env override"} or set ${fixtureSetupEnvName}=1 with the source setup gates.`,
    );
  }
}

async function setupMailboxSubmissionFixture({ credentials, operationsById, runId, runtime, sdk, source, sourceName }) {
  if (source.setup?.kind !== "mailbox_send_message") {
    throw new Error(`Fixture source ${sourceName} uses unsupported setup kind ${source.setup?.kind ?? "missing"}.`);
  }
  assertFixtureSetupEnabled({ source, sourceName });

  const recipient = await resolveFixtureValue(runtime, source.setup.to);
  assert.equal(typeof recipient, "string", `${sourceName} setup recipient must resolve to an email string`);
  assertFixtureRecipientAllowed({ recipient, sourceName });

  const sendOperation = operationsById.get("mailboxSendMessage");
  if (!sendOperation) {
    throw new Error("mailboxSubmissionId setup requires mailboxSendMessage in the OpenAPI operation manifest.");
  }

  const client = sdkClientFor({ credentials, operation: sendOperation, sdk });
  const subjectPrefix = source.setup.subjectPrefix ?? "Sendmux live E2E fixture";
  const response = { data: await runtime.runOperation("mailboxSendMessage", {
    headers: {
      "Idempotency-Key": `live-e2e-${runId}-${sourceName}`,
    },
    body: {
      subject: `${subjectPrefix} ${runId}`,
      text_body: `Automated Sendmux live E2E fixture ${runId}.`,
      to: [{ email: recipient, name: null }],
    },
  }) };
  assertLiveResponse(response.data, "mailboxSendMessage");

  const messageId = selectFirstValue(response.data, ["data.message_id"]);
  if (!messageId) {
    throw new Error(`${sourceName} setup did not receive a message_id from mailboxSendMessage.`);
  }

  return pollForMailboxSubmission({ credentials, messageId, operationsById, sdk, sourceName, runtime });
}

async function setupManagementWebhookFixture({
  credentials,
  operationsById,
  runId,
  runtime,
  sdk,
  source,
  sourceName,
  teardowns,
}) {
  assertFixtureSetupEnabled({ source, sourceName });
  const webhookUrl = await resolveFixtureValue(runtime, source.setup.url);
  assert.equal(typeof webhookUrl, "string", `${sourceName} setup URL must resolve to a string`);
  assertWebhookUrlAllowed({ sourceName, webhookUrl });

  const operation = operationsById.get("managementCreateWebhook");
  if (!operation) {
    throw new Error(`${sourceName} setup requires managementCreateWebhook in the OpenAPI operation manifest.`);
  }

  const client = sdkClientFor({ credentials, operation, sdk });
  const namePrefix = source.setup.namePrefix ?? "Sendmux live E2E webhook fixture";
  const response = { data: await runtime.runOperation("managementCreateWebhook", {
    headers: {
      "Idempotency-Key": `live-e2e-${runId}-${sourceName}-create`,
    },
    body: {
      enabled: true,
      event_types: ["sendmux.test"],
      name: `${namePrefix} ${runId}`,
      url: webhookUrl,
    },
  }) };
  assertLiveResponse(response.data, "managementCreateWebhook");
  const webhookId = selectFirstValue(response.data, ["data.id"]);
  if (!webhookId) {
    throw new Error(`${sourceName} setup did not receive a webhook id from managementCreateWebhook.`);
  }

  teardowns.push(async () => {
    const deleteResponse = { data: await runtime.runOperation("managementDeleteWebhook", {
      path: { public_id: webhookId },
    }) };
    assertLiveResponse(deleteResponse.data, "managementDeleteWebhook");
  });

  return webhookId;
}

function assertWebhookUrlAllowed({ sourceName, webhookUrl }) {
  const allowed = new Set(parseCsv(process.env[fixtureWebhookUrlAllowlistEnvName] ?? ""));
  if (!allowed.has(webhookUrl)) {
    throw new Error(
      `Fixture source ${sourceName} setup URL ${webhookUrl} is not allowlisted by ${fixtureWebhookUrlAllowlistEnvName}.`,
    );
  }
}

async function setupManagementWebhookDeliveryFixture({
  credentials,
  operationsById,
  runId,
  runtime,
  sdk,
  source,
  sourceName,
}) {
  assertFixtureSetupEnabled({ source, sourceName });
  const webhookId = await createOwnedWebhook(runtime, sourceName);
  assert.equal(typeof webhookId, "string", `${sourceName} setup webhook must resolve to a string`);
  const original = webhookRestoreBody(await runtime.runOperation("managementGetWebhook", { path: { public_id: webhookId } }));
  runtime.addRestore("webhook", webhookId, original, () => restoreWebhook(runtime, webhookId, original));
  await runtime.runOperation("managementUpdateWebhook", {
    body: {
      ...original,
      enabled: true,
      event_types: ["sendmux.test"],
      url: liveWebhookUrl(sourceName),
    },
    path: { public_id: webhookId },
  });

  const operation = operationsById.get("managementTestWebhook");
  if (!operation) {
    throw new Error(`${sourceName} setup requires managementTestWebhook in the OpenAPI operation manifest.`);
  }

  const client = sdkClientFor({ credentials, operation, sdk });
  const response = { data: await runtime.runOperation("managementTestWebhook", {
    headers: {
      "Idempotency-Key": `live-e2e-${runId}-${sourceName}-test`,
    },
    path: { public_id: webhookId },
  }) };
  assertLiveResponse(response.data, "managementTestWebhook");

  const eventId = selectFirstValue(response.data, ["data.event_id"]);
  if (!eventId) {
    throw new Error(`${sourceName} setup did not receive an event_id from managementTestWebhook.`);
  }

  const deliveryId = await pollForWebhookDelivery({ credentials, eventId, operationsById, sdk, sourceName, webhookId, runtime });
  await restoreWebhook(runtime, webhookId, original);
  return deliveryId;
}

function assertFixtureRecipientAllowed({ recipient, sourceName }) {
  assert.equal(process.env[sendGateEnvName], "1", `${sourceName} requires ${sendGateEnvName}=1`);
  const allowed = new Set(parseCsv(process.env[fixtureSendAllowlistEnvName] ?? ""));
  if (!allowed.has(recipient)) {
    throw new Error(
      `Fixture source ${sourceName} setup recipient ${recipient} is not allowlisted by ${fixtureSendAllowlistEnvName}.`,
    );
  }
}

function assertSendRequestAllowed(operationId, request) {
  if (!["mailboxSendMessage", "sendingSendEmail", "sendingSendEmailBatch"].includes(operationId)) return;
  const messages = operationId === "sendingSendEmailBatch" ? request.body?.messages : [request.body];
  assert.ok(Array.isArray(messages) && messages.length > 0, "Send requires at least one message");
  for (const message of messages) {
    const recipients = [message?.to, message?.cc, message?.bcc].flat().filter(Boolean);
    assert.ok(recipients.length > 0, "Send requires a recipient");
    for (const recipient of recipients) assertFixtureRecipientAllowed({ recipient: typeof recipient === "string" ? recipient : recipient.email, sourceName: operationId });
  }
}

async function pollForMailboxSubmission({ credentials, messageId, operationsById, sdk, sourceName, runtime }) {
  const operation = operationsById.get("mailboxListSubmissions");
  if (!operation) {
    throw new Error(`${sourceName} setup requires mailboxListSubmissions in the OpenAPI operation manifest.`);
  }

  const client = sdkClientFor({ credentials, operation, sdk });
  const deadline = Date.now() + 30_000;
  let lastRequestId = "unknown";
  while (Date.now() < deadline) {
    const response = { data: await runtime.runOperation("mailboxListSubmissions", {
      query: { email_ids: messageId, limit: 1 },
    }) };
    assertLiveResponse(response.data, "mailboxListSubmissions");
    lastRequestId = response.data?.meta?.request_id ?? lastRequestId;
    const submissionId = selectFirstValue(response.data, ["data.0.id"]);
    if (submissionId) {
      return submissionId;
    }
    await sleep(1_000);
  }

  throw new Error(
    `Fixture source ${sourceName} setup sent message ${messageId}, but no submission appeared within 30s. Last request_id: ${lastRequestId}.`,
  );
}

async function pollForWebhookDelivery({ credentials, eventId, operationsById, sdk, sourceName, webhookId, runtime }) {
  const operation = operationsById.get("managementListDelivery");
  if (!operation) {
    throw new Error(`${sourceName} setup requires managementListDelivery in the OpenAPI operation manifest.`);
  }

  const client = sdkClientFor({ credentials, operation, sdk });
  const deadline = Date.now() + 60_000;
  let lastRequestId = "unknown";
  while (Date.now() < deadline) {
    const response = { data: await runtime.runOperation("managementListDelivery", {
      path: { public_id: webhookId },
      query: { event_type: "sendmux.test", limit: 10 },
    }) };
    assertLiveResponse(response.data, "managementListDelivery");
    lastRequestId = response.data?.meta?.request_id ?? lastRequestId;
    const delivery = (Array.isArray(response.data?.data) ? response.data.data : []).find(
      (item) => item?.event_id === eventId && item?.payload_available === true,
    );
    if (delivery?.id) {
      return delivery.id;
    }
    await sleep(1_000);
  }

  throw new Error(
    `Fixture source ${sourceName} setup published event ${eventId}, but no payload-available delivery appeared within 60s. Last request_id: ${lastRequestId}.`,
  );
}

function sleep(ms) {
  const signal = cancellationScope.getStore();
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function reportProgress(event, details = {}) {
  if (process.env[progressEnvName] !== "1") {
    return;
  }
  console.error(JSON.stringify({ event, ...details }));
}

async function withAbortSignal(run, timeoutMs, message) {
  const controller = new AbortController();
  const parent = cancellationScope.getStore();
  const onAbort = () => controller.abort(parent.reason);
  parent?.addEventListener("abort", onAbort, { once: true });
  if (parent?.aborted) onAbort();
  const timeout = setTimeout(() => controller.abort(new Error(message)), timeoutMs);
  const operation = cancellationScope.run(controller.signal, async () => {
    controller.signal.throwIfAborted();
    return run(controller.signal);
  });
  activeOperations.set(controller, operation);
  let shutdownTimer;
  const onCancelled = () => {
    shutdownTimer = setTimeout(() => {
      stopping = true;
      unconfirmedActiveWork = true;
      rejectUnconfirmed(new UnconfirmedCancellation(`${message}; cancellation unconfirmed after shutdown grace`));
    }, shutdownGraceMs);
  };
  let rejectUnconfirmed;
  const shutdown = new Promise((_, reject) => { rejectUnconfirmed = reject; });
  controller.signal.addEventListener("abort", onCancelled, { once: true });
  if (controller.signal.aborted) onCancelled();
  try {
    const value = await Promise.race([operation, shutdown]);
    controller.signal.throwIfAborted();
    return value;
  } catch (error) {
    if (error instanceof UnconfirmedCancellation) throw error;
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    clearTimeout(shutdownTimer);
    controller.signal.removeEventListener("abort", onCancelled);
    parent?.removeEventListener("abort", onAbort);
    activeOperations.delete(controller);
  }
}

function fetchWithTimeout(input, label, init = {}) {
  return withAbortSignal(
    async (signal) => {
      const response = await fetch(input, { ...init, signal });
      const body = await response.arrayBuffer();
      return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
    presignedFetchTimeoutMs,
    `${label} timed out after ${presignedFetchTimeoutMs}ms`,
  );
}

function selectFirstValue(value, selectors) {
  for (const selector of selectors) {
    const selected = valueAtPath(value, selector);
    if (selected !== undefined && selected !== null && selected !== "") {
      return selected;
    }
  }
  return undefined;
}

function valueAtPath(value, path) {
  return String(path)
    .split(".")
    .reduce((current, segment) => {
      if (current === undefined || current === null) {
        return undefined;
      }
      if (Array.isArray(current) && /^\d+$/.test(segment)) {
        return current[Number(segment)];
      }
      return current[segment];
    }, value);
}

async function runMcpOperations({ credentials, operations, requests }) {
  const plan = operations
    .map((operation) => {
      if (!isMcpCurated(operation)) {
        return skippedMcpResult(operation);
      }
      const prepared = requests.get(operation.operationId) ?? { request: {} };
      assertSendRequestAllowed(operation.operationId, prepared.request);
      return {
        args: toolArgsForRequest(prepared.request),
        cleanupSelectors: prepared.cleanupSelectors,
        journalPath: prepared.journalPath,
        journalSelectors,
        expectedErrorCodes: prepared.expectedErrorCodes,
        operationId: operation.operationId,
        responseKind: operation.responseKind,
        returnResult: prepared.returnResult === true || Boolean(prepared.afterResult || prepared.observeResult),
        surface: operation.surface,
        toolName: scenarios[operation.operationId].adapters.mcp,
      };
    });
  const executable = plan.filter((entry) => !entry.status);
  const skipped = plan.filter((entry) => entry.status);

  if (executable.length === 0) {
    return skipped;
  }

  const result = await runChildHarness(mcpPython, ["-m", "sendmux_mcp.live_e2e"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SENDMUX_LIVE_E2E_APP_BASE_URL: credentials.appBaseUrl,
      SENDMUX_LIVE_E2E_MAILBOX_API_KEY: credentials.mailboxApiKey,
      SENDMUX_LIVE_E2E_MCP_PLAN: JSON.stringify({ operations: executable }),
      SENDMUX_LIVE_E2E_ROOT_API_KEY: credentials.rootApiKey,
      SENDMUX_LIVE_E2E_SENDING_BASE_URL: credentials.sendingBaseUrl,
    },
    timeout: childHarnessTimeoutMs,
  });
  for (const prepared of requests.values()) prepared.recoverJournal?.();
  if (childProcessInterrupted(result) || result.status !== 0) {
    return [
      ...skipped,
      {
        adapter: "mcp",
        error: childProcessFailureMessage(result),
        operationId: planFailureOperationId("mcp", executable),
        status: "failed",
      },
    ];
  }

  const parsed = JSON.parse(result.stdout);
  const mcpResults = validateResultPairs(parsed.results, executable.map(item => ({ adapter: "mcp", operationId: item.operationId, expectedNegative: Boolean(item.expectedErrorCodes?.length) })));
  const preparedById = new Map([...requests.entries()]);
  for (const result of mcpResults) {
    if (result.status !== "passed") continue;
    const prepared = preparedById.get(result.operationId);
    if (prepared?.afterResult || prepared?.observeResult) {
      assert.notEqual(result.result, undefined, `${result.operationId} missing assertion result`);
      prepared.observeResult?.(result.result);
      await prepared.afterResult?.(result.result);
    }
  }
  return [...skipped, ...mcpResults.map(({ cleanup, result, error, ...item }) => ({ ...item, ...(error ? { error: "MCP operation failed; response details withheld" } : {}) }))];
}

async function runLanguageSdkOperations({ adapter, credentials, operations, requests, command = languageCommand(adapter) }) {
  const executable = operations.map((operation) => {
    const prepared = requests.get(operation.operationId) ?? { request: {} };
    assertSendRequestAllowed(operation.operationId, prepared.request);
    return {
      bodyKind: operation.bodyKind,
      cleanupSelectors: prepared.cleanupSelectors,
      journalPath: prepared.journalPath,
      journalSelectors,
      expectedErrorCodes: prepared.expectedErrorCodes,
      operationId: operation.operationId,
      request: prepared.request,
      responseKind: operation.responseKind,
      returnResult: Boolean(prepared.afterResult || prepared.observeResult),
      risk: scenarios[operation.operationId]?.risk,
      surface: operation.surface,
    };
  });
  if (!command) {
    return operations.map((operation) => ({
      adapter,
      error: `${adapter} live E2E harness is not implemented`,
      operationId: operation.operationId,
      status: "failed",
    }));
  }

  const result = await runChildHarness(command.bin, command.args, {
    cwd: command.cwd ? join(process.cwd(), command.cwd) : process.cwd(),
    env: {
      ...process.env,
      SENDMUX_LIVE_E2E_APP_BASE_URL: credentials.appBaseUrl,
      SENDMUX_LIVE_E2E_LANGUAGE_PLAN: JSON.stringify({ operations: executable }),
      SENDMUX_LIVE_E2E_MAILBOX_API_KEY: credentials.mailboxApiKey,
      SENDMUX_LIVE_E2E_ROOT_API_KEY: credentials.rootApiKey,
      SENDMUX_LIVE_E2E_SENDING_BASE_URL: credentials.sendingBaseUrl,
    },
    timeout: childHarnessTimeoutMs,
  });
  for (const prepared of requests.values()) prepared.recoverJournal?.();
  if (childProcessInterrupted(result) || result.status !== 0) {
    return [
      {
        adapter,
        error: childProcessFailureMessage(result),
        operationId: planFailureOperationId(adapter, executable),
        status: "failed",
      },
    ];
  }

  const parsed = JSON.parse(result.stdout);
  const languageResults = validateResultPairs(parsed.results, executable.map(item => ({ adapter, operationId: item.operationId, expectedNegative: Boolean(item.expectedErrorCodes?.length) })));
  const preparedById = new Map([...requests.entries()]);
  for (const item of languageResults) {
    if (item.status !== "passed") continue;
    const prepared = preparedById.get(item.operationId);
    if (prepared?.afterResult || prepared?.observeResult) {
      assert.notEqual(item.result, undefined, `${item.operationId} missing assertion result`);
      prepared.observeResult?.(item.result);
      await prepared.afterResult?.(item.result);
    }
  }
  return languageResults.map(({ cleanup, result, error, ...item }) => ({ ...item, ...(error ? { error: "SDK operation failed; response details withheld" } : {}) }));
}

function planFailureOperationId(adapter, operations) {
  return operations.length === 1 ? operations[0].operationId : `${adapter}-plan`;
}

function childProcessInterrupted(result) {
  return Boolean(result.error || result.timedOut || result.aborted || result.signalErrors?.length);
}

function childProcessFailureMessage(result) {
  if (result.error) {
    return `Child process error ${/^E[A-Z0-9]+$/.test(result.error.code) ? result.error.code : "UNKNOWN"}; details withheld`;
  }
  if (result.timedOut) {
    return `timed out after ${result.timeout}ms`;
  }
  if (result.aborted) return "Child operation aborted";
  if (result.signalErrors?.length) return `Child signal delivery failed: ${result.signalErrors.map(failure => `${failure.signal}:${failure.code}`).join(", ")}`;
  return `Child exited ${result.status}; output withheld from public evidence`;
}

function assertLivePlatform() {
  if (!["linux", "darwin"].includes(process.platform)) {
    throw new Error("Protected live E2E execution requires Linux or macOS process-group ownership; --plan remains available on other platforms");
  }
}

function runChildHarness(bin, args, { cwd, env, timeout, recoveryDirectory, signal = cancellationScope.getStore() }) {
  return new Promise((resolve, reject) => {
    assertLivePlatform();
    signal?.throwIfAborted();
    const detached = true;
    const child = spawn(bin, args, {
      cwd,
      detached,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    reportProgress("child_started", { pid: child.pid });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let aborted = false;
    let forceKill;
    let shutdownTimer;
    let pollTimer;
    let shutdownStarted = false;
    let leaderClosed = false;
    let status;
    let exitSignal;
    let childError;
    let resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    const signalErrors = [];
    const recordSignalError = (signal, error) => {
      const code = /^E[A-Z0-9]+$/.test(error.code) ? error.code : "UNKNOWN";
      if (!signalErrors.some(failure => failure.signal === signal && failure.code === code)) signalErrors.push({ signal, code });
    };
    const sendSignal = signal => {
      const error = killChildTree(child, signal, detached);
      if (error) recordSignalError(signal, error);
    };
    const groupAlive = () => {
      if (!child.pid) return false;
      try { process.kill(detached ? -child.pid : child.pid, 0); return true; }
      catch (error) {
        if (error.code === "ESRCH") return false;
        recordSignalError("0", error);
        return true;
      }
    };
    const checkCompletion = () => {
      if (settled) return;
      if (leaderClosed && !groupAlive()) {
        clearTimeout(timeoutTimer);
        clearTimeout(forceKill);
        clearTimeout(shutdownTimer);
        clearTimeout(pollTimer);
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        activeChildren.delete(child);
        resolveClosed();
        reportProgress("child_closed", { pid: child.pid, status, signal: exitSignal });
        resolve({ aborted, error: childError, pid: child.pid, signal: exitSignal, signalErrors, status, stderr, stdout, timedOut, timeout });
      } else if (shutdownStarted && !pollTimer) {
        pollTimer = setTimeout(() => { pollTimer = undefined; checkCompletion(); }, 25);
      }
    };
    const forceTerminate = () => { if (!settled) sendSignal("SIGKILL"); };
    const terminate = () => {
      if (settled || shutdownStarted) return;
      shutdownStarted = true;
      clearTimeout(timeoutTimer);
      sendSignal("SIGTERM");
      // Reserve part of the same grace for observing group absence after SIGKILL.
      forceKill = setTimeout(forceTerminate, shutdownGraceMs / 2);
      shutdownTimer = setTimeout(() => {
        forceTerminate();
        checkCompletion();
        if (!settled) {
          clearTimeout(pollTimer);
          stopping = true;
          unconfirmedActiveWork = true;
          reject(new UnconfirmedCancellation(`Owned child group ${child.pid} shutdown unconfirmed after cancellation grace`));
        }
      }, shutdownGraceMs);
      checkCompletion();
    };
    activeChildren.set(child, { terminate, forceTerminate, closed, pid: child.pid, recoveryDirectory, signalErrors });
    const onAbort = () => { aborted = true; terminate(); };
    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeout);
    timeoutTimer.unref?.();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      childError = error;
    });
    child.on("exit", () => {
      clearTimeout(timeoutTimer);
      if (groupAlive()) terminate();
    });
    child.on("close", (code, signal) => {
      status = code;
      exitSignal = signal;
      leaderClosed = true;
      if (groupAlive()) terminate();
      checkCompletion();
    });
  });
}

function killChildTree(child, signal, detached) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(detached ? -child.pid : child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") return error;
  }
}

function languageCommand(adapter) {
  if (adapter === "python") {
    return { bin: mcpPython, args: ["scripts/live-e2e-python.py"] };
  }
  if (adapter === "go") {
    return { bin: "go", args: ["run", "./livee2e"], cwd: "go" };
  }
  if (adapter === "php") {
    return { bin: "php", args: ["scripts/live-e2e-php.php"] };
  }
  if (adapter === "ruby") {
    return commandWithRbenv("ruby", ["scripts/live-e2e-ruby.rb"]);
  }
  return null;
}

function commandWithRbenv(command, args) {
  if (existsSync(`${process.env.HOME}/.rbenv/bin/rbenv`) || existsSync("/opt/homebrew/bin/rbenv")) {
    return { bin: "rbenv", args: ["exec", command, ...args] };
  }
  return { bin: command, args };
}

function isMcpCurated(operation) {
  return Boolean(scenarios[operation.operationId]?.adapters?.mcp);
}

function skippedMcpResult(operation) {
  return {
    adapter: "mcp",
    operationId: operation.operationId,
    reason: "operation is not part of the curated MCP set",
    status: "inapplicable",
  };
}

function toolArgsForRequest(request) {
  return dropEmpty({
    ...(request.path ?? {}),
    ...(request.query ?? {}),
    ...(request.headers ?? {}),
    ...(request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body : {}),
    ...(request.body !== undefined && (typeof request.body !== "object" || Array.isArray(request.body))
      ? { body: request.body }
      : {}),
  });
}

function assertLiveResponse(value, operation) {
  const operationId = typeof operation === "string" ? operation : operation.operationId;
  const responseKind = typeof operation === "string" ? "json" : operation.responseKind;
  if (operationId === "mailboxStreamEvents") {
    assert.ok(value && typeof value === "object", "mailboxStreamEvents did not return an event object");
    assert.ok(
      ["message.received", "message.received.spam", "sync_required"].includes(value.event_type ?? value.event),
      "mailboxStreamEvents did not return a mailbox realtime event",
    );
    return;
  }
  if (
    operationId === "mailboxGetMessageAttachment" &&
    value?.ok === true &&
    typeof value?.data?.download_url === "string"
  ) {
    assert.equal(typeof value?.meta?.request_id, "string", `${operationId} did not return meta.request_id`);
    return;
  }
  if (responseKind === "binary" || operationId === "mailboxGetMessageAttachment") {
    if (typeof value === "string") {
      assert.ok(value.length > 0, `${operationId} returned empty binary text`);
      return;
    }
    if (typeof value?.text === "string") {
      assert.ok(value.text.length > 0, `${operationId} returned empty binary text`);
      return;
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      assert.ok(value.byteLength > 0, `${operationId} returned empty binary bytes`);
      return;
    }
    if (value?.type === "Buffer" && Array.isArray(value.data)) {
      assert.ok(value.data.length > 0, `${operationId} returned empty binary buffer JSON`);
      return;
    }
    if (typeof value?.base64 === "string" && typeof value?.byte_length === "number") {
      assert.ok(value.base64.length > 0, `${operationId} returned empty binary base64`);
      assert.ok(value.byte_length > 0, `${operationId} returned empty binary byte length`);
      return;
    }
    if (value?.arrayBuffer && typeof value.arrayBuffer === "function") {
      return;
    }
    throw new Error(`${operationId} did not return binary content: ${describeValueShape(value)}`);
  }
  if (responseKind === "text") {
    const text = typeof value === "string" ? value : value?.text;
    assert.equal(typeof text, "string", `${operationId} did not return text`);
    assert.ok(text.length > 0, `${operationId} returned empty text`);
    return;
  }

  if (operationId === "sendingGetOpenApiSpec") {
    assert.equal(value?.openapi, "3.1.0", "sendingGetOpenApiSpec did not return OpenAPI 3.1");
    assert.equal(typeof value?.paths, "object", "sendingGetOpenApiSpec did not return paths");
    return;
  }

  assert.equal(value?.ok, true, `${operationId} did not return ok=true`);
  assert.equal(typeof value?.meta?.request_id, "string", `${operationId} did not return meta.request_id`);
}

function describeValueShape(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value !== "object") return typeof value;
  return JSON.stringify({
    constructor: value.constructor?.name,
    keys: Object.keys(value).slice(0, 10),
    textType: typeof value.text,
    textLength: typeof value.text === "string" ? value.text.length : undefined,
  });
}

function assertPreparedResponse(value, operation, prepared) {
  if (prepared.expectedErrorCodes?.length) {
    const code = value?.error?.code;
    assert.equal(value?.ok, false, `${operation.operationId} expected a safe API error response`);
    assert.ok(
      prepared.expectedErrorCodes.includes(code),
      `${operation.operationId} returned unexpected error code ${String(code)}`,
    );
    assert.equal(typeof value?.meta?.request_id, "string", `${operation.operationId} did not return meta.request_id`);
    assert.ok(value.meta.request_id.length > 0, `${operation.operationId} returned empty meta.request_id`);
    return;
  }

  assertLiveResponse(value, operation);
}

function expectedErrorMatches(error, prepared) {
  if (!prepared.expectedErrorCodes?.length) {
    return false;
  }
  const body = error?.body;
  return (
    body?.ok === false &&
    prepared.expectedErrorCodes.includes(body.error?.code) &&
    typeof body.meta?.request_id === "string" && body.meta.request_id.length > 0
  );
}

function expectedCliErrorMatches(result, prepared) {
  if (childProcessInterrupted(result) || !prepared.expectedErrorCodes?.length) {
    return false;
  }
  try {
    const error = JSON.parse(result.stdout).error;
    return error?.name === "SendmuxApiError" && Number.isInteger(error.status) && error.status >= 400 && error.status < 600 && error.body?.ok === false && prepared.expectedErrorCodes.includes(error.body?.error?.code) && error.code === error.body.error.code && typeof error.requestId === "string" && error.requestId.length > 0 && error.requestId === error.body.meta?.request_id;
  } catch { return false; }
}

function passResult(adapter, operationId, statusCode) {
  return dropEmpty({
    adapter,
    operationId,
    status: "passed",
    statusCode,
  });
}

function failResult(adapter, operationId, error) {
  return {
    adapter,
    error: errorMessage(error),
    operationId,
    status: error instanceof UnmetPrecondition ? "unmet_precondition" : "failed",
  };
}

function errorMessage(error) {
  if (error?.body?.error) {
    return `API error ${String(error.code ?? "unknown").replace(/[^a-zA-Z0-9_]/g, "")} (HTTP ${Number(error.status) || "unknown"}); response details withheld`;
  }
  const message = (error instanceof Error ? error.message : String(error)).split("\n")[0];
  return message.replace(/https?:\/\/\S+/g, "[URL withheld]").replace(/smx_(?:root|mbx|agent)_\S+/g, "[credential withheld]");
}

function dropEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined) {
        return false;
      }
      if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0) {
        return false;
      }
      return true;
    }),
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
