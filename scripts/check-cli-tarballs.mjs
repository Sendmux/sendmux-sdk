#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { invalidTarballEntries, tarListArgs, tarVerboseListArgs } from "./cli-tarball-tools.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDistDir = join(rootDir, "packages/ts/cli/dist");
const tarballs = process.argv.slice(2).map((file) => resolve(file));
const files = tarballs.length > 0 ? tarballs : findCliTarballs(cliDistDir);

if (files.length === 0) {
  throw new Error(`No CLI tarballs found under ${cliDistDir}`);
}

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`CLI tarball does not exist: ${file}`);
  }

  const names = execFileSync("tar", tarListArgs(file), { encoding: "utf8" });
  const verboseListing = execFileSync("tar", tarVerboseListArgs(file), { encoding: "utf8" });
  const invalidEntries = invalidTarballEntries({ names, verboseListing });

  if (invalidEntries.symlinks.length > 0 || invalidEntries.pnpmEntries.length > 0) {
    printInvalidEntries(file, invalidEntries);
    throw new Error(`CLI tarball is not portable enough for Windows extraction: ${file}`);
  }

  console.log(`${basename(file)}: no symlinks or pnpm entries found.`);
}

function findCliTarballs(distDir) {
  if (!existsSync(distDir)) {
    return [];
  }

  return readdirSync(distDir)
    .filter((file) => /^sendmux-v.*\.tar\.gz$/.test(file))
    .map((file) => join(distDir, file))
    .sort();
}

function printInvalidEntries(file, invalidEntries) {
  console.error(`${basename(file)} failed CLI tarball portability checks.`);
  if (invalidEntries.symlinks.length > 0) {
    console.error(`Symlink entries (${invalidEntries.symlinks.length}):`);
    for (const line of invalidEntries.symlinks.slice(0, 10)) {
      console.error(`  ${line}`);
    }
  }

  if (invalidEntries.pnpmEntries.length > 0) {
    console.error(`pnpm entries (${invalidEntries.pnpmEntries.length}):`);
    for (const name of invalidEntries.pnpmEntries.slice(0, 10)) {
      console.error(`  ${name}`);
    }
  }
}
