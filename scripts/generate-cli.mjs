#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const specs = [
  { file: "openapi-app.json" },
  { file: "openapi-sending.json" },
];
const curatedCommands = {
  mailboxGetMe: "mailbox:me:get",
  mailboxGetMessage: "mailbox:messages:get",
  mailboxListFolders: "mailbox:folders:list",
  mailboxListMessages: "mailbox:messages:list",
  managementGetDomain: "management:domains:get",
  managementListDomains: "management:domains:list",
  managementListMailboxes: "management:mailboxes:list",
  managementListProviders: "management:providers:list",
  sendingSendEmail: "sending:send",
  sendingSendEmailBatch: "sending:send:batch",
};
const httpMethods = new Set(["get", "put", "post", "delete", "patch"]);
const binaryResponseOperationIds = new Set(["mailboxGetMessageAttachment"]);

const options = parseArgs(process.argv.slice(2));
const inputDir = resolve(options.inputDir ?? process.env.OPENAPI_INPUT_DIR ?? findDefaultInputDir());
const outputPath = resolve(options.output ?? "packages/ts/cli/src/generated/operations.ts");
const cliSourceDir = resolve(options.cliSourceDir ?? "packages/ts/cli/src");
const commandsDir = resolve(options.commandsDir ?? join(cliSourceDir, "commands"));
const operations = [];

for (const { file } of specs) {
  const specPath = join(inputDir, file);
  if (!existsSync(specPath)) {
    throw new Error(`Missing OpenAPI snapshot: ${specPath}`);
  }

  const spec = readJson(specPath);
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      const pathParameters = normalizeParameters(spec, pathItem.parameters);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method) || !operation?.operationId) {
        continue;
      }

      const surface = surfaceForOperationId(operation.operationId);
      const parameters = [...pathParameters, ...normalizeParameters(spec, operation.parameters)];
      operations.push({
        bodyKind: bodyKindForOperation(operation),
        command: curatedCommands[operation.operationId] ?? defaultCommand(surface, operation.operationId),
        description: oneLine(operation.summary ?? operation.description ?? operation.operationId),
        headerParams: parameters.filter((parameter) => parameter.in === "header").map(toPublicParameter),
        method,
        operationId: operation.operationId,
        path,
        pathParams: parameters.filter((parameter) => parameter.in === "path").map(toPublicParameter),
        queryParams: parameters.filter((parameter) => parameter.in === "query").map(toPublicParameter),
        responseKind: responseKindForOperation(operation),
        requestBodyRequired: Boolean(operation.requestBody?.required),
        requiredKeyKind: requiredKeyKindForOperation(operation, surface),
        surface,
      });
    }
  }
}

