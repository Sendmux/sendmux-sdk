#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
const childHarnessTimeoutMs = 90_000;
const managementMailboxIdSelectors = ["data.mailbox.id"];
const managementMailboxKeyIdSelectors = ["data.credential.public_id"];
const managementMailboxKeySecretSelectors = ["data.credential.secret"];
const mailboxCredentialVisibilityRetryDelaysMs = [0, 250, 500, 1_000, 2_000, 4_000, 8_000, 15_000];
const customMcpOperations = [
  {
    bodyKind: "json",
    commandKeyKind: "mailbox",
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
  mailboxCreateFolder: prepareMailboxCreateFolder,
  mailboxDeleteFolder: prepareOwnedMailboxDeleteFolder,
  mailboxDeleteMessage: prepareOwnedMailboxDeleteMessage,
  mailboxGetMessageAttachment: prepareMailboxGetMessageAttachment,
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
  sendingSendEmail: prepareSendingSendEmail,
  sendingSendEmailBatch: prepareSendingSendEmailBatch,
};

const args = parseArgs(process.argv.slice(2));
const operations = [...loadOperations(), ...customMcpOperations].sort((left, right) =>
  left.operationId.localeCompare(right.operationId),
);
const scenarios = readJson(scenarioPath).scenarios ?? {};
const fixtures = readJson(fixtureRegistryPath);
const operationPlan = buildOperationPlan(operations, scenarios, fixtures);
const selectedOperations = selectOperations(operationPlan, args.operations);
const adapters = normaliseAdapters(args.adapters.length > 0 ? args.adapters : ["sdk", "cli", "mcp"]);

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.plan) {
  printPlan(operationPlan, selectedOperations, scenarios, adapters, args.json);
  process.exit(0);
}

if (process.env[executionEnvName] !== "1") {
  throw new Error(`Live E2E execution is protected. Set ${executionEnvName}=1 or run with --plan.`);
}

assertAdapters(adapters);
assertAllScenariosExist(selectedOperations, scenarios);
assertBuiltArtifacts(adapters);

const sdk = await import("@sendmux/sdk");
const credentials = credentialsForRun(sdk);
const fixtureRuntime = createFixtureRuntime({ credentials, fixtures, operations, runId: randomUUID(), sdk });
const results = [];
let teardownPromise;
const teardownOnce = () => {
  teardownPromise ??= fixtureRuntime.teardown();
  return teardownPromise;
};
const removeSignalHandlers = installTeardownSignalHandlers(teardownOnce);

try {
  for (const operation of selectedOperations) {
    for (const adapter of adapters) {
      if (operation.customMcpOnly && adapter !== "mcp") {
        results.push({
          adapter,
          operationId: operation.operationId,
          reason: "custom MCP-only operation",
          status: "skipped",
        });
        continue;
      }

      if (adapter === "mcp" && !isMcpCurated(operation)) {
        results.push(skippedMcpResult(operation));
        continue;
      }

      const prepared = await safeRequestOptionsFor({ adapter, fixtureRuntime, fixtures, operation });
      if (!prepared.ok) {
        results.push(failResult(adapter, operation.operationId, prepared.error));
        continue;
      }

      if (adapter === typescriptSdkAdapter) {
        results.push(await runSdkOperation({ credentials, operation, prepared: prepared.value, sdk }));
        continue;
      }

      if (adapter === "cli") {
        results.push(await runCliOperation({ credentials, operation, prepared: prepared.value }));
        continue;
      }

      if (adapter === "mcp") {
        results.push(
          ...(await runMcpOperations({
            credentials,
            operations: [operation],
            requests: new Map([[operation.operationId, prepared.value]]),
          })),
        );
        continue;
      }

      results.push(
        ...(await runLanguageSdkOperations({
          adapter,
          credentials,
          operations: [operation],
          requests: new Map([[operation.operationId, prepared.value]]),
        })),
      );
    }
  }
} catch (error) {
  results.push(failResult("runner", "live-e2e", error));
} finally {
  removeSignalHandlers();
  try {
    await teardownOnce();
  } catch (error) {
    results.push(failResult("runner", "teardown", error));
  }
}

const failed = results.filter((result) => result.status === "failed");
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));

