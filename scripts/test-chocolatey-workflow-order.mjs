#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/chocolatey.yml", "utf8");

const zipUpload = stepBlock("Attach CLI ZIP assets to release");
const generatePackages = stepBlock("Generate Chocolatey packages");
const testPackages = stepBlock("Test Chocolatey packages");
const packageUpload = stepBlock("Attach Chocolatey package artefacts to release");
const pushPackages = stepBlock("Push to Chocolatey");
const skipPushNotice = stepBlock("Skip Chocolatey push notice");
const packageJobHeader = workflow.slice(workflow.indexOf("  package:"), workflow.indexOf("    steps:"));

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
assert.match(
  generatePackages.text,
  /github\.event_name.*pull_request/s,
  "PR Chocolatey package generation must override the download URL.",
);
assert.match(
  generatePackages.text,
  /SENDMUX_CHOCOLATEY_DOWNLOAD_URL/,
  "PR Chocolatey package generation must write a local download URL.",
);
assert.match(
  testPackages.text,
  /scripts\/serve-static\.mjs/,
  "PR Chocolatey package tests must serve the just-built ZIP locally.",
);
assert.match(
  testPackages.text,
  /Stop-Process/,
  "PR Chocolatey package tests must stop the local ZIP server.",
);
assert.doesNotMatch(
  packageJobHeader,
  /^\s+CHOCOLATEY_API_KEY:/m,
  "The Chocolatey API key must not be exposed to every package job step.",
);
assert.match(
  packageJobHeader,
  /^\s+HAS_CHOCOLATEY_API_KEY: \$\{\{ secrets\.CHOCOLATEY_API_KEY != '' \}\}$/m,
  "The package job must expose only whether the Chocolatey API key is configured.",
);
assert.match(
  pushPackages.text,
  /^\s+CHOCOLATEY_API_KEY: \$\{\{ secrets\.CHOCOLATEY_API_KEY \}\}$/m,
  "The Chocolatey API key must be scoped to the push step.",
);
assert.match(
  pushPackages.text,
  /env\.HAS_CHOCOLATEY_API_KEY == 'true'/,
  "Chocolatey push must use the non-secret availability flag.",
);
assert.match(
  skipPushNotice.text,
  /env\.HAS_CHOCOLATEY_API_KEY != 'true'/,
  "The skipped-push notice must use the non-secret availability flag.",
);

for (const upload of [zipUpload, packageUpload]) {
  assert.match(
    upload.text,
    /^\s+RELEASE_TAG: \$\{\{ github\.event\.release\.tag_name \}\}$/m,
    "Release upload steps must pass the release tag through the environment.",
  );
  assert.match(
    runScript(upload.text),
    /tag="\$RELEASE_TAG"/,
    "Release upload scripts must read the tag from the environment.",
  );
  assert.doesNotMatch(
    runScript(upload.text),
    /\$\{\{\s*github\.event\.release\.tag_name\s*\}\}/,
    "Release upload scripts must not interpolate event data directly into Bash.",
  );
}

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

function runScript(step) {
  const marker = "        run: |\n";
  const start = step.indexOf(marker);
  assert.notEqual(start, -1, "Expected a multiline run script in Chocolatey workflow step.");
  return step.slice(start + marker.length);
}
