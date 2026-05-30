#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const generatedPackageDirs = [
  "packages/go",
  "packages/php",
  "packages/python",
  "packages/ruby",
  "packages/ts",
];

const diff = execFileSync("git", ["status", "--porcelain", "--", ...generatedPackageDirs], {
  encoding: "utf8",
});

if (diff.trim()) {
  throw new Error(
    [
      "Generated SDK package directories are stale.",
      diff.trim(),
      "Regenerate the SDKs from the current snapshots and commit the resulting package changes.",
    ].join("\n"),
  );
}

console.log("Generated SDK package directories have no uncommitted drift.");
