#!/usr/bin/env node

import { readFileSync } from "node:fs";

const core = [
  "packages/ts/core/dist/index.d.ts",
  "packages/ts/core/dist/types.d.ts",
  "packages/ts/core/dist/errors.d.ts",
].map((path) => readFileSync(path, "utf8")).join("\n");
const surfaces = ["mailbox", "management", "sending"];
const managementGeneratedTypes = readFileSync("packages/ts/management/src/generated/types.gen.ts", "utf8");

const requiredCoreExports = [
  "export interface ApiError ",
  "export interface SuccessEnvelope",
  "export declare class SendmuxApiError",
];

for (const expected of requiredCoreExports) {
  if (!core.includes(expected)) {
    throw new Error(`Missing core public API export: ${expected.trim()}`);
  }
}

for (const surface of surfaces) {
  const source = readFileSync(`packages/ts/${surface}/src/index.ts`, "utf8");
  const declaration = readFileSync(`packages/ts/${surface}/dist/index.d.ts`, "utf8");

  if (source.includes("export type * from \"./generated/types.gen.js\"") || source.includes("export type * from './generated/types.gen.js'")) {
    throw new Error(`@sendmux/${surface} exports the generated type barrel from its public entrypoint.`);
  }

  if (/\b(ApiError|SuccessEnvelope)\b/.test(declaration)) {
    throw new Error(`@sendmux/${surface} root declaration leaks generated ApiError/SuccessEnvelope names.`);
  }
}

if (!/pending_request:\s*SharedAmazonSesLimitRequest\s*\|\s*null;/.test(managementGeneratedTypes)) {
  throw new Error("management generated type SharedAmazonSesLimitRequestPage.pending_request must preserve null");
}

console.log("TypeScript public API exposes core-owned ApiError/SuccessEnvelope only.");
