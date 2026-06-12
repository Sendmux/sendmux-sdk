#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const specs = [
  { file: "openapi-app.json" },
  { file: "openapi-sending.json" },
];
const httpMethods = new Set(["delete", "get", "patch", "post", "put"]);
const sdkAdapters = ["typescript", "python", "go", "php", "ruby"];
const fixtureSetupKinds = new Set(["mailbox_send_message", "management_webhook", "management_webhook_delivery"]);
const scenarioPath = resolve("test/live-e2e/scenarios.json");
const fixtureRegistryPath = resolve("test/live-e2e/fixtures.json");
const matrixPath = resolve("docs/live-e2e-matrix.md");
const writeOutputs = process.argv.includes("--write");
const dryRun = process.argv.includes("--dry-run");
const inputDir = resolve(process.env.OPENAPI_INPUT_DIR ?? findDefaultInputDir());

const operations = loadOperations(inputDir);
const cliOperations = loadCliOperations();
const curatedMcp = loadMcpCuration();
const expected = buildExpectedScenarios(operations, cliOperations, curatedMcp);
const fixtures = readFixtureRegistry();
const scenarioDocument = writeOutputs ? { version: 1, scenarios: expected } : readScenarioDocument();
const scenarios = scenarioDocument.scenarios ?? {};
const failures = [
  ...validateScenarios({ curatedMcp, expected, operations, scenarios }),
  ...validateFixtureRegistry({ fixtures, operations, scenarios }),
];
const matrix = renderMatrix({ curatedMcp, fixtures, operations, scenarios });

if (writeOutputs) {
  mkdirSync(dirname(scenarioPath), { recursive: true });
  writeFileSync(scenarioPath, stableJson({ version: 1, scenarios: expected }) + "\n");
  mkdirSync(dirname(matrixPath), { recursive: true });
  writeFileSync(matrixPath, matrix);
} else {
  if (!existsSync(matrixPath) || readFileSync(matrixPath, "utf8") !== matrix) {
    failures.push("Live E2E matrix is stale. Run node scripts/check-live-e2e-coverage.mjs --write");
  }
}

if (failures.length > 0) {
  throw new Error(`Live E2E coverage checks failed:\n${failures.join("\n")}`);
}

if (dryRun) {
  printDryRunPlan({ operations, scenarios });
} else {
  console.log(`Live E2E coverage checks passed for ${operations.length} OpenAPI operations.`);
}

function findDefaultInputDir() {
  for (const candidate of ["sendmux-docs", "../sendmux-docs"]) {
    if (specs.every((spec) => existsSync(join(candidate, spec.file)))) {
      return candidate;
    }
  }
  return "sendmux-docs";
}

function readScenarioDocument() {
  if (!existsSync(scenarioPath)) {
    throw new Error("Missing live E2E scenario manifest. Run node scripts/check-live-e2e-coverage.mjs --write");
  }

  return readJson(scenarioPath);
}

