#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = "packages/ts/cli/bin/run.js";
const operationsPath = "packages/ts/cli/src/generated/operations.ts";
const commandsDir = "packages/ts/cli/src/commands";
const mailboxKey = "smx_mbx_testkey1234567890";
const rootKey = "smx_root_testkey1234567890";
const envelope = {
  ok: true,
  data: {
    messages: [],
  },
  meta: {
    request_id: "req_cli_test",
  },
  pagination: {
    has_more: false,
  },
};
const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Sending API fixture",
    version: "1.0.0",
  },
  paths: {},
};

ensureCliBuilt();

const serverState = { requests: [] };
const tempHome = mkdtempSync(join(tmpdir(), "sendmux-cli-"));
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  serverState.requests.push({
    body: Buffer.concat(chunks),
    headers: request.headers,
    method: request.method,
    url: request.url ?? "",
  });
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify((request.url ?? "").startsWith("/openapi.json") ? openApiDocument : envelope));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  assertCliCommandCoverage();
  await assertCliArrayParameterSupport();

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const jsonResult = await runCli([
    "mailbox:messages:list",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "limit=1",
    "--json",
  ]);

  if (jsonResult.status !== 0) {
    throw new Error(`mailbox:messages:list --json failed:\n${jsonResult.stderr}`);
  }

  const parsed = JSON.parse(jsonResult.stdout);
  assertDeepEqual(parsed, envelope, "--json must emit the raw API response envelope");

  const openApiResult = await runCli([
    "sending:get-open-api-spec",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--json",
  ]);

  assertCliSuccess(openApiResult, "sending:get-open-api-spec with mailbox key");
  assertDeepEqual(
    JSON.parse(openApiResult.stdout),
    openApiDocument,
    "--json must emit non-envelope API response payloads without the SDK response wrapper",
  );

  const identityResult = await runCli([
    "mailbox:get-identity",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "mailbox_id=mbx_cli_target",
    "--json",
  ]);

  assertCliSuccess(identityResult, "mailbox:get-identity with mailbox_id query");
  const identityRequest = latestRequest();
  if (!identityRequest.url.startsWith("/mailbox/identity")) {
    throw new Error(`mailbox:get-identity used the wrong path: ${identityRequest.url}`);
  }
  assertSearchParam(identityRequest.url, "mailbox_id", "mbx_cli_target");

  const countResult = await runCli([
    "mailbox:count-messages",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "min_size_bytes=10",
    "--query",
    "has_attachment=true",
    "--json",
  ]);

  if (countResult.status !== 0) {
    throw new Error(`mailbox:count-messages with typed query filters failed:\n${countResult.stderr}`);
  }

  const countRequest = latestRequest();
  assertSearchParam(countRequest.url, "min_size_bytes", "10");
  assertSearchParam(countRequest.url, "has_attachment", "true");

  const requestsBeforeInvalidQuery = serverState.requests.length;
  const invalidQueryResult = await runCli([
    "mailbox:count-messages",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "min_size_bytes=abc",
  ]);

  if (invalidQueryResult.status === 0) {
    throw new Error("mailbox:count-messages accepted a non-integer min_size_bytes query parameter");
  }

  if (!invalidQueryResult.stderr.includes('query parameter "min_size_bytes" must be an integer')) {
    throw new Error(`Expected integer validation error, got:\n${invalidQueryResult.stderr}`);
  }

  if (serverState.requests.length !== requestsBeforeInvalidQuery) {
    throw new Error("Invalid query parameter made a network request before rejecting");
  }

  const unknownQueryResult = await runCli([
    "mailbox:count-messages",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "unknown_filter=true",
  ]);

  if (unknownQueryResult.status === 0) {
    throw new Error("mailbox:count-messages accepted an unknown query parameter");
  }

  if (!unknownQueryResult.stderr.includes('Unknown query parameter "unknown_filter"')) {
    throw new Error(`Expected unknown query validation error, got:\n${unknownQueryResult.stderr}`);
  }

  if (serverState.requests.length !== requestsBeforeInvalidQuery) {
    throw new Error("Unknown query parameter made a network request before rejecting");
  }

  const headerRejectResult = await runCli([
    "management:domains:list",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--if-match",
    'W/"domain"',
  ]);

  if (headerRejectResult.status === 0) {
    throw new Error("management:domains:list accepted an unsupported If-Match header");
  }

  if (!headerRejectResult.stderr.includes("does not support the If-Match header")) {
    throw new Error(`Expected unsupported header validation error, got:\n${headerRejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestsBeforeInvalidQuery) {
    throw new Error("Unsupported header made a network request before rejecting");
  }

  const getDomainResult = await runCli([
    "management:domains:get",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--path",
    "public_id=mdom_cli_test",
    "--if-none-match",
    'W/"domain"',
    "--json",
  ]);

  assertCliSuccess(getDomainResult, "management:domains:get with path and If-None-Match");

  const getDomainRequest = latestRequest();
  if (!getDomainRequest.url.startsWith("/domains/mdom_cli_test")) {
    throw new Error(`Path parameter was not passed through correctly: ${getDomainRequest.url}`);
  }

  if (getDomainRequest.headers["if-none-match"] !== 'W/"domain"') {
    throw new Error("If-None-Match header was not passed through correctly");
  }

  const attachmentPath = join(tempHome, "attachment.bin");
  const attachmentBytes = Buffer.from([0, 1, 2, 255]);
  writeFileSync(attachmentPath, attachmentBytes);
  const uploadResult = await runCli([
    "mailbox:upload-attachment",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "filename=test.bin",
    "--body-file",
    attachmentPath,
    "--json",
  ]);

  assertCliSuccess(uploadResult, "mailbox:upload-attachment with binary body");

  const uploadRequest = latestRequest();
  assertSearchParam(uploadRequest.url, "filename", "test.bin");
  if (!uploadRequest.body.equals(attachmentBytes)) {
    throw new Error("Binary upload body was not passed through unchanged");
  }

  const missingRequiredQueryResult = await runCli([
    "mailbox:upload-attachment",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--body-file",
    attachmentPath,
  ]);

  if (missingRequiredQueryResult.status === 0) {
    throw new Error("mailbox:upload-attachment accepted a missing filename query parameter");
  }

  if (!missingRequiredQueryResult.stderr.includes('Missing query parameter "filename"')) {
    throw new Error(`Expected missing query validation error, got:\n${missingRequiredQueryResult.stderr}`);
  }

  const profileResult = await runCli([
    "profiles:set",
    "mbx",
    "--api-key",
    mailboxKey,
    "--default",
  ]);

  if (profileResult.status !== 0) {
    throw new Error(`profiles:set failed:\n${profileResult.stderr}`);
  }

  const requestCountBeforePreflight = serverState.requests.length;
  const rejectResult = await runCli([
    "management:domains:list",
    "--profile",
    "mbx",
    "--base-url",
    baseUrl,
  ]);

  if (rejectResult.status === 0) {
    throw new Error("management:domains:list accepted a mailbox API key");
  }

  if (!rejectResult.stderr.includes("requires a root API key")) {
    throw new Error(`Expected root-key preflight error, got:\n${rejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestCountBeforePreflight) {
    throw new Error("Root command preflight made a network request before rejecting a mailbox key");
  }

  const requestCountBeforeSendingPreflight = serverState.requests.length;
  const sendingRejectResult = await runCli([
    "sending:send",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--body",
    "{}",
  ]);

  if (sendingRejectResult.status === 0) {
    throw new Error("sending:send accepted a root API key");
  }

  if (!sendingRejectResult.stderr.includes("requires a mailbox API key")) {
    throw new Error(`Expected mailbox-key preflight error, got:\n${sendingRejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestCountBeforeSendingPreflight) {
    throw new Error("Sending command preflight made a network request before rejecting a root key");
  }

  const sendingResult = await runCli([
    "sending:send",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--body",
    "{}",
    "--idempotency-key",
    "idem_cli_send",
    "--json",
  ]);

  assertCliSuccess(sendingResult, "sending:send with mailbox key");

  if (latestRequest().headers["idempotency-key"] !== "idem_cli_send") {
    throw new Error("Idempotency-Key header was not passed through for sending:send");
  }

  const rootResult = await runCli([
    "management:domains:list",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--json",
  ]);

  assertCliSuccess(rootResult, "management:domains:list with root key");

  console.log("CLI gate checks passed.");
} finally {
  server.close();
  rmSync(tempHome, { force: true, recursive: true });
}

function ensureCliBuilt() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["--filter", "@sendmux/cli", "build"], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("CLI build failed before gate checks");
  }
}

function runCli(args) {
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
      reject(new Error(`CLI command timed out: ${args.join(" ")}`));
    }, 15_000);
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
      resolve({
        status,
        stderr,
        stdout,
      });
    });
  });
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

function assertCliSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertCliCommandCoverage() {
  const source = readFileSync(operationsPath, "utf8");
  const commands = [...source.matchAll(/"command": "([^"]+)"/g)].map((match) => match[1]);
  const uniqueCommands = new Set(commands);

  if (commands.length === 0) {
    throw new Error("CLI operation manifest did not contain any commands");
  }

  if (uniqueCommands.size !== commands.length) {
    throw new Error("CLI operation manifest contains duplicate command names");
  }

  const missing = [];
  for (const command of uniqueCommands) {
    const commandPath = join(commandsDir, ...command.split(":")) + ".ts";
    if (!existsSync(commandPath)) {
      missing.push(`${command} -> ${commandPath}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`CLI command modules are missing for generated operations:\n${missing.join("\n")}`);
  }
}

async function assertCliArrayParameterSupport() {
  const fixtureDir = mkdtempSync(join(tmpdir(), "sendmux-cli-array-spec-"));
  try {
    writeFileSync(
      join(fixtureDir, "openapi-app.json"),
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "CLI array parameter fixture", version: "1.0.0" },
        paths: {
          "/array-probe": {
            get: {
              operationId: "managementArrayProbe",
              summary: "Array probe",
              parameters: [
                {
                  in: "query",
                  name: "event_types",
                  required: false,
                  schema: {
                    type: "array",
                    minItems: 1,
                    maxItems: 3,
                    items: {
                      type: "string",
                      enum: ["message.received", "sync_required"],
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    );
    writeFileSync(
      join(fixtureDir, "openapi-sending.json"),
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Empty Sending fixture", version: "1.0.0" },
        paths: {},
      }),
    );

    const generatedPath = join(fixtureDir, "operations.ts");
    const generateResult = spawnSync(
      process.execPath,
      [
        "scripts/generate-cli.mjs",
        "--input-dir",
        fixtureDir,
        "--output",
        generatedPath,
        "--cli-source-dir",
        join(fixtureDir, "cli-src"),
        "--commands-dir",
        join(fixtureDir, "commands"),
      ],
      { encoding: "utf8" },
    );
    if (generateResult.status !== 0) {
      throw new Error(`CLI generator array-parameter fixture failed:\n${generateResult.stderr}`);
    }

    const generated = readFileSync(generatedPath, "utf8");
    for (const expected of ['"type": "array"', '"items"', '"enum"', '"minItems": 1', '"maxItems": 3']) {
      if (!generated.includes(expected)) {
        throw new Error(`CLI generator dropped array parameter metadata: missing ${expected}`);
      }
    }

    const { parseOperationOptions } = await import("../packages/ts/cli/dist/operation-flags.js");
    const parsed = await parseOperationOptions(errorOnlyCommand(), {
      bodyKind: "none",
      command: "management:array-probe",
      description: "Array probe",
      headerParams: [],
      method: "get",
      operationId: "managementArrayProbe",
      path: "/array-probe",
      pathParams: [],
      queryParams: [
        {
          name: "event_types",
          required: false,
          schema: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "string",
              enum: ["message.received", "sync_required"],
            },
          },
        },
      ],
      responseKind: "json",
      requestBodyRequired: false,
      requiredKeyKind: "root",
      surface: "management",
    }, {
      query: ["event_types=message.received", "event_types=sync_required"],
    });

    assertDeepEqual(parsed.query?.event_types, ["message.received", "sync_required"], "Repeated array query flags must append instead of overwrite");
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

function errorOnlyCommand() {
  return {
    error(message, options) {
      const error = new Error(message);
      error.exit = options?.exit;
      throw error;
    },
  };
}

function latestRequest() {
  const request = serverState.requests.at(-1);
  if (!request) {
    throw new Error("Expected the test server to receive a request");
  }
  return request;
}

function assertSearchParam(url, name, expected) {
  const parsed = new URL(url, "http://127.0.0.1");
  const actual = parsed.searchParams.get(name);
  if (actual !== expected) {
    throw new Error(`Expected ${name}=${expected} in ${url}, got ${actual}`);
  }
}
