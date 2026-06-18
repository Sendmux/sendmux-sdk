#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDir = join(rootDir, "packages/ts/cli");
const distDir = join(cliDir, "dist");
const version = readJson(join(cliDir, "package.json")).version;
const target = envValue("SENDMUX_CHOCOLATEY_TARGET") ?? "win32-x64";
const tarball = envValue("SENDMUX_CHOCOLATEY_TARBALL")
  ? resolve(envValue("SENDMUX_CHOCOLATEY_TARBALL"))
  : findTarball({ distDir, target, version });
const outFile = envValue("SENDMUX_CHOCOLATEY_ASSET")
  ? resolve(envValue("SENDMUX_CHOCOLATEY_ASSET"))
  : join(distDir, `sendmux-v${version}-${target}.zip`);

if (!tarball) {
  throw new Error(
    `Missing ${target} CLI tarball. Run SENDMUX_CLI_PACK_TARGETS=${target} pnpm --filter @sendmux/cli pack:tarballs first.`,
  );
}

if (!existsSync(tarball)) {
  throw new Error(`CLI tarball does not exist: ${tarball}`);
}

mkdirSync(dirname(outFile), { recursive: true });
rmSync(outFile, { force: true });
rmSync(`${outFile}.sha256`, { force: true });

const tempParent = mkdtempSync(join(tmpdir(), "sendmux-chocolatey-asset-"));

try {
  execFileSync("tar", ["-xzf", tarball, "-C", tempParent], { stdio: "inherit" });

  const extractedRoot = findExtractedRoot(tempParent);
  addShimIgnores(extractedRoot);
  assertCliEntrypoint(extractedRoot);

  createZip({ sourceDir: extractedRoot, outFile });

  const checksum = sha256(outFile);
  writeFileSync(`${outFile}.sha256`, `${checksum}  ${basename(outFile)}\n`);
  console.log(
    JSON.stringify(
      {
        asset: outFile,
        checksum,
        source: tarball,
        target,
        version,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(tempParent, { force: true, recursive: true });
}

function findTarball({ distDir, target, version }) {
  if (!existsSync(distDir)) {
    return null;
  }

  const expected = join(distDir, `sendmux-v${version}-${target}.tar.gz`);
  if (existsSync(expected)) {
    return expected;
  }

  const matches = readdirSync(distDir)
    .filter((file) => file.startsWith("sendmux-") && file.endsWith(`-${target}.tar.gz`))
    .sort();

  return matches.length > 0 ? join(distDir, matches[matches.length - 1]) : null;
}

function findExtractedRoot(parentDir) {
  const entries = readdirSync(parentDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  if (entries.length !== 1) {
    throw new Error(`Expected one extracted CLI directory in ${parentDir}, found ${entries.length}`);
  }

  return join(parentDir, entries[0].name);
}

function addShimIgnores(dir) {
  for (const file of walkFiles(dir)) {
    if (shouldIgnoreAutoShim(file)) {
      writeFileSync(`${file}.ignore`, "");
    }
  }
}

function shouldIgnoreAutoShim(file) {
  const lowerFile = file.toLowerCase();
  return lowerFile.endsWith(".exe") || lowerFile.endsWith(".cmd");
}

function assertCliEntrypoint(dir) {
  const files = walkFiles(dir).map((file) => file.replaceAll("\\", "/").toLowerCase());
  const hasWindowsEntrypoint = files.some(
    (file) => file.endsWith("/sendmux.exe") || file.endsWith("/sendmux.cmd") || file.endsWith("/sendmux.ps1"),
  );

  if (!hasWindowsEntrypoint) {
    throw new Error(`Extracted CLI archive does not contain a Windows sendmux entrypoint under ${dir}`);
  }
}

function createZip({ sourceDir, outFile }) {
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
          "$ErrorActionPreference = 'Stop'",
          `Compress-Archive -LiteralPath ${quotePowerShell(sourceDir)} -DestinationPath ${quotePowerShell(
            outFile,
          )} -Force`,
        ].join("; "),
      ],
      { stdio: "inherit" },
    );
    return;
  }

  execFileSync("zip", ["-qr", outFile, basename(sourceDir)], {
    cwd: dirname(sourceDir),
    stdio: "inherit",
  });
}

function walkFiles(dir) {
  const result = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(path));
    } else if (entry.isFile()) {
      result.push(path);
    }
  }

  return result;
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function envValue(name) {
  const value = process.env[name];
  return value && value.trim() ? value : null;
}