function readFixtureRegistry() {
  if (!existsSync(fixtureRegistryPath)) {
    throw new Error("Missing live E2E fixture registry. Create test/live-e2e/fixtures.json");
  }

  return readJson(fixtureRegistryPath);
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

  return new Map(Object.entries(Function(`"use strict"; return (${match[1]});`)()));
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

function buildExpectedScenarios(operations, cliOperations, curatedMcp) {
  const out = {};
  for (const operation of operations) {
    const cli = cliOperations.get(operation.operationId);
    const classification = classifyScenario(operation);
    out[operation.operationId] = {
      adapters: {
        cli: Boolean(cli),
        mcp: curatedMcp.get(operation.operationId) ?? null,
        sdk: sdkAdapters,
      },
      assertions: assertionsFor(operation),
      fixture: fixtureFor(operation),
      gates: gatesFor(classification),
      mode: classification.mode,
      risk: classification.risk,
    };
  }
  return out;
}

function classifyScenario(operation) {
  const id = operation.operationId;

  if (id === "mailboxStreamEvents") {
    return { mode: "stream", risk: "stream" };
  }

  if (operation.bodyKind === "binary" || id.includes("Attachment")) {
    return { mode: "binary_fixture", risk: "binary" };
  }

  if (id.startsWith("sendingSend")) {
    return { mode: "send", risk: "send" };
  }

  if (operation.method === "delete") {
    return { mode: "destructive_cleanup_only", risk: "destructive" };
  }

  if (operation.method === "patch" || operation.method === "put") {
    return { mode: "update_restore", risk: "mutation" };
  }

  if (operation.method === "post") {
    if (/Create|Upload/.test(id)) {
      return { mode: "create_cleanup", risk: "mutation" };
    }
    return { mode: "mutation_fixture", risk: "mutation" };
  }

  if (operation.pathParams.length > 0 || operation.queryParams.some((parameter) => parameter.required)) {
    return { mode: "read_fixture", risk: "read" };
  }

  return { mode: "read", risk: "read" };
}

function fixtureFor(operation) {
  return {
    body: operation.bodyKind,
    headers: operation.headerParams.map((parameter) => parameter.name),
    pathParams: operation.pathParams.map((parameter) => parameter.name),
    queryParams: operation.queryParams.filter((parameter) => parameter.required).map((parameter) => parameter.name),
    resourceOwnership: resourceOwnershipFor(operation),
  };
}

function resourceOwnershipFor(operation) {
  if (operation.method === "delete") {
    return "e2e-owned";
  }
  if (operation.method === "patch" || operation.method === "put") {
    return "restore-original";
  }
  if (operation.method === "post" && /Create|Upload/.test(operation.operationId)) {
    return "e2e-created";
  }
  return "fixture";
}

function assertionsFor(operation) {
  const assertions = ["ok-envelope", "request-id"];
  if (operation.method === "get") {
    assertions.push("read-response-shape");
  }
  if (operation.method !== "get") {
    assertions.push("mutation-result");
  }
  return assertions;
}

function gatesFor(classification) {
  if (classification.risk === "send") {
    return ["SENDMUX_STAGING_SEND=1", "SENDMUX_STAGING_SEND_TO allowlist"];
  }
  if (classification.risk === "mutation" || classification.risk === "destructive") {
    return ["SENDMUX_LIVE_E2E_MUTATIONS=1", "E2E resource ownership registry"];
  }
  if (classification.risk === "binary") {
    return ["SENDMUX_LIVE_E2E_BINARY=1", "E2E resource ownership registry"];
  }
  if (classification.risk === "stream") {
    return ["SENDMUX_LIVE_E2E_STREAM=1"];
  }
  return [];
}

function validateScenarios({ curatedMcp, expected, operations, scenarios }) {
  const failures = [];
  const operationIds = new Set(operations.map((operation) => operation.operationId));

  for (const operation of operations) {
    const scenario = scenarios[operation.operationId];
    const expectedScenario = expected[operation.operationId];
    if (!scenario) {
      failures.push(`${operation.operationId}: missing live E2E scenario`);
      continue;
    }

    if (scenario.mode !== expectedScenario.mode) {
      failures.push(`${operation.operationId}: scenario mode drifted; expected ${expectedScenario.mode}, got ${scenario.mode}`);
    }
    if (scenario.risk !== expectedScenario.risk) {
      failures.push(`${operation.operationId}: scenario risk drifted; expected ${expectedScenario.risk}, got ${scenario.risk}`);
    }

    for (const adapter of sdkAdapters) {
      if (!Array.isArray(scenario.adapters?.sdk) || !scenario.adapters.sdk.includes(adapter)) {
        failures.push(`${operation.operationId}: missing SDK live scenario adapter ${adapter}`);
      }
    }

    if (scenario.adapters?.cli !== true) {
      failures.push(`${operation.operationId}: missing CLI live scenario adapter`);
    }

    const expectedMcpTool = curatedMcp.get(operation.operationId) ?? null;
    if ((scenario.adapters?.mcp ?? null) !== expectedMcpTool) {
      failures.push(
        `${operation.operationId}: MCP live scenario drifted; expected ${expectedMcpTool ?? "not curated"}, got ${
          scenario.adapters?.mcp ?? "not curated"
        }`,
      );
    }

    for (const assertion of expectedScenario.assertions) {
      if (!Array.isArray(scenario.assertions) || !scenario.assertions.includes(assertion)) {
        failures.push(`${operation.operationId}: missing assertion ${assertion}`);
      }
    }

    for (const gate of expectedScenario.gates) {
      if (!Array.isArray(scenario.gates) || !scenario.gates.includes(gate)) {
        failures.push(`${operation.operationId}: missing safety gate ${gate}`);
      }
    }

    const expectedOwnership = expectedScenario.fixture.resourceOwnership;
    if (scenario.fixture?.resourceOwnership !== expectedOwnership) {
      failures.push(
        `${operation.operationId}: resource ownership drifted; expected ${expectedOwnership}, got ${
          scenario.fixture?.resourceOwnership ?? "missing"
        }`,
      );
    }
  }

  for (const operationId of Object.keys(scenarios)) {
    if (!operationIds.has(operationId)) {
      failures.push(`${operationId}: live E2E scenario is not present in OpenAPI snapshots`);
    }
  }

  return failures;
}

function validateFixtureRegistry({ fixtures, operations, scenarios }) {
  const failures = [];
  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));
  const sourceNames = new Set(Object.keys(fixtures.sources ?? {}));

  for (const operation of operations) {
    const scenario = scenarios[operation.operationId];
    const entry = fixtures.operations?.[operation.operationId];
    if (scenario?.mode !== "read_fixture") {
      if (entry) {
        failures.push(`${operation.operationId}: fixture registry entry exists for non-read-fixture scenario`);
      }
      continue;
    }

    if (!entry) {
      failures.push(`${operation.operationId}: missing fixture registry entry`);
      continue;
    }
    if (entry.ownership !== "discovered-read") {
      failures.push(`${operation.operationId}: fixture registry ownership must be discovered-read`);
    }

    for (const parameter of operation.pathParams) {
      if (!entry.inputs?.path?.[parameter.name]) {
        failures.push(`${operation.operationId}: fixture registry missing path input ${parameter.name}`);
      }
    }
    for (const parameter of operation.queryParams.filter((item) => item.required)) {
      if (!entry.inputs?.query?.[parameter.name]) {
        failures.push(`${operation.operationId}: fixture registry missing query input ${parameter.name}`);
      }
    }
    failures.push(...validateFixtureInputReferences(entry.inputs ?? {}, sourceNames, `${operation.operationId}.inputs`));
  }

  for (const [sourceName, source] of Object.entries(fixtures.sources ?? {})) {
    if (!operationsById.has(source.operationId)) {
      failures.push(`${sourceName}: fixture source references unknown operation ${source.operationId}`);
    }
    if (!Array.isArray(source.selectors) || source.selectors.length === 0) {
      failures.push(`${sourceName}: fixture source must provide at least one selector`);
    }
    failures.push(...validateFixtureInputReferences(source.request ?? {}, sourceNames, `${sourceName}.request`));
    failures.push(...validateFixtureSetup(sourceName, source, sourceNames));
  }

  return failures;
}