if (failed.length > 0) {
  throw new Error(`Live E2E failed for ${failed.length} adapter operation(s).`);
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

function installTeardownSignalHandlers(teardown) {
  let isHandlingSignal = false;
  const handleSignal = async (signal) => {
    if (isHandlingSignal) {
      return;
    }
    isHandlingSignal = true;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    try {
      await teardown();
    } catch (error) {
      process.stderr.write(`Live E2E teardown failed after ${signal}: ${errorMessage(error)}\n`);
      process.exitCode = 1;
    } finally {
      process.exit();
    }
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

function selectOperations(plan, requestedIds) {
  const executable = plan
    .filter((entry) => entry.status === "executable" && !entry.operation.customMcpOnly)
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
    console.log(JSON.stringify(jsonPlan(plan, adapters), null, 2));
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

function jsonPlan(plan, adapters) {
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

function credentialsForRun(sdk) {
  const rootApiKey = envValue("SENDMUX_LIVE_E2E_ROOT_API_KEY", "SENDMUX_STAGING_ROOT_API_KEY");
  const mailboxApiKey = envValue("SENDMUX_LIVE_E2E_MAILBOX_API_KEY", "SENDMUX_STAGING_MAILBOX_API_KEY");
  const appBaseUrl = envValue("SENDMUX_LIVE_E2E_APP_BASE_URL", "SENDMUX_STAGING_APP_BASE_URL") ?? "https://app.sendmux.ai/api/v1";
  const sendingBaseUrl =
    envValue("SENDMUX_LIVE_E2E_SENDING_BASE_URL", "SENDMUX_STAGING_SMTP_BASE_URL") ??
    "https://smtp.sendmux.ai/api/v1";

  if (!rootApiKey) {
    throw new Error("Missing SENDMUX_LIVE_E2E_ROOT_API_KEY or SENDMUX_STAGING_ROOT_API_KEY.");
  }
  if (!mailboxApiKey) {
    throw new Error("Missing SENDMUX_LIVE_E2E_MAILBOX_API_KEY or SENDMUX_STAGING_MAILBOX_API_KEY.");
  }

  sdk.core.assertApiKeyKind(rootApiKey, "root");
  sdk.core.assertApiKeyKind(mailboxApiKey, "mailbox");
  assertAllowedBaseUrl("app", appBaseUrl, defaultAllowedAppBaseUrls());
  assertAllowedBaseUrl("sending", sendingBaseUrl, defaultAllowedSendingBaseUrls());

  return {
    appBaseUrl,
    mailboxApiKey,
    rootApiKey,
    sendingBaseUrl,
  };
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

    const response = await sdkOperation({
      client,
      ...prepared.request,
    });
    const value = response.data;
    assertPreparedResponse(value, operation, prepared);
    await prepared.afterResult?.(value);

    return passResult(typescriptSdkAdapter, operation.operationId, response.response?.status);
  } catch (error) {
    if (expectedErrorMatches(error, prepared)) {
      return passResult(typescriptSdkAdapter, operation.operationId);
    }
    return failResult(typescriptSdkAdapter, operation.operationId, error);
  }
}

async function runMailboxStreamSdkOperation({ client, prepared, sdkOperation }) {
  const controller = new AbortController();
  const timeoutMs = mailboxStreamTimeoutMs(prepared.request);
  let timeout;
  const operationPromise = (async () => {
    const response = await sdkOperation({
      client,
      ...prepared.request,
      signal: controller.signal,
    });
    return { response, value: await firstSseEvent(response, { controller }) };
  })();
  operationPromise.catch(() => undefined);

  try {
    return await Promise.race([
      operationPromise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`mailboxStreamEvents timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    controller.abort();
  }
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
  const tempHome = mkdtempSync(join(tmpdir(), "sendmux-live-e2e-"));
  try {
    const apiKey = operation.requiredKeyKind === "root" ? credentials.rootApiKey : credentials.mailboxApiKey;
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
    if (result.status !== 0) {
      if (expectedCliErrorMatches(result, prepared)) {
        return passResult("cli", operation.operationId);
      }
      throw new Error(`CLI exited ${result.status}: ${result.stderr}`);
    }
    const parsed = parseCliOutput(result.stdout, operation);
    assertPreparedResponse(parsed, operation, prepared);
    await prepared.afterResult?.(parsed);
    return passResult("cli", operation.operationId);
  } catch (error) {
    return failResult("cli", operation.operationId, error);
  } finally {
    rmSync(tempHome, { force: true, recursive: true });
  }
}

function runCli(args, tempHome, timeoutMs = 30_000, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        HOME: tempHome,
        SENDMUX_API_KEY: "",
        SENDMUX_BASE_URL: "",
        SENDMUX_PROFILE: "",
        XDG_CONFIG_HOME: join(tempHome, ".config"),
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI command timed out: ${args[0]}`));
    }, timeoutMs);
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stderr, stdout });
    });
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

  return JSON.parse(stdout);
}

