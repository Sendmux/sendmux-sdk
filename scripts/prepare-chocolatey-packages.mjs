#!/usr/bin/env node

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDir = join(rootDir, "packages/ts/cli");
const cliVersion = readJson(join(cliDir, "package.json")).version;
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? envValue("SENDMUX_CHOCOLATEY_VERSION") ?? cliVersion;
const releaseTag = args.releaseTag ?? envValue("SENDMUX_CHOCOLATEY_RELEASE_TAG") ?? `ts-cli-v${version}`;
const outDir = resolve(args.out ?? envValue("SENDMUX_CHOCOLATEY_OUT_DIR") ?? join(rootDir, ".tmp/chocolatey"));
const assetPath = args.asset
  ? resolve(args.asset)
  : envValue("SENDMUX_CHOCOLATEY_ASSET")
    ? resolve(envValue("SENDMUX_CHOCOLATEY_ASSET"))
    : join(cliDir, "dist", `sendmux-v${version}-win32-x64.zip`);
const assetName = basename(assetPath);
const downloadUrl =
  args.url ??
  envValue("SENDMUX_CHOCOLATEY_DOWNLOAD_URL") ??
  `https://github.com/Sendmux/sendmux-sdk/releases/download/${releaseTag}/${assetName}`;
const checksum = args.checksum ?? envValue("SENDMUX_CHOCOLATEY_CHECKSUM64") ?? checksumFor(assetPath);
const templateDir = join(rootDir, "packaging/chocolatey");
const replacements = {
  CHECKSUM64: checksum,
  CHECKSUM_TYPE: "sha256",
  DOWNLOAD_URL: downloadUrl,
  RELEASE_TAG: releaseTag,
  VERSION: version,
};

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/.test(version)) {
  throw new Error(`Chocolatey package version must be SemVer-compatible, got: ${version}`);
}

if (!checksum) {
  throw new Error(`Missing checksum for ${assetPath}. Build the asset first or pass --checksum.`);
}

rmSync(outDir, { force: true, recursive: true });
copyTemplateTree(templateDir, outDir);
console.log(`Prepared Chocolatey packages in ${outDir}`);

function checksumFor(path) {
  if (!existsSync(path)) {
    return null;
  }

  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function copyTemplateTree(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true });

  for (const entry of readdirSync(fromDir)) {
    const source = join(fromDir, entry);
    const target = join(toDir, stripTemplateSuffix(entry));
    const stats = statSync(source);

    if (stats.isDirectory()) {
      copyTemplateTree(source, target);
      continue;
    }

    if (entry.endsWith(".template")) {
      const content = replacePlaceholders(readFileSync(source, "utf8"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

function replacePlaceholders(content) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    content,
  );
}

function stripTemplateSuffix(fileName) {
  return fileName.endsWith(".template") ? fileName.slice(0, -".template".length) : fileName;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (!inlineValue) {
      index += 1;
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    parsed[toCamelCase(rawKey)] = value;
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function envValue(name) {
  const value = process.env[name];
  return value && value.trim() ? value : null;
}