function validateFixtureSetup(sourceName, source, sourceNames) {
  const failures = [];
  if (!source.setup) {
    return failures;
  }
  if (!fixtureSetupKinds.has(source.setup.kind)) {
    failures.push(`${sourceName}: fixture setup kind must be one of ${[...fixtureSetupKinds].join(", ")}`);
  }
  if (!Array.isArray(source.setup.gates) || source.setup.gates.length === 0) {
    failures.push(`${sourceName}: fixture setup must declare safety gates`);
  }
  failures.push(...validateFixtureInputReferences(source.setup, sourceNames, `${sourceName}.setup`));
  return failures;
}

function validateFixtureInputReferences(value, sourceNames, path) {
  const failures = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      failures.push(...validateFixtureInputReferences(item, sourceNames, `${path}.${index}`));
    });
    return failures;
  }
  if (!value || typeof value !== "object") {
    return failures;
  }
  if (Object.hasOwn(value, "source") && !sourceNames.has(value.source)) {
    failures.push(`${path}: unknown fixture source ${value.source}`);
  }
  for (const [key, item] of Object.entries(value)) {
    failures.push(...validateFixtureInputReferences(item, sourceNames, `${path}.${key}`));
  }
  return failures;
}

function renderMatrix({ curatedMcp, fixtures, operations, scenarios }) {
  const bySurface = countBy(operations, (operation) => operation.surface);
  const byRisk = countBy(operations, (operation) => scenarios[operation.operationId]?.risk ?? "missing");
  const byMode = countBy(operations, (operation) => scenarios[operation.operationId]?.mode ?? "missing");
  const mcpCount = [...curatedMcp.keys()].filter((operationId) => scenarios[operationId]?.adapters?.mcp).length;
  const executable = operations.filter((operation) => isExecutableByDefault(operation, scenarios[operation.operationId], fixtures)).length;
  const setupSources = Object.entries(fixtures.sources ?? {}).filter(([, source]) => source.setup);

  return [
    "# Live E2E Coverage Matrix",
    "",
    "Generated by `node scripts/check-live-e2e-coverage.mjs --write` from the committed OpenAPI snapshots and MCP curation.",
    "",
    "This matrix is a no-secret coverage contract. It proves every surfaced operation has an explicit live-test scenario and safety classification; credentialed execution must use the protected live E2E runner.",
    "",
    "## Protected Runner",
    "",
    "- Plan without secrets: `pnpm live:e2e:plan`.",
    "- Execute the default safe live slice: `SENDMUX_LIVE_E2E=1 pnpm live:e2e`.",
    "- The default executable slice runs GET `read` operations plus GET `read_fixture` operations whose inputs are declared in `test/live-e2e/fixtures.json`.",
    "- Read fixtures may declare setup gates. The runner only seeds those fixtures when the setup gate is enabled and the target recipient is allowlisted.",
    "- `sdk` and `cli` adapters call the built public TypeScript SDK and generated CLI. `mcp` calls the curated FastMCP tools for operations that intentionally exist in MCP; non-curated operations are reported as skipped, not passed.",
    "- Mutation, send, binary, and stream operations remain blocked until explicit gates and ownership/cleanup proof are present.",
    "",
    "## Summary",
    "",
    `- OpenAPI operations: ${operations.length} (management ${bySurface.management ?? 0}, mailbox ${
      bySurface.mailbox ?? 0
    }, sending ${bySurface.sending ?? 0}).`,
    `- SDK adapters required per operation: ${sdkAdapters.join(", ")}.`,
    "- CLI adapters required per operation: generated command for every OpenAPI operation.",
    `- MCP adapters required for curated tools: ${mcpCount}.`,
    `- Default executable live operations: ${executable}.`,
    `- Blocked behind safety gates: ${operations.length - executable}.`,
    `- Fixture setup sources: ${
      setupSources.length > 0
        ? setupSources
            .map(([name, source]) => `${name} (${source.setup.gates.join("; ")})`)
            .join(", ")
        : "none"
    }.`,
    `- Risks: ${renderCounts(byRisk)}.`,
    `- Modes: ${renderCounts(byMode)}.`,
    "",
    "## Matrix",
    "",
    "| Surface | Operation | Method | Path | Mode | Risk | SDK | CLI | MCP | Gates | Fixture ownership |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...operations.map((operation) => {
      const scenario = scenarios[operation.operationId] ?? {};
      return `| ${operation.surface} | \`${operation.operationId}\` | ${operation.method.toUpperCase()} | \`${
        operation.path
      }\` | ${scenario.mode ?? "missing"} | ${scenario.risk ?? "missing"} | ${
        Array.isArray(scenario.adapters?.sdk) ? scenario.adapters.sdk.join(", ") : "missing"
      } | ${scenario.adapters?.cli === true ? "yes" : "missing"} | ${scenario.adapters?.mcp ?? "not curated"} | ${escapeCell(
        Array.isArray(scenario.gates) && scenario.gates.length > 0 ? scenario.gates.join("; ") : "none",
      )} | ${scenario.fixture?.resourceOwnership ?? "missing"} |`;
    }),
    "",
  ].join("\n");
}

