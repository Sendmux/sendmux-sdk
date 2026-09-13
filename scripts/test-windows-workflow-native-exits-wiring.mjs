#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8").replaceAll("\r\n", "\n");
const jobStart = workflow.indexOf("\n  node-runtime:\n");
const jobEnd = workflow.indexOf("\n  python-runtime:\n", jobStart);
assert.notEqual(jobStart, -1, "Missing normal node-runtime CI job");
assert.notEqual(jobEnd, -1, "Missing node-runtime CI job boundary");

const job = workflow.slice(jobStart, jobEnd);
const stepName = "Verify PowerShell workflow native exits";
const marker = `      - name: ${stepName}\n`;
const stepStart = job.indexOf(marker);
assert.notEqual(stepStart, -1, `Missing required normal CI step: ${stepName}`);
const tail = job.slice(stepStart + marker.length);
const relativeEnd = tail.search(/^      - (?:name:|uses:|run:)/m);
const step = job.slice(stepStart, relativeEnd === -1 ? job.length : stepStart + marker.length + relativeEnd);

assert.match(step, /^        if: runner\.os == 'Windows'$/m, "Native-exit regression must run only on Windows");
assert.match(
  step,
  /^        run: pnpm test:windows-workflow-native-exits$/m,
  "Normal Windows CI must invoke the public native-exit regression command",
);
assert.doesNotMatch(step, /^        continue-on-error:/m, "Native-exit regression must remain required");

console.log("Windows workflow native-exit wiring tests passed.");
