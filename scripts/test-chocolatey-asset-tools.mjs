#!/usr/bin/env node

import assert from "node:assert/strict";
import { tarExtractArgs } from "./chocolatey-asset-tools.mjs";

assert.deepEqual(
  tarExtractArgs(
    {
      targetDir: "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\sendmux-chocolatey-asset",
      tarball: "D:\\a\\sendmux-sdk\\sendmux-sdk\\packages\\ts\\cli\\dist\\sendmux-v1.0.1-win32-x64.tar.gz",
    },
    { platform: "win32" },
  ),
  [
    "--force-local",
    "-xzf",
    "D:\\a\\sendmux-sdk\\sendmux-sdk\\packages\\ts\\cli\\dist\\sendmux-v1.0.1-win32-x64.tar.gz",
    "-C",
    "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\sendmux-chocolatey-asset",
  ],
);

assert.deepEqual(
  tarExtractArgs(
    {
      targetDir: "/tmp/sendmux-chocolatey-asset",
      tarball: "/tmp/sendmux-v1.0.1-win32-x64.tar.gz",
    },
    { platform: "linux" },
  ),
  ["-xzf", "/tmp/sendmux-v1.0.1-win32-x64.tar.gz", "-C", "/tmp/sendmux-chocolatey-asset"],
);

console.log("Chocolatey asset tool tests passed.");
