#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const specs = [
  { file: "openapi-app.json" },
  { file: "openapi-sending.json" },
];
const httpMethods = new Set(["delete", "get", "patch", "post", "put"]);
const writeMatrix = process.argv.includes("--write");
const inputDir = resolve(process.env.OPENAPI_INPUT_DIR ?? findDefaultInputDir());
const matrixPath = resolve("docs/surface-coverage.md");

const operations = loadOperations(inputDir);
const cliOperations = loadCliOperations();
const curatedMcp = loadMcpCuration();
const failures = [];
const rows = [];

for (const operation of operations) {
  const sdk = hasTypeScriptSdkOperation(operation);
  const cli = cliOperations.get(operation.operationId);
  const commandModule = cli ? hasCliCommandModule(cli.command) : false;
  const mcp = mcpDecision(operation, curatedMcp);
  const cliParity = cli ? compareCliOperation(operation, cli) : ["missing CLI operation manifest entry"];

  if (!sdk) {
    failures.push(`${operation.operationId}: missing TypeScript SDK operation export`);
  }

  if (!cli) {
    failures.push(`${operation.operationId}: missing CLI operation manifest entry`);
  } else if (!commandModule) {
    failures.push(`${operation.operationId}: missing CLI command module ${cli.command}`);
  }

  for (const issue of cliParity) {
    failures.push(`${operation.operationId}: ${issue}`);
  }

  if (!mcp.reason) {
    failures.push(`${operation.operationId}: missing MCP curation include/exclude decision`);
  }

  rows.push({
    ...operation,
    cli: cli && commandModule && cliParity.length === 0 ? `yes (${cli.command})` : "no",
    mcp: mcp.included ? `tool (${mcp.toolName})` : "excluded",
    mcpReason: mcp.reason ?? "",
    optionParity: cliParity.length === 0 ? "full" : `failed: ${cliParity.join("; ")}`,
    sdk: sdk ? "yes" : "no",
  });
}

for (const operationId of curatedMcp.keys()) {
  if (!operations.some((operation) => operation.operationId === operationId)) {
    failures.push(`${operationId}: curated MCP operation is not present in the OpenAPI snapshots`);
  }
}

const matrix = renderMatrix(rows);
if (writeMatrix) {
  mkdirSync(dirname(matrixPath), { recursive: true });
  writeFileSync(matrixPath, matrix);
} else if (!existsSync(matrixPath) || readFileSync(matrixPath, "utf8") !== matrix) {
  failures.push(`Coverage matrix is stale. Run node scripts/check-surface-coverage.mjs --write`);
}

if (failures.length > 0) {
  throw new Error(`Surface coverage checks failed:\n${failures.join("\n")}`);
}

console.log(`Surface coverage checks passed for ${operations.length} OpenAPI operations.`);

function findDefaultInputDir() {
  for (const candidate of ["sendmux-docs", "../sendmux-docs"]) {
    if (specs.every((spec) => existsSync(join(candidate, spec.file)))) {
      return candidate;
    }
  }
  return "sendmux-docs";
}

function loadOperations(dir) {
  const out = [];
  const seen = new Set();

  for (const { file } of specs) {
    const spec = readJson(join(dir, file));
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      const pathParameters = normaliseParameters(spec, pathItem.parameters);
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!httpMethods.has(method) || !operation?.operationId) {
          continue;
        }

        if (seen.has(operation.operationId)) {
          throw new Error(`Duplicate operationId in OpenAPI snapshots: ${operation.operationId}`);
        }
        seen.add(operation.operationId);

        const parameters = [...pathParameters, ...normaliseParameters(spec, operation.parameters)];
        const surface = surfaceForOperationId(operation.operationId);
        out.push({
          bodyKind: bodyKindForOperation(operation),
          commandKeyKind: surface === "management" ? "root" : "mailbox",
          description: oneLine(operation.summary ?? operation.description ?? operation.operationId),
          headerParams: parameters.filter((parameter) => parameter.in === "header").map(toPublicParameter),
          method,
          operationId: operation.operationId,
          path,
          pathParams: parameters.filter((parameter) => parameter.in === "path").map(toPublicParameter),
          queryParams: parameters.filter((parameter) => parameter.in === "query").map(toPublicParameter),
          responseKind: responseKindForOperation(operation),
          requestBodyRequired: Boolean(operation.requestBody?.required),
          surface,
        });
      }
    }
  }

  out.sort((left, right) => left.operationId.localeCompare(right.operationId));
  return out;
}

