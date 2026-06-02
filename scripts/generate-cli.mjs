#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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

const options = parseArgs(process.argv.slice(2));
const inputDir = resolve(options.inputDir ?? process.env.OPENAPI_INPUT_DIR ?? findDefaultInputDir());
const outputPath = resolve(options.output ?? "packages/ts/cli/src/generated/operations.ts");
const operations = [];

for (const { file } of specs) {
  const specPath = join(inputDir, file);
  if (!existsSync(specPath)) {
    throw new Error(`Missing OpenAPI snapshot: ${specPath}`);
  }

  const spec = readJson(specPath);
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathParameters = normalizeParameters(pathItem.parameters);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method) || !operation?.operationId) {
        continue;
      }

      const surface = surfaceForOperationId(operation.operationId);
      const parameters = [...pathParameters, ...normalizeParameters(operation.parameters)];
      operations.push({
        command: curatedCommands[operation.operationId] ?? defaultCommand(surface, operation.operationId),
        description: oneLine(operation.summary ?? operation.description ?? operation.operationId),
        headerParams: parameters.filter((parameter) => parameter.in === "header").map(toPublicParameter),
        method,
        operationId: operation.operationId,
        path,
        pathParams: parameters.filter((parameter) => parameter.in === "path").map(toPublicParameter),
        queryParams: parameters.filter((parameter) => parameter.in === "query").map(toPublicParameter),
        requestBodyRequired: Boolean(operation.requestBody?.required),
        requiredKeyKind: surface === "mailbox" ? "mailbox" : "root",
        surface,
      });
    }
  }
}

operations.sort((left, right) => left.operationId.localeCompare(right.operationId));
writeOperations(outputPath, operations);
console.log(`Wrote CLI operation manifest to ${outputPath}`);

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

function normalizeParameters(parameters) {
  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters
    .filter((parameter) => parameter && typeof parameter === "object" && !parameter.$ref)
    .map((parameter) => ({
      in: parameter.in,
      name: parameter.name,
      required: Boolean(parameter.required),
    }))
    .filter((parameter) => typeof parameter.in === "string" && typeof parameter.name === "string");
}

function toPublicParameter(parameter) {
  return {
    name: parameter.name,
    required: parameter.required,
  };
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

function json(value) {
  return JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
}