operations.sort((left, right) => left.operationId.localeCompare(right.operationId));
writeOperations(outputPath, operations);
writeCommandModules({ commandsDir, cliSourceDir, operations });
console.log(`Wrote CLI operation manifest to ${outputPath}`);
console.log(`Wrote ${operations.length} CLI command modules to ${commandsDir}`);

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--input-dir") {
      parsed.inputDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    if (arg === "--output") {
      parsed.output = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    if (arg === "--cli-source-dir") {
      parsed.cliSourceDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    if (arg === "--commands-dir") {
      parsed.commandsDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue({ args, index, arg }) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${arg}`);
  }

  return value;
}

function findDefaultInputDir() {
  for (const candidate of ["sendmux-docs", "../sendmux-docs"]) {
    if (specs.every((spec) => existsSync(join(candidate, spec.file)))) {
      return candidate;
    }
  }

  return "sendmux-docs";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeParameters(spec, parameters) {
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

function toPublicParameter(parameter) {
  return {
    name: parameter.name,
    required: parameter.required,
    schema: parameter.schema,
  };
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

  if (typeof resolved.minimum === "number") {
    normalised.minimum = resolved.minimum;
  }

  if (typeof resolved.maximum === "number") {
    normalised.maximum = resolved.maximum;
  }

  if (typeof resolved.minLength === "number") {
    normalised.minLength = resolved.minLength;
  }

  if (typeof resolved.maxLength === "number") {
    normalised.maxLength = resolved.maxLength;
  }

  if (typeof resolved.minItems === "number") {
    normalised.minItems = resolved.minItems;
  }

  if (typeof resolved.maxItems === "number") {
    normalised.maxItems = resolved.maxItems;
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

  throw new Error(`Unsupported CLI request body content type for ${operation.operationId}: ${contentTypes.join(", ")}`);
}

function responseKindForOperation(operation) {
  if (binaryResponseOperationIds.has(operation.operationId)) {
    return "binary";
  }

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

function requiredKeyKindForOperation(operation, surface) {
  if (Array.isArray(operation.security) && operation.security.length === 0) {
    return "none";
  }

  if (surface === "management") {
    return "root";
  }
  if (surface === "sending") {
    return "sending";
  }
  return "mailbox";
}

function defaultCommand(surface, operationId) {
  const withoutSurface = operationId.replace(new RegExp(`^${surface}`), "");
  return `${surface}:${kebab(withoutSurface)}`;
}

function kebab(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/^[-\s_]+/, "")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function writeOperations(path, operationDefinitions) {
  mkdirSync(dirname(path), { recursive: true });

  const operationsLiteral = operationDefinitions
    .map((operation) => `  ${operation.operationId}: ${json(operation)},`)
    .join("\n");
  const curatedLiteral = Object.keys(curatedCommands)
    .sort()
    .map((operationId) => `  ${operationId}: operations.${operationId},`)
    .join("\n");

  writeFileSync(
    path,
    [
      "// This file is generated by scripts/generate-cli.mjs",
      "",
      'import type { OperationDefinition } from "../operation-types.js";',
      "",
      "export const operations = {",
      operationsLiteral,
      "} as const satisfies Record<string, OperationDefinition>;",
      "",
      "export const curatedOperations = {",
      curatedLiteral,
      "} as const;",
      "",
      "export type OperationId = keyof typeof operations;",
      "",
    ].join("\n"),
  );
}

function writeCommandModules({ commandsDir, cliSourceDir, operations }) {
  for (const surface of ["mailbox", "management", "sending"]) {
    rmSync(join(commandsDir, surface), { force: true, recursive: true });
  }

  const seen = new Map();
  for (const operation of operations) {
    if (seen.has(operation.command)) {
      throw new Error(
        `CLI command collision for ${operation.command}: ${seen.get(operation.command)} and ${operation.operationId}`,
      );
    }
    seen.set(operation.command, operation.operationId);

    const filePath = join(commandsDir, ...operation.command.split(":")) + ".ts";
    mkdirSync(dirname(filePath), { recursive: true });

    const operationsImport = relativeImport(dirname(filePath), join(cliSourceDir, "generated", "operations.js"));
    const commandImport = relativeImport(dirname(filePath), join(cliSourceDir, "operation-command.js"));
    const className = `${toPascal(operation.operationId)}Command`;
    const operationFlagsImport = relativeImport(dirname(filePath), join(cliSourceDir, "operation-flags.js"));
    const streamFlags = operation.operationId === "mailboxStreamEvents";

    writeFileSync(
      filePath,
      [
        "// This file is generated by scripts/generate-cli.mjs",
        "",
        ...(streamFlags ? ['import { Flags } from "@oclif/core";'] : []),
        `import { operations } from "${operationsImport}";`,
        `import { OperationCommand } from "${commandImport}";`,
        ...(streamFlags ? [`import { operationFlags } from "${operationFlagsImport}";`] : []),
        "",
        `export default class ${className} extends OperationCommand {`,
        `  static description = operations.${operation.operationId}.description;`,
        ...(streamFlags
          ? [
              "  static flags = {",
              "    ...operationFlags,",
              "    follow: Flags.boolean({",
              '      description: "Keep streaming mailbox events until the stream closes or the process is interrupted. Emits one JSON object per line.",',
              "    }),",
              "  };",
            ]
          : []),
        `  static operation = operations.${operation.operationId};`,
        "}",
        "",
      ].join("\n"),
    );
  }
}

function relativeImport(fromDir, target) {
  let value = relative(fromDir, target).split(sep).join("/");
  if (!value.startsWith(".")) {
    value = `./${value}`;
  }
  return value;
}

function toPascal(value) {
  return value
    .replace(/[^A-Za-z0-9]+/g, " ")
    .replace(/(^| )([A-Za-z0-9])/g, (_, __, character) => character.toUpperCase())
    .replace(/ /g, "");
}

function json(value) {
  return JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
}