async function requestOptionsFor({ adapter, fixtureRuntime, fixtures, operation }) {
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
  if (request.body !== undefined) {
    args.push("--body", operation.bodyKind === "binary" ? String(request.body) : JSON.stringify(request.body));
  }
  return args;
}

async function firstSseEvent(response, { controller } = {}) {
  const stream = response?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("mailboxStreamEvents did not return an async stream");
  }
  const iterator = stream[Symbol.asyncIterator]();
  let timeout;
  try {
    const next = await Promise.race([
      iterator.next(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller?.abort();
          reject(new Error("mailboxStreamEvents timed out waiting for an event"));
        }, 20_000);
      }),
    ]);
    if (!next.done) {
      return next.value;
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    controller?.abort();
    await closeAsyncIterator(iterator);
  }
  throw new Error("mailboxStreamEvents ended before yielding an event");
}

async function closeAsyncIterator(iterator) {
  if (typeof iterator.return !== "function") {
    return;
  }
  await Promise.race([iterator.return(), sleep(1_000)]).catch(() => undefined);
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
  const original = identityRestoreBody(await fixtureRuntime.runOperation("mailboxGetIdentity"));
  fixtureRuntime.addTeardown(() => restoreMailboxIdentity(fixtureRuntime, original));
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
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("mailboxUpdateIdentity", { body }));
}

async function prepareMailboxUploadAttachment({ adapter, fixtureRuntime }) {
  const content = `Sendmux live E2E attachment ${fixtureRuntime.runId}\n`;
  const filename = `live-e2e-${fixtureRuntime.runId}.txt`;
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
    afterResult: async (value) => {
      if (adapter !== "mcp") return;
      const downloadUrl = selectFirstValue(value, ["data.download_url"]);
      assert.equal(typeof downloadUrl, "string", "mailbox_get_attachment did not return data.download_url");
      await assertPresignedAttachmentDownload({
        downloadUrl,
        expectedContent: owned.attachmentContent,
      });
      await assertPresignedAttachmentRejectsTamper(downloadUrl);
    },
    returnResult: adapter === "mcp",
  };
}

