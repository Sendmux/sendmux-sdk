#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const operationsPath = "packages/ts/cli/src/generated/operations.ts";
const scenarioPath = "test/live-e2e/scenarios.json";
const cliPath = "packages/ts/cli/bin/run.js";
const mcpPython = join(".tmp", "python-venv", "bin", "python");
const validAdapters = new Set(["sdk", "cli", "mcp"]);
const executionEnvName = "SENDMUX_LIVE_E2E";

const args = parseArgs(process.argv.slice(2));
const operations = loadOperations();
const scenarios = readJson(scenarioPath).scenarios ?? {};
const selectedOperations = selectOperations(operations, scenarios, args.operations);
const adapters = args.adapters.length > 0 ? args.adapters : ["sdk", "cli", "mcp"];

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.plan) {
  printPlan(selectedOperations, scenarios, adapters);
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
const results = [];

for (const operation of selectedOperations) {
  if (adapters.includes("sdk")) {
    results.push(await runSdkOperation({ credentials, operation, sdk }));
  }
  if (adapters.includes("cli")) {
    results.push(await runCliOperation({ credentials, operation }));
  }
}

if (adapters.includes("mcp")) {
  results.push(...runMcpOperations({ credentials, operations: selectedOperations }));
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
  console.log(`Usage: node scripts/run-live-e2e.mjs [--plan] [--adapter sdk,cli,mcp] [--operation operationId]

Runs the protected read-only live E2E slice. Normal CI should keep using pnpm check:live-e2e.

Execution requires:
  SENDMUX_LIVE_E2E=1
  SENDMUX_LIVE_E2E_ROOT_API_KEY or SENDMUX_STAGING_ROOT_API_KEY
  SENDMUX_LIVE_E2E_MAILBOX_API_KEY or SENDMUX_STAGING_MAILBOX_API_KEY

Optional:
  SENDMUX_LIVE_E2E_APP_BASE_URL or SENDMUX_STAGING_APP_BASE_URL
  SENDMUX_LIVE_E2E_SENDING_BASE_URL or SENDMUX_STAGING_SMTP_BASE_URL
  SENDMUX_LIVE_E2E_ALLOWED_APP_BASE_URLS
  SENDMUX_LIVE_E2E_ALLOWED_SENDING_BASE_URLS`);
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

function selectOperations(operations, scenarios, requestedIds) {
  const selected = operations.filter((operation) => isReadOnlyNoFixtureOperation(operation, scenarios[operation.operationId]));
  if (requestedIds.length === 0) {
    return selected;
  }

  const selectedById = new Map(selected.map((operation) => [operation.operationId, operation]));
  return requestedIds.map((operationId) => {
    const operation = selectedById.get(operationId);
    if (!operation) {
      throw new Error(`${operationId} is not part of the protected read-only live E2E slice.`);
    }
    return operation;
  });
}

function isReadOnlyNoFixtureOperation(operation, scenario) {
  return (
    operation.method === "get" &&
    operation.bodyKind === "none" &&
    operation.pathParams.length === 0 &&
    !operation.queryParams.some((parameter) => parameter.required) &&
    scenario?.mode === "read" &&
    scenario?.risk === "read" &&
    operation.operationId !== "mailboxStreamEvents"
  );
}

function printPlan(selectedOperations, scenarios, adapters) {
  const bySurface = new Map();
  for (const operation of selectedOperations) {
    const list = bySurface.get(operation.surface) ?? [];
    list.push(operation);
    bySurface.set(operation.surface, list);
  }

  console.log("Protected read-only live E2E plan:");
  console.log(`- Adapters: ${adapters.join(", ")}`);
  console.log(`- Operations: ${selectedOperations.length}`);
  for (const [surface, list] of [...bySurface.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- ${surface}: ${list.length}`);
    for (const operation of list) {
      const mcp = scenarios[operation.operationId]?.adapters?.mcp;
      console.log(`  - ${operation.operationId}${mcp ? ` (MCP ${mcp})` : ""}`);
    }
  }
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

async function runSdkOperation({ credentials, operation, sdk }) {
  try {
    const client = sdkClientFor({ credentials, operation, sdk });
    const module = sdk[operation.surface];
    const sdkOperation = module?.[operation.operationId];
    assert.equal(typeof sdkOperation, "function", `${operation.operationId} is not exported by @sendmux/sdk`);

    const response = await sdkOperation({
      client,
      ...requestOptionsFor(operation),
    });
    assertLiveResponse(response.data, operation.operationId);

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

async function runCliOperation({ credentials, operation }) {
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
      ...cliRequestArgsFor(operation),
    ];
    const result = await runCli(cliArgs, tempHome);
    if (result.status !== 0) {
      throw new Error(`CLI exited ${result.status}: ${result.stderr}`);
    }
    const parsed = JSON.parse(result.stdout);
    assertLiveResponse(parsed, operation.operationId);
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

function requestOptionsFor(operation) {
  return dropEmpty({
    query: defaultQueryFor(operation),
  });
}

function cliRequestArgsFor(operation) {
  const args = [];
  for (const [name, value] of Object.entries(defaultQueryFor(operation))) {
    args.push("--query", `${name}=${String(value)}`);
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

function runMcpOperations({ credentials, operations }) {
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
      return {
        args: defaultQueryFor(operation),
        operationId: operation.operationId,
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

function assertLiveResponse(value, operationId) {
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