function loadCliOperations() {
  const source = readFileSync("packages/ts/cli/src/generated/operations.ts", "utf8");
  const match = source.match(/export const operations = ([\s\S]*?) as const satisfies/);
  if (!match) {
    throw new Error("Could not parse CLI operation manifest");
  }

  const operationsObject = Function(`"use strict"; return (${match[1]});`)();
  return new Map(Object.entries(operationsObject));
}

function loadMcpCuration() {
  const source = readFileSync("packages/python/mcp/sendmux_mcp/curation.py", "utf8");
  const entries = new Map();

  for (const match of source.matchAll(/operation_id="([^"]+)"[\s\S]*?name="([^"]+)"/g)) {
    entries.set(match[1], match[2]);
  }

  if (entries.size === 0) {
    throw new Error("Could not parse MCP curation operation IDs");
  }

  return entries;
}

function normaliseParameters(spec, parameters) {
  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters
    .filter((parameter) => parameter && typeof parameter === "object")
    .map((parameter) => resolveParameter(spec, parameter))
    .map((parameter) => ({
      in: parameter.in,
      name: parameter.name,
      required: Boolean(parameter.required),
      schema: normaliseSchema(spec, parameter.schema),
    }))
    .filter((parameter) => typeof parameter.in === "string" && typeof parameter.name === "string");
}

function resolveParameter(spec, parameter) {
  if (!parameter.$ref) {
    return parameter;
  }

  const name = parameter.$ref.split("/").pop();
  const resolved = spec.components?.parameters?.[name];
  if (!resolved) {
    throw new Error(`Unresolved OpenAPI parameter reference: ${parameter.$ref}`);
  }
  return resolved;
}

function normaliseSchema(spec, schema) {
  const resolved = resolveSchema(spec, schema);
  if (!resolved || typeof resolved !== "object") {
    return { type: "string" };
  }

  const type = Array.isArray(resolved.type) ? resolved.type.find((value) => value !== "null") : resolved.type;
  const normalised = {
    type: typeof type === "string" ? type : "string",
  };

  if (normalised.type === "array") {
    normalised.items = normaliseArrayItemSchema(spec, resolved.items);
  }

  if (Array.isArray(resolved.enum)) {
    normalised.enum = resolved.enum.filter((value) => typeof value === "string" || typeof value === "number");
  }

  for (const key of ["maximum", "maxItems", "maxLength", "minimum", "minItems", "minLength"]) {
    if (typeof resolved[key] === "number") {
      normalised[key] = resolved[key];
    }
  }

  if (typeof resolved.pattern === "string") {
    normalised.pattern = resolved.pattern;
  }

  return normalised;
}

function normaliseArrayItemSchema(spec, schema) {
  const normalised = normaliseSchema(spec, schema);
  if (normalised.type === "array") {
    return { type: "string" };
  }
  return normalised;
}

function resolveSchema(spec, schema) {
  if (!schema?.$ref) {
    return schema;
  }

  const name = schema.$ref.split("/").pop();
  const resolved = spec.components?.schemas?.[name];
  if (!resolved) {
    throw new Error(`Unresolved OpenAPI schema reference: ${schema.$ref}`);
  }
  return resolveSchema(spec, resolved);
}

function toPublicParameter(parameter) {
  return {
    name: parameter.name,
    required: parameter.required,
    schema: parameter.schema,
  };
}

