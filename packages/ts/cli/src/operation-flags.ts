import { Flags } from "@oclif/core";
import { readFile } from "node:fs/promises";

import {
  authFlags,
  type AuthFlags,
  type SendmuxCommand,
} from "./base-command.js";
import type {
  OperationDefinition,
  OperationParameter,
  OperationParameterScalarSchema,
} from "./operation-types.js";

export interface OperationFlags extends AuthFlags {
  body?: string;
  "body-file"?: string;
  header?: string[];
  "idempotency-key"?: string;
  "if-match"?: string;
  "if-none-match"?: string;
  path?: string[];
  query?: string[];
}

export interface ParsedOperationOptions {
  body?: unknown;
  headers?: Record<string, unknown>;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

export const operationFlags = {
  ...authFlags,
  body: Flags.string({
    description: "JSON request body, or UTF-8 bytes for binary operations.",
  }),
  "body-file": Flags.string({
    description: "Path to a JSON request body file, or a binary file for binary operations.",
  }),
  header: Flags.string({
    description: "Header as name=value. Repeat for multiple headers.",
    multiple: true,
  }),
  "idempotency-key": Flags.string({
    description: "Set the Idempotency-Key header.",
  }),
  "if-match": Flags.string({
    description: "Set the If-Match header.",
  }),
  "if-none-match": Flags.string({
    description: "Set the If-None-Match header.",
  }),
  path: Flags.string({
    description: "Path parameter as name=value. Repeat for multiple path parameters.",
    multiple: true,
  }),
  query: Flags.string({
    description: "Query parameter as name=value. Repeat for multiple query parameters.",
    multiple: true,
  }),
};

export async function parseOperationOptions(
  command: SendmuxCommand,
  operation: OperationDefinition,
  flags: OperationFlags,
): Promise<ParsedOperationOptions> {
  const path = parseParameterPairs(command, operation.pathParams, flags.path ?? [], "--path");
  const query = parseParameterPairs(command, operation.queryParams, flags.query ?? [], "--query");
  const headers = parseParameterPairs(command, operation.headerParams, flags.header ?? [], "--header");
  if (flags["idempotency-key"]) {
    addHeaderFlag(command, operation, headers, "Idempotency-Key", flags["idempotency-key"]);
  }

  if (flags["if-match"]) {
    addHeaderFlag(command, operation, headers, "If-Match", flags["if-match"]);
  }

  if (flags["if-none-match"]) {
    addHeaderFlag(command, operation, headers, "If-None-Match", flags["if-none-match"]);
  }

  const body = await parseBody(command, operation, flags);

  return dropEmpty({
    body,
    headers,
    path,
    query,
  });
}

function parseParameterPairs(
  command: SendmuxCommand,
  parameters: readonly OperationParameter[],
  values: string[],
  flagName: string,
): Record<string, unknown> {
  const parameterMap = new Map(parameters.map((parameter) => [keyForParameter(flagName, parameter.name), parameter]));
  const pairs: Record<string, unknown> = {};

  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      command.error(`${flagName} values must use name=value syntax`, { exit: 2 });
    }

    const name = value.slice(0, separator);
    const parameter = parameterMap.get(keyForParameter(flagName, name));
    if (!parameter) {
      const allowed = parameters.map((item) => item.name).join(", ") || "none";
      command.error(`Unknown ${labelForFlag(flagName)} parameter "${name}". Supported parameters: ${allowed}.`, {
        exit: 2,
      });
    }

    const parsedValue = parseParameterValue(command, parameter, value.slice(separator + 1), flagName);
    if (parameter.schema.type === "array") {
      const existing = pairs[parameter.name];
      const nextValue = Array.isArray(existing) ? [...existing, parsedValue] : [parsedValue];
      if (parameter.schema.maxItems !== undefined && nextValue.length > parameter.schema.maxItems) {
        command.error(`${labelForFlag(flagName)} parameter "${parameter.name}" accepts at most ${parameter.schema.maxItems} values.`, {
          exit: 2,
        });
      }
      pairs[parameter.name] = nextValue;
      continue;
    }