function isExecutableByDefault(operation, scenario, fixtures) {
  if (scenario?.risk !== "read") {
    return false;
  }
  if (scenario.mode === "read") {
    return true;
  }
  if (scenario.mode !== "read_fixture") {
    return false;
  }

  const entry = fixtures.operations?.[operation.operationId];
  if (!entry || entry.ownership !== "discovered-read") {
    return false;
  }
  return operation.pathParams.every((parameter) => entry.inputs?.path?.[parameter.name]) &&
    operation.queryParams.filter((parameter) => parameter.required).every((parameter) => entry.inputs?.query?.[parameter.name]);
}

function printDryRunPlan({ operations, scenarios }) {
  const grouped = new Map();
  for (const operation of operations) {
    const scenario = scenarios[operation.operationId];
    const key = `${scenario.risk}/${scenario.mode}`;
    const list = grouped.get(key) ?? [];
    list.push(operation.operationId);
    grouped.set(key, list);
  }

  console.log("Live E2E dry-run plan:");
  for (const [key, ids] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- ${key}: ${ids.length}`);
    for (const id of ids) {
      console.log(`  - ${id}`);
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function stableJson(value) {
  return JSON.stringify(sortKeys(value), null, 2);
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

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function renderCounts(counts) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key} ${count}`)
    .join(", ");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
