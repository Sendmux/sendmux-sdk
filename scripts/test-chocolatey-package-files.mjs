#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const packagingDir = "packaging/chocolatey";
const forbiddenFiles = readdirSync(packagingDir, { recursive: true })
  .filter((path) => /^(?:LICENSE|VERIFICATION)\.txt/i.test(basename(path)))
  .sort();

assert.deepEqual(
  forbiddenFiles,
  [],
  "Download-only Chocolatey packages must not include LICENSE.txt* or VERIFICATION.txt* files.",
);

for (const path of [
  `${packagingDir}/sendmux.portable/sendmux.portable.nuspec.template`,
  `${packagingDir}/sendmux/sendmux.nuspec.template`,
]) {
  const nuspec = readFileSync(path, "utf8");
  const owners = nuspec.match(/<owners>([^<]*)<\/owners>/)?.[1].trim();
  const authors = nuspec.match(/<authors>([^<]*)<\/authors>/)?.[1].trim();

  assert.equal(owners, "roshanroyj", `${path} must set owners to the Chocolatey maintainer roshanroyj.`);
  assert(authors, `${path} must declare non-empty software authors.`);
}

console.log("Chocolatey package file tests passed.");