    pairs[parameter.name] = parsedValue;
  }

  for (const parameter of parameters) {
    if (parameter.required && pairs[parameter.name] === undefined) {
      command.error(`Missing ${labelForFlag(flagName)} parameter "${parameter.name}". Pass ${flagName} ${parameter.name}=<value>.`, {
        exit: 2,
      });
    }
    const parsed = pairs[parameter.name];
    if (
      parameter.schema.type === "array" &&
      parameter.schema.minItems !== undefined &&
      Array.isArray(parsed) &&
      parsed.length < parameter.schema.minItems
    ) {
      command.error(`${labelForFlag(flagName)} parameter "${parameter.name}" requires at least ${parameter.schema.minItems} values.`, {
        exit: 2,
      });
    }
  }

  return pairs;
}

async function parseBody(
  command: SendmuxCommand,
  operation: OperationDefinition,
  flags: OperationFlags,
): Promise<unknown> {
  if (flags.body && flags["body-file"]) {
    command.error("Pass only one of --body or --body-file.", { exit: 2 });
  }

  if (operation.bodyKind === "none") {
    if (flags.body || flags["body-file"]) {
      command.error("This command does not accept a request body.", { exit: 2 });
    }

    return undefined;
  }

  const hasBodyInput = flags.body !== undefined || flags["body-file"] !== undefined;
  if (!hasBodyInput) {
    if (operation.requestBodyRequired) {
      const label = operation.bodyKind === "binary" ? "request body file" : "JSON body";
      command.error(`This command requires a ${label}. Pass --body${operation.bodyKind === "binary" ? "-file" : " or --body-file"}.`, {
        exit: 2,
      });
    }

    return undefined;
  }

  if (operation.bodyKind === "binary") {
    if (flags.body !== undefined) {
      return Buffer.from(flags.body, "utf8");
    }

    return readFile(flags["body-file"] as string);
  }

  const raw = flags["body-file"] ? await readFile(flags["body-file"], "utf8") : flags.body;
  if (raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    command.error("Request body must be valid JSON.", { exit: 2 });
  }
}

function addHeaderFlag(
  command: SendmuxCommand,
  operation: OperationDefinition,
  headers: Record<string, unknown>,
  name: string,
  value: string,
): void {
  const parameter = operation.headerParams.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!parameter) {
    command.error(`This command does not support the ${name} header.`, { exit: 2 });
  }

  headers[parameter.name] = parseParameterValue(command, parameter, value, "--header");
}

function parseParameterValue(
  command: SendmuxCommand,
  parameter: OperationParameter,
  raw: string,
  flagName: string,
): boolean | number | string {
  const label = `${labelForFlag(flagName)} parameter "${parameter.name}"`;
  const schema = scalarSchemaForParameter(parameter);
  let value: boolean | number | string = raw;

  if (schema.type === "integer" || schema.type === "number") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || (schema.type === "integer" && !Number.isInteger(parsed))) {
      command.error(`${label} must be ${articleForType(schema.type)}.`, { exit: 2 });
    }
    value = parsed;
  }

  if (schema.type === "boolean") {
    if (raw !== "true" && raw !== "false") {
      command.error(`${label} must be true or false.`, { exit: 2 });
    }
    value = raw === "true";
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      command.error(`${label} must be at least ${schema.minimum}.`, { exit: 2 });
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      command.error(`${label} must be at most ${schema.maximum}.`, { exit: 2 });
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      command.error(`${label} must be at least ${schema.minLength} characters.`, { exit: 2 });
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      command.error(`${label} must be at most ${schema.maxLength} characters.`, { exit: 2 });
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      command.error(`${label} does not match the required format.`, { exit: 2 });
    }
  }

  if (
    schema.enum &&
    (typeof value === "string" || typeof value === "number") &&
    !schema.enum.includes(value)
  ) {
    command.error(`${label} must be one of: ${schema.enum.join(", ")}.`, { exit: 2 });
  }

  return value;
}

function scalarSchemaForParameter(parameter: OperationParameter): OperationParameterScalarSchema {
  return parameter.schema.type === "array" ? parameter.schema.items : parameter.schema;
}

function keyForParameter(flagName: string, name: string): string {
  return flagName === "--header" ? name.toLowerCase() : name;
}

function labelForFlag(flagName: string): string {
  return flagName.replace(/^--/, "");
}

function articleForType(type: "integer" | "number"): string {
  return type === "integer" ? "an integer" : "a number";
}

function dropEmpty(options: ParsedOperationOptions): ParsedOperationOptions {
  const next: ParsedOperationOptions = {};

  for (const [key, value] of Object.entries(options) as Array<[keyof ParsedOperationOptions, unknown]>) {
    if (value === undefined) {
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }

    next[key] = value as never;
  }

  return next;
}