function bodyKindForOperation(operation) {
  const contentTypes = Object.keys(operation.requestBody?.content ?? {});
  if (contentTypes.length === 0) {
    return "none";
  }
  if (contentTypes.includes("application/json")) {
    return "json";
  }
  if (contentTypes.includes("application/octet-stream")) {
    return "binary";
  }
  return "unsupported";
}

function responseKindForOperation(operation) {
  const contentTypes = Object.keys(operation.responses?.["200"]?.content ?? {});
  if (contentTypes.includes("application/json")) {
    return "json";
  }
  if (contentTypes.includes("text/plain")) {
    return "text";
  }
  if (contentTypes.includes("application/octet-stream")) {
    return "binary";
  }
  return "json";
}

function surfaceForOperationId(operationId) {
  if (operationId.startsWith("mailbox")) {
    return "mailbox";
  }
  if (operationId.startsWith("management")) {
    return "management";
  }
  if (operationId.startsWith("sending")) {
    return "sending";
  }
  throw new Error(`Operation ${operationId} does not use a known Sendmux surface prefix`);
}

function hasTypeScriptSdkOperation(operation) {
  const source = readFileSync(`packages/ts/${operation.surface}/src/generated/sdk.gen.ts`, "utf8");
  return source.includes(`export const ${operation.operationId} =`);
}

function hasCliCommandModule(command) {
  return existsSync(join("packages/ts/cli/src/commands", ...command.split(":")) + ".ts");
}

function compareCliOperation(operation, cli) {
  const issues = [];
  const expected = {
    bodyKind: operation.bodyKind,
    headerParams: operation.headerParams,
    method: operation.method,
    operationId: operation.operationId,
    path: operation.path,
    pathParams: operation.pathParams,
    queryParams: operation.queryParams,
    responseKind: operation.responseKind,
    requestBodyRequired: operation.requestBodyRequired,
    requiredKeyKind: operation.commandKeyKind,
    surface: operation.surface,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualJson = stableJson(cli[key]);
    const expectedJson = stableJson(expectedValue);
    if (actualJson !== expectedJson) {
      issues.push(`CLI ${key} drifted; expected ${expectedJson}, got ${actualJson}`);
    }
  }

  return issues;
}

function mcpDecision(operation, curatedMcp) {
  const toolName = curatedMcp.get(operation.operationId);
  if (toolName) {
    return {
      included: true,
      reason: "Included in the curated agentic toolset.",
      toolName,
    };
  }

  return {
    included: false,
    reason: mcpExclusionReason(operation),
  };
}

