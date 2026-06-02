import { Flags } from "@oclif/core";
import { readFile } from "node:fs/promises";

import {
  authFlags,
  type AuthFlags,
  type SendmuxCommand,
} from "./base-command.js";
import type { OperationDefinition } from "./operation-types.js";

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
  headers?: Record<string, string>;
  path?: Record<string, string>;
  query?: Record<string, string>;
}

export const operationFlags = {
  ...authFlags,
  body: Flags.string({
    description: "JSON request body for POST, PUT, and PATCH operations.",
  }),
  "body-file": Flags.string({
    description: "Path to a JSON request body file.",
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
  const path = parsePairs(flags.path ?? [], "--path");
  for (const parameter of operation.pathParams) {
    if (parameter.required && !path[parameter.name]) {
      command.error(`Missing path parameter "${parameter.name}". Pass --path ${parameter.name}=<value>.`, {
        exit: 2,
      });
    }
  }

  const query = parsePairs(flags.query ?? [], "--query");
  const headers = parsePairs(flags.header ?? [], "--header");
  if (flags["idempotency-key"]) {
    headers["Idempotency-Key"] = flags["idempotency-key"];
  }

  if (flags["if-match"]) {
    headers["If-Match"] = flags["if-match"];
  }

  if (flags["if-none-match"]) {
    headers["If-None-Match"] = flags["if-none-match"];
  }

  const body = await parseBody(command, operation, flags);

  return dropEmpty({
    body,
    headers,
    path,
    query,
  });
}

function parsePairs(values: string[], flagName: string): Record<string, string> {
  const pairs: Record<string, string> = {};

  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${flagName} values must use name=value syntax`);
    }

    pairs[value.slice(0, separator)] = value.slice(separator + 1);
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

  const raw = flags["body-file"] ? await readFile(flags["body-file"], "utf8") : flags.body;
  if (!raw) {
    if (operation.requestBodyRequired) {
      command.error("This command requires a JSON body. Pass --body or --body-file.", { exit: 2 });
    }

    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    command.error("Request body must be valid JSON.", { exit: 2 });
  }
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
