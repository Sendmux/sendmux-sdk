#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const operationsPath = "packages/ts/cli/src/generated/operations.ts";
const scenarioPath = "test/live-e2e/scenarios.json";
const fixtureRegistryPath = "test/live-e2e/fixtures.json";
const cliPath = "packages/ts/cli/bin/run.js";
const mcpPython = join(".tmp", "python-venv", "bin", "python");
const validAdapters = new Set(["sdk", "cli", "mcp"]);
const executionEnvName = "SENDMUX_LIVE_E2E";
const fixtureSetupEnvName = "SENDMUX_LIVE_E2E_FIXTURE_SETUP";
const fixtureSendAllowlistEnvName = "SENDMUX_LIVE_E2E_FIXTURE_SEND_TO";
const fixtureWebhookUrlAllowlistEnvName = "SENDMUX_LIVE_E2E_WEBHOOK_URL_ALLOWLIST";

const args = parseArgs(process.argv.slice(2));
const operations = loadOperations();
const scenarios = readJson(scenarioPath).scenarios ?? {};
const fixtures = readJson(fixtureRegistryPath);
const operationPlan = buildOperationPlan(operations, scenarios, fixtures);
const selectedOperations = selectOperations(operationPlan, args.operations);
const adapters = args.adapters.length > 0 ? args.adapters : ["sdk", "cli", "mcp"];

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

try {
  for (const operation of selectedOperations) {
    const request = await requestOptionsFor({ fixtureRuntime, fixtures, operation });
    if (adapters.includes("sdk")) {
      results.push(await runSdkOperation({ credentials, operation, request, sdk }));
    }
    if (adapters.includes("cli")) {
      results.push(await runCliOperation({ credentials, operation, request }));
    }
  }

  if (adapters.includes("mcp")) {
    const mcpRequests = new Map();
    for (const operation of selectedOperations) {
      mcpRequests.set(operation.operationId, await requestOptionsFor({ fixtureRuntime, fixtures, operation }));
    }
    results.push(...runMcpOperations({ credentials, operations: selectedOperations, requests: mcpRequests }));
  }
} finally {
  await fixtureRuntime.teardown();
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
    const registryEntry = fixtures.operations?.[operation.operationId];
    const reason = blockedReasonFor({ operation, registryEntry, scenario });
    return {
      operation,
      reason,
      status: reason ? "blocked" : "executable",
    };
  });
}

function blockedReasonFor({ operation, registryEntry, scenario }) {
  if (!scenario) {
    return "missing live E2E scenario";
  }
  if (scenario.risk !== "read") {
    return `requires ${scenario.gates.join(" and ")}`;
  }
  if (scenario.mode === "read") {
    return null;
  }
  if (scenario.mode === "read_fixture") {
    return isValidFixtureRegistryEntry(operation, registryEntry)
      ? null
      : `missing executable fixture registry entry in ${fixtureRegistryPath}`;
  }
  return `requires ${scenario.gates.join(" and ") || `${scenario.mode} fixture support`}`;
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
  const executable = plan.filter((entry) => entry.status === "executable").map((entry) => entry.operation);
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
      throw new Error(`${operationId} is blocked: ${entry.reason}`);
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
  console.log("Protected live E2E plan:");
  console.log(`- Adapters: ${adapters.join(", ")}`);
  console.log(`- Executable operations: ${selectedOperations.length}`);
  console.log(`- Blocked gated operations: ${blocked.length}`);
  for (const [surface, list] of [...bySurface.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- ${surface}: ${list.length}`);
    for (const operation of list) {
      const mcp = scenarios[operation.operationId]?.adapters?.mcp;
      console.log(`  - ${operation.operationId}${mcp ? ` (MCP ${mcp})` : ""}`);
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
  for (const entry of plan.filter((item) => item.status === "blocked")) {
    const risk = scenarios[entry.operation.operationId]?.risk ?? "missing";
    blockedByRisk[risk] = (blockedByRisk[risk] ?? 0) + 1;
  }

  return {
    ok: true,
    adapters,
    summary: {
      blocked: plan.filter((entry) => entry.status === "blocked").length,
      blockedByRisk,
      executable: plan.filter((entry) => entry.status === "executable").length,
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

function assertAllScenariosExist(selectedOperations, scenarios) {
  const missing = selectedOperations.filter((operation) => !scenarios[operation.operationId]);
  if (missing.length > 0) {
    throw new Error(`Missing live E2E scenarios: ${missing.map((operation) => operation.operationId).join(", ")}`);
  }
}

function assertBuiltArtifacts(adapters) {
  if ((adapters.includes("sdk") || adapters.includes("cli")) && !existsSync("packages/ts/sdk/dist/index.js")) {
    throw new Error("Missing TypeScript SDK build output. Run `pnpm build` or `pnpm -r --if-present build` first.");
  }
  if (adapters.includes("cli") && !existsSync("packages/ts/cli/dist/index.js")) {
    throw new Error("Missing TypeScript CLI build output. Run `pnpm --filter @sendmux/cli build` first.");
  }
  if (adapters.includes("mcp") && !existsSync(mcpPython)) {
    throw new Error("Missing MCP Python venv. Run `pnpm build:mcp` first.");
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

async function runSdkOperation({ credentials, operation, request, sdk }) {
  try {
    const client = sdkClientFor({ credentials, operation, sdk });
    const module = sdk[operation.surface];
    const sdkOperation = module?.[operation.operationId];
    assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);

    const response = await sdkOperation({
      client,
      ...request,
    });
    assertLiveResponse(response.data, operation);

    return passResult("sdk", operation.operationId, response.response?.status);
  } catch (error) {
    return failResult("sdk", operation.operationId, error);
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

async function runCliOperation({ credentials, operation, request }) {
  const tempHome = mkdtempSync(join(tmpdir(), "sendmux-live-e2e-"));
  try {
    const apiKey = operation.requiredKeyKind === "root" ? credentials.rootApiKey : credentials.mailboxApiKey;
    const baseUrl = operation.surface === "sending" ? credentials.sendingBaseUrl : credentials.appBaseUrl;
    const cliArgs = [
      operation.command,
      "--api-key",
      apiKey,
      "--base-url",
      baseUrl,
      "--json",
      ...cliRequestArgsFor(request),
    ];
    const result = await runCli(cliArgs, tempHome);
    if (result.status !== 0) {
      throw new Error(`CLI exited ${result.status}: ${result.stderr}`);
    }
    const parsed = parseCliOutput(result.stdout, operation);
    assertLiveResponse(parsed, operation);
    return passResult("cli", operation.operationId);
  } catch (error) {
    return failResult("cli", operation.operationId, error);
  } finally {
    rmSync(tempHome, { force: true, recursive: true });
  }
}

function runCli(args, tempHome) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        HOME: tempHome,
        SENDMUX_API_KEY: "",
        SENDMUX_BASE_URL: "",
        SENDMUX_PROFILE: "",
        XDG_CONFIG_HOME: join(tempHome, ".config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI command timed out: ${args[0]}`));
    }, 30_000);
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

