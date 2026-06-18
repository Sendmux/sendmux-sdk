#!/usr/bin/env node

import assert from "node:assert/strict";
import { join } from "node:path";
import { commandForWindowsShim, nodeBinCandidates } from "./windows-command-shims.mjs";

assert.deepEqual(commandForWindowsShim("pnpm", ["--version"], { platform: "linux" }), {
  args: ["--version"],
  command: "pnpm",
});

assert.deepEqual(
  commandForWindowsShim("pnpm.cmd", ["--filter", "@sendmux/cli", "build"], {
    comSpec: "C:/Windows/System32/cmd.exe",
    platform: "win32",
  }),
  {
    args: ["/d", "/s", "/c", "pnpm.cmd", "--filter", "@sendmux/cli", "build"],
    command: "C:/Windows/System32/cmd.exe",
  },
);

assert.deepEqual(
  commandForWindowsShim("C:/repo/node_modules/.bin/oclif.CMD", ["pack"], {
    platform: "win32",
  }),
  {
    args: ["/d", "/s", "/c", "C:/repo/node_modules/.bin/oclif.CMD", "pack"],
    command: "cmd.exe",
  },
);

assert.deepEqual(nodeBinCandidates("oclif", ["root/.bin"], { platform: "win32" }), [
  join("root/.bin", "oclif.cmd"),
  join("root/.bin", "oclif.CMD"),
  join("root/.bin", "oclif"),
]);

assert.deepEqual(nodeBinCandidates("oclif", ["root/.bin"], { platform: "linux" }), [
  join("root/.bin", "oclif"),
]);

console.log("Windows command shim tests passed.");