async function prepareMailboxWaitForMessage({ fixtureRuntime }) {
  const owned = await createOwnedMailboxMessage(fixtureRuntime, {
    attachment: true,
    label: "wait-for-message",
  });
  return {
    request: {
      body: {
        has_attachment: true,
        message_id: owned.messageId,
        timeout_seconds: 5,
      },
    },
    afterResult: async (value) => {
      const message = valueAtPath(value, "data.message");
      assert.ok(message && typeof message === "object", "mailbox_wait_for_message did not return data.message");
      assert.equal(valueAtPath(value, "data.message.id"), owned.messageId);
      const attachments = valueAtPath(value, "data.message.attachments");
      assert.ok(Array.isArray(attachments), "mailbox_wait_for_message did not return attachment metadata");
      const attachment = attachments.find((item) => item?.id === owned.attachmentId);
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

async function prepareMailboxSendMessage({ fixtureRuntime }) {
  const recipient = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient, sourceName: "mailboxSendMessage" });
  return {
    cleanupSelectors: ["data.message_id"],
    request: {
      body: mailboxSendBody({ fixtureRuntime, recipient, subjectLabel: "mailbox-send-message" }),
      headers: {
        "Idempotency-Key": fixtureRuntime.idempotencyKey("mailbox-send-message"),
      },
    },
    afterResult: async (value) => {
      const messageId = selectFirstValue(value, ["data.message_id"]);
      if (messageId) await cleanupMailboxMessage(fixtureRuntime, messageId);
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
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("mailboxDeleteMessage", { path: { message_id: messageId } }));
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

async function assertPresignedAttachmentDownload({ downloadUrl, expectedContent }) {
  const response = await fetch(downloadUrl);
  assert.equal(response.status, 200, `presigned attachment download returned ${response.status}`);
  const actual = await response.text();
  assert.equal(actual, expectedContent, "presigned attachment download returned unexpected bytes");
}

async function assertPresignedAttachmentRejectsTamper(downloadUrl) {
  const url = new URL(downloadUrl);
  const token = url.searchParams.get("download_token");
  assert.equal(typeof token, "string", "presigned attachment URL is missing download_token");
  url.searchParams.set("download_token", `${token}tampered`);
  const response = await fetch(url);
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
  const webhookId = await fixtureRuntime.resolveSource("managementWebhookId");
  const original = webhookRestoreBody(
    await fixtureRuntime.runOperation("managementGetWebhook", { path: { public_id: webhookId } }),
  );
  fixtureRuntime.addTeardown(() => restoreWebhook(fixtureRuntime, webhookId, original));
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
  const webhookId = await fixtureRuntime.resolveSource("managementWebhookId");
  const original = webhookRestoreBody(
    await fixtureRuntime.runOperation("managementGetWebhook", { path: { public_id: webhookId } }),
  );
  fixtureRuntime.addTeardown(() => restoreWebhook(fixtureRuntime, webhookId, original));
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
  const domain = await managementDomainName(fixtureRuntime);
  return {
    expectedErrorCodes: ["conflict"],
    request: {
      body: { domain },
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("management-create-domain") },
    },
  };
}

async function prepareOwnedDomainDelete({ fixtureRuntime }) {
  return {
    expectedErrorCodes: ["not_found"],
    request: { path: { public_id: `mdom_live_e2e_missing_${fixtureRuntime.runId.replace(/-/g, "")}` } },
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
  const domainId = await fixtureRuntime.resolveSource("managementDomainId");
  const original = await fixtureRuntime.runOperation("managementGetDomainFilters", { path: { public_id: domainId } });
  const restoreBody = filterStateBody(original, "managementGetDomainFilters");
  fixtureRuntime.addTeardown(() => restoreDomainFilters(fixtureRuntime, domainId, restoreBody));
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
  const domainId = await fixtureRuntime.resolveSource("managementDomainId");
  return { request: { path: { public_id: domainId } } };
}

async function prepareSendingSendEmail({ fixtureRuntime }) {
  const email = await fixtureRuntime.resolveSource("mailboxSelfEmail");
  assertFixtureRecipientAllowed({ recipient: email, sourceName: "sendingSendEmail" });
  return {
    request: {
      body: sendingEmailBody({ email, fixtureRuntime, subjectLabel: "send" }),
      headers: { "Idempotency-Key": fixtureRuntime.idempotencyKey("sending-send-email") },
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
  return selectFirstValue(response, ["data.limit.can_request_increase"]) === true;
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
  const domainId = await fixtureRuntime.resolveSource("managementDomainId");
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

async function assertLimitRequestUnavailable({ fixtureRuntime, label, operationId, selectors }) {
  const response = await fixtureRuntime.runOperation(operationId);
  const canRequest = selectors.map((selector) => valueAtPath(response, selector)).find((value) => value !== undefined);
  if (canRequest === true) {
    throw new Error(`${label} would create a durable request in this environment; no cleanup path is available.`);
  }
}

async function cleanupProvider(fixtureRuntime, providerId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeleteProvider", { path: { public_id: providerId } }));
}

async function cleanupWebhook(fixtureRuntime, webhookId) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementDeleteWebhook", { path: { public_id: webhookId } }));
}

async function restoreWebhook(fixtureRuntime, webhookId, body) {
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementUpdateWebhook", { body, path: { public_id: webhookId } }));
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
  await ignoreCleanupErrors(() => fixtureRuntime.runOperation("managementSetDomainFilters", { body, path: { public_id: domainId } }));
}

async function ignoreCleanupErrors(fn) {
  try {
    await fn();
  } catch {
    // best-effort cleanup for resources that may have been deleted by the operation under test
  }
}

function requireSelectedValue(value, selectors, label) {
  const selected = selectFirstValue(value, selectors);
  if (!selected) {
    throw new Error(`Missing ${label}`);
  }
  return selected;
}

function createFixtureRuntime({ credentials, fixtures, operations, runId, sdk }) {
  const idempotencyCounts = new Map();
  const resourceCounts = new Map();
  const runSlug = runId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  const sourceCache = new Map();
  const teardowns = [];
  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));

  return {
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
      const operation = operationsById.get(operationId);
      if (!operation) {
        throw new Error(`Unknown fixture setup operation ${operationId}`);
      }
      const client = sdkClientFor({ credentials, operation, sdk });
      const sdkOperation = sdk[operation.surface]?.[operation.operationId];
      assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);
      const response = await sdkOperation({ client, ...request });
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
      const response = await sdkOperation({ client, ...request });
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
      const errors = [];
      for (const teardown of teardowns.reverse()) {
        try {
          await teardown();
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (errors.length > 0) {
        throw new Error(`Live E2E fixture teardown failed: ${errors.join("; ")}`);
      }
    },
    async resolveSource(sourceName) {
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

      const response = await sdkOperation({ client, ...request });
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
        throw new Error(
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
    throw new Error(
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
  const response = await sdk.mailbox.mailboxSendMessage({
    client,
    headers: {
      "Idempotency-Key": `live-e2e-${runId}-${sourceName}`,
    },
    body: {
      subject: `${subjectPrefix} ${runId}`,
      text_body: `Automated Sendmux live E2E fixture ${runId}.`,
      to: [{ email: recipient, name: null }],
    },
  });
  assertLiveResponse(response.data, "mailboxSendMessage");

  const messageId = selectFirstValue(response.data, ["data.message_id"]);
  if (!messageId) {
    throw new Error(`${sourceName} setup did not receive a message_id from mailboxSendMessage.`);
  }

  return pollForMailboxSubmission({ credentials, messageId, operationsById, sdk, sourceName });
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
  const response = await sdk.management.managementCreateWebhook({
    client,
    headers: {
      "Idempotency-Key": `live-e2e-${runId}-${sourceName}-create`,
    },
    body: {
      enabled: true,
      event_types: ["sendmux.test"],
      name: `${namePrefix} ${runId}`,
      url: webhookUrl,
    },
  });
  assertLiveResponse(response.data, "managementCreateWebhook");
  const webhookId = selectFirstValue(response.data, ["data.id"]);
  if (!webhookId) {
    throw new Error(`${sourceName} setup did not receive a webhook id from managementCreateWebhook.`);
  }

  teardowns.push(async () => {
    const deleteResponse = await sdk.management.managementDeleteWebhook({
      client,
      path: { public_id: webhookId },
    });
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
  const webhookId = await resolveFixtureValue(runtime, source.setup.webhook);
  assert.equal(typeof webhookId, "string", `${sourceName} setup webhook must resolve to a string`);
  const original = webhookRestoreBody(await runtime.runOperation("managementGetWebhook", { path: { public_id: webhookId } }));
  runtime.addTeardown(() => restoreWebhook(runtime, webhookId, original));
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
  const response = await sdk.management.managementTestWebhook({
    client,
    headers: {
      "Idempotency-Key": `live-e2e-${runId}-${sourceName}-test`,
    },
    path: { public_id: webhookId },
  });
  assertLiveResponse(response.data, "managementTestWebhook");

  const eventId = selectFirstValue(response.data, ["data.event_id"]);
  if (!eventId) {
    throw new Error(`${sourceName} setup did not receive an event_id from managementTestWebhook.`);
  }

  const deliveryId = await pollForWebhookDelivery({ credentials, eventId, operationsById, sdk, sourceName, webhookId });
  await restoreWebhook(runtime, webhookId, original);
  return deliveryId;
}

function assertFixtureRecipientAllowed({ recipient, sourceName }) {
  const allowed = new Set(parseCsv(process.env[fixtureSendAllowlistEnvName] ?? ""));
  if (!allowed.has(recipient)) {
    throw new Error(
      `Fixture source ${sourceName} setup recipient ${recipient} is not allowlisted by ${fixtureSendAllowlistEnvName}.`,
    );
  }
}

async function pollForMailboxSubmission({ credentials, messageId, operationsById, sdk, sourceName }) {
  const operation = operationsById.get("mailboxListSubmissions");
  if (!operation) {
    throw new Error(`${sourceName} setup requires mailboxListSubmissions in the OpenAPI operation manifest.`);
  }

  const client = sdkClientFor({ credentials, operation, sdk });
  const deadline = Date.now() + 30_000;
  let lastRequestId = "unknown";
  while (Date.now() < deadline) {
    const response = await sdk.mailbox.mailboxListSubmissions({
      client,
      query: { email_ids: messageId, limit: 1 },
    });
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

async function pollForWebhookDelivery({ credentials, eventId, operationsById, sdk, sourceName, webhookId }) {
  const operation = operationsById.get("managementListDelivery");
  if (!operation) {
    throw new Error(`${sourceName} setup requires managementListDelivery in the OpenAPI operation manifest.`);
  }

  const client = sdkClientFor({ credentials, operation, sdk });
  const deadline = Date.now() + 60_000;
  let lastRequestId = "unknown";
  while (Date.now() < deadline) {
    const response = await sdk.management.managementListDelivery({
      client,
      path: { public_id: webhookId },
      query: { event_type: "sendmux.test", limit: 10 },
    });
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
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
      return {
        args: toolArgsForRequest(prepared.request),
        cleanupSelectors: prepared.cleanupSelectors,
        expectedErrorCodes: prepared.expectedErrorCodes,
        operationId: operation.operationId,
        responseKind: operation.responseKind,
        returnResult: prepared.returnResult === true,
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
  if (result.status !== 0) {
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
  const mcpResults = parsed.results ?? [];
  const preparedById = new Map([...requests.entries()]);
  for (const result of mcpResults) {
    if (result.status !== "passed") continue;
    const prepared = preparedById.get(result.operationId);
    if (prepared?.afterResult) {
      const value = result.result ?? result.cleanup;
      if (value !== undefined) {
        await prepared.afterResult(value);
      }
    }
  }
  return [...skipped, ...mcpResults.map(({ cleanup, result, ...item }) => item)];
}

async function runLanguageSdkOperations({ adapter, credentials, operations, requests }) {
  const executable = operations.map((operation) => {
    const prepared = requests.get(operation.operationId) ?? { request: {} };
    return {
      bodyKind: operation.bodyKind,
      cleanupSelectors: prepared.cleanupSelectors,
      expectedErrorCodes: prepared.expectedErrorCodes,
      operationId: operation.operationId,
      request: prepared.request,
      responseKind: operation.responseKind,
      risk: scenarios[operation.operationId]?.risk,
      surface: operation.surface,
    };
  });
  const command = languageCommand(adapter);
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
  if (result.status !== 0) {
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
  const languageResults = parsed.results ?? [];
  const preparedById = new Map([...requests.entries()]);
  for (const item of languageResults) {
    if (item.status !== "passed") continue;
    const prepared = preparedById.get(item.operationId);
    if (prepared?.afterResult && item.cleanup) {
      await prepared.afterResult(item.cleanup);
    }
  }
  return languageResults.map(({ cleanup, ...item }) => item);
}

function planFailureOperationId(adapter, operations) {
  return operations.length === 1 ? operations[0].operationId : `${adapter}-plan`;
}

function childProcessFailureMessage(result) {
  if (result.error) {
    return result.error instanceof Error ? result.error.message : String(result.error);
  }
  if (result.timedOut) {
    return `timed out after ${result.timeout}ms`;
  }
  return result.stderr || result.stdout || `exit ${result.status}`;
}

function runChildHarness(bin, args, { cwd, env, timeout }) {
  return new Promise((resolve) => {
    const detached = process.platform !== "win32";
    const child = spawn(bin, args, {
      cwd,
      detached,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const forceKill = setTimeout(() => {
      if (!settled && timedOut) {
        killChildTree(child, "SIGKILL", detached);
      }
    }, timeout + 5_000);
    forceKill.unref?.();

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killChildTree(child, "SIGTERM", detached);
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
      clearTimeout(timeoutTimer);
      clearTimeout(forceKill);
      settled = true;
      resolve({ error, status: null, stderr, stdout, timedOut, timeout });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKill);
      settled = true;
      resolve({ signal, status, stderr, stdout, timedOut, timeout });
    });
  });
}

function killChildTree(child, signal, detached) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(detached ? -child.pid : child.pid, signal);
  } catch {
    // The child may have exited between timeout and signal delivery.
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
    status: "skipped",
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
    typeof body.meta?.request_id === "string"
  );
}

function expectedCliErrorMatches(result, prepared) {
  if (!prepared.expectedErrorCodes?.length) {
    return false;
  }
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return prepared.expectedErrorCodes.some((code) => combined.includes(code));
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
    error: error instanceof Error ? error.message : String(error),
    operationId,
    status: "failed",
  };
}

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