async function requestOptionsFor({ fixtureRuntime, fixtures, operation }) {
  const fixtureInputs = fixtures.operations?.[operation.operationId]?.inputs ?? {};
  const resolved = await resolveInputObject(fixtureRuntime, fixtureInputs);
  return dropEmpty({
    body: resolved.body,
    headers: resolved.headers,
    path: resolved.path,
    query: {
      ...defaultQueryFor(operation),
      ...(resolved.query ?? {}),
    },
  });
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

function cliRequestArgsFor(request) {
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
    args.push("--body", JSON.stringify(request.body));
  }
  return args;
}

function defaultQueryFor(operation) {
  const query = {};
  const queryParamNames = new Set(operation.queryParams.map((parameter) => parameter.name));
  if (queryParamNames.has("limit")) {
    query.limit = 1;
  }
  if (operation.operationId === "managementGetSpendSummary" && queryParamNames.has("days")) {
    query.days = 7;
  }
  return query;
}

function createFixtureRuntime({ credentials, fixtures, operations, runId, sdk }) {
  const sourceCache = new Map();
  const teardowns = [];
  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));

  return {
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

  return pollForWebhookDelivery({ credentials, eventId, operationsById, sdk, sourceName, webhookId });
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

function runMcpOperations({ credentials, operations, requests }) {
  const plan = operations
    .map((operation) => {
      const mcpToolName = scenarios[operation.operationId]?.adapters?.mcp;
      if (!mcpToolName) {
        return {
          adapter: "mcp",
          operationId: operation.operationId,
          reason: "operation is not part of the curated MCP set",
          status: "skipped",
        };
      }
      const request = requests.get(operation.operationId) ?? {};
      return {
        args: toolArgsForRequest(request),
        operationId: operation.operationId,
        responseKind: operation.responseKind,
        surface: operation.surface,
        toolName: mcpToolName,
      };
    });
  const executable = plan.filter((entry) => !entry.status);
  const skipped = plan.filter((entry) => entry.status);

  if (executable.length === 0) {
    return skipped;
  }

  const result = spawnSync(mcpPython, ["-m", "sendmux_mcp.live_e2e"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      SENDMUX_LIVE_E2E_APP_BASE_URL: credentials.appBaseUrl,
      SENDMUX_LIVE_E2E_MAILBOX_API_KEY: credentials.mailboxApiKey,
      SENDMUX_LIVE_E2E_MCP_PLAN: JSON.stringify({ operations: executable }),
      SENDMUX_LIVE_E2E_ROOT_API_KEY: credentials.rootApiKey,
      SENDMUX_LIVE_E2E_SENDING_BASE_URL: credentials.sendingBaseUrl,
    },
  });
  if (result.status !== 0) {
    return [
      ...skipped,
      {
        adapter: "mcp",
        error: result.stderr || result.stdout || `exit ${result.status}`,
        operationId: "mcp-plan",
        status: "failed",
      },
    ];
  }

  return [...skipped, ...JSON.parse(result.stdout).results];
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