function mcpExclusionReason(operation) {
  const id = operation.operationId;

  if (id === "sendingGetOpenApiSpec") {
    return "Meta endpoint; SDK and CLI need it, but MCP tools are generated from the spec snapshot and should not expose spec download as an agent action.";
  }

  if (id === "mailboxUploadAttachment" || id === "mailboxGetMessageAttachment") {
    return "Binary payload endpoint; MCP curation keeps large/binary transfer outside the toolset and uses message/content tools for agentic reading and sending.";
  }

  if (id === "mailboxStreamEvents") {
    return "Streaming endpoint; MCP tools are request/response actions and hosted clients should use the MCP session transport rather than an API SSE stream.";
  }

  if (/^(mailboxCreateFolder|mailboxDeleteFolder|mailboxUpdateFolder|mailboxGetFolder|mailboxGetFolderChanges|mailboxQueryFolderChanges)$/.test(id)) {
    return "Folder administration is intentionally narrow in MCP; agents get folder discovery and message batch updates without exposing folder lifecycle mutations by default.";
  }

  if (/^(mailboxDeleteMessage|mailboxUpdateMessage)$/.test(id)) {
    return "Single-message mutation is omitted in favour of batch update/delete tools, which make target sets explicit and reduce accidental repeated mutations.";
  }

  if (/^(mailboxGetQuotaChanges|mailboxListQuotas|mailboxListUsage)$/.test(id)) {
    return "Mailbox quota/usage diagnostics are account-state endpoints, not high-value agentic mail tasks.";
  }

  if (/^(mailboxGetSubmission|mailboxGetSubmissionChanges|mailboxListSubmissions)$/.test(id)) {
    return "Submission-state sync endpoints are implementation/status detail; agents use send tools and message/log reads for user-visible work.";
  }

  if (/^(mailboxGetThreadContent|mailboxQueryMessageChanges)$/.test(id)) {
    return "Covered by curated thread/message listing plus message body/content tools; omitted to keep overlapping read paths small.";
  }

  if (/^managementList(Balance|Transactions)$/.test(id)) {
    return "Raw billing ledger/balance endpoints are excluded; MCP includes spend summary for account-level spend questions.";
  }

  if (/^management(GetInboxLog|ListInboxLogs)$/.test(id)) {
    return "Inbound log inspection is excluded because Mailbox API tools expose the agentic inbox workflow directly.";
  }

  if (/^management(SetDomainFilters|GetDomainFilters|SetMailboxFilters|GetMailboxFilters)$/.test(id)) {
    return "Sender-filter policy endpoints are specialised configuration; excluded until there is a dedicated guarded MCP workflow for policy edits.";
  }

  if (id === "managementUpdateDomain") {
    return "Domain mode upgrades are irreversible and DNS-sensitive; excluded from default MCP curation until there is a dedicated guarded domain-upgrade workflow.";
  }

  if (/^management(DeleteDomain|DeleteMailbox|DeleteProvider|DeleteWebhook)$/.test(id)) {
    return "Destructive resource lifecycle endpoint; intentionally excluded from default MCP curation.";
  }

  if (/^management(ListProviders|CreateProvider|UpdateProvider|ActivateProvider|DeactivateProvider|TestProvider|GetProvider|GetProviderLimits|GetProviderStats|GetProviderUsage|RequestSendingAccountLimitIncrease|GetSharedAmazonSesLimitRequest|CreateSharedAmazonSesLimitRequest|CancelSharedAmazonSesLimitRequest)$/.test(id)) {
    return "Provider and limit administration is excluded from default MCP curation; provider setup remains a deliberate management workflow outside agent defaults.";
  }

  if (/^management(UpdateWebhook|GetWebhook|ListDelivery|GetDeliveryPayload|RotateWebhookSecret)$/.test(id)) {
    return "Webhook detail, delivery payload, and secret-rotation operations are excluded from default MCP curation; MCP includes list/create/test for the common agentic workflow.";
  }

  return null;
}

function renderMatrix(rows) {
  const included = rows.filter((row) => row.mcp.startsWith("tool")).length;
  const bySurface = Object.fromEntries(
    ["management", "mailbox", "sending"].map((surface) => [
      surface,
      rows.filter((row) => row.surface === surface).length,
    ]),
  );

  return [
    "# Surface Coverage Matrix",
    "",
    "Generated by `node scripts/check-surface-coverage.mjs --write` from the committed OpenAPI snapshots.",
    "",
    "## Summary",
    "",
    `- OpenAPI operations: ${rows.length} (management ${bySurface.management}, mailbox ${bySurface.mailbox}, sending ${bySurface.sending}).`,
    "- SDK coverage: every operation must be exported by its generated TypeScript surface package; non-TypeScript packages are regenerated from the same snapshots and covered by their language checks.",
    "- CLI coverage: every operation must have a generated command module and spec-derived path/query/header/body metadata.",
    `- MCP coverage: curated by design; ${included} operations are tools and every excluded operation has a recorded reason.`,
    "",
    "## Matrix",
    "",
    "| Surface | Operation | Method | Path | SDK | CLI | MCP | Options/filters | MCP decision |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.surface} | \`${row.operationId}\` | ${row.method.toUpperCase()} | \`${row.path}\` | ${row.sdk} | ${escapeCell(row.cli)} | ${escapeCell(row.mcp)} | ${escapeCell(row.optionParity)} | ${escapeCell(row.mcpReason)} |`,
    ),
    "",
  ].join("\n");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function stableJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
