#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/chocolatey.yml", "utf8");

const zipUpload = stepBlock("Attach CLI ZIP assets to release");
const testPackages = stepBlock("Test Chocolatey packages");
const packageUpload = stepBlock("Attach Chocolatey package artefacts to release");

assert(
  zipUpload.start < testPackages.start,
  "CLI ZIP release assets must be uploaded before Chocolatey package install tests.",
);
assert(
  testPackages.start < packageUpload.start,
  "Chocolatey .nupkg assets must be uploaded only after package install tests pass.",
);
assert.match(zipUpload.text, /packages\/ts\/cli\/dist/, "CLI ZIP upload must read from the CLI dist directory.");
assert.match(zipUpload.text, /sendmux-v\*-win32-x64\.zip/, "CLI ZIP upload must include the Windows ZIP.");
assert.match(zipUpload.text, /sendmux-v\*-win32-x64\.zip\.sha256/, "CLI ZIP upload must include the checksum sidecar.");
assert.doesNotMatch(zipUpload.text, /\.nupkg/, "CLI ZIP upload must not publish Chocolatey packages before tests.");
assert.match(packageUpload.text, /\.tmp\/chocolatey\/pkg/, "Package upload must read from the Chocolatey package directory.");
assert.match(packageUpload.text, /\*\.nupkg/, "Package upload must include Chocolatey nupkg assets.");
assert.doesNotMatch(
  packageUpload.text,
  /sendmux-v\*-win32-x64\.zip/,
  "Package upload must not duplicate the pre-test CLI ZIP upload.",
);

console.log("Chocolatey workflow order tests passed.");

function stepBlock(name) {
  const pattern = new RegExp(`^      - name: ${escapeRegExp(name)}\\n`, "m");
  const match = pattern.exec(workflow);
  assert(match, `Missing Chocolatey workflow step: ${name}`);

  const start = match.index;
  const next = workflow.slice(start + match[0].length).search(/^      - name: /m);
  const end = next === -1 ? workflow.length : start + match[0].length + next;

  return {
    start,
    text: workflow.slice(start, end),
  };
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
