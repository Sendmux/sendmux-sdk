#!/usr/bin/env node

import assert from "node:assert/strict";
import { join } from "node:path";
import { nodeBinCandidates, spawnCommandSync } from "./windows-command-shims.mjs";

const spawnCalls = [];
const spawnResult = { status: 0 };
const commandWithMetacharacters = "C:/repo & tools/node_modules/.bin/oclif.CMD";
const argsWithMetacharacters = ["pack", "--root", "C:/tmp/stage & safe"];
const result = spawnCommandSync(commandWithMetacharacters, argsWithMetacharacters, {
  cwd: "C:/repo & tools",
  spawnSync(command, args, options) {
    spawnCalls.push({ args, command, options });
    return spawnResult;
  },
});

assert.equal(result, spawnResult);
assert.deepEqual(spawnCalls, [
  {
    args: argsWithMetacharacters,
    command: commandWithMetacharacters,
    options: { cwd: "C:/repo & tools" },
  },
]);

assert.deepEqual(nodeBinCandidates("oclif", ["root/.bin"], { platform: "win32" }), [
  join("root/.bin", "oclif.cmd"),
  join("root/.bin", "oclif.CMD"),
  join("root/.bin", "oclif"),
]);

assert.deepEqual(nodeBinCandidates("oclif", ["root/.bin"], { platform: "linux" }), [
  join("root/.bin", "oclif"),
]);

console.log("Windows command shim tests passed.");
