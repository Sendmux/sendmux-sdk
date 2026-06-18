#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { commandForWindowsShim, nodeBinCandidates } from "./windows-command-shims.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDir = join(rootDir, "packages/ts/cli");
const sdkPackageJson = join(rootDir, "packages/ts/sdk/package.json");
const oclifBin = firstExisting(
  nodeBinCandidates("oclif", [
    join(cliDir, "node_modules/.bin"),
    join(rootDir, "node_modules/.pnpm/node_modules/.bin"),
    join(rootDir, "node_modules/.bin"),
  ]),
);
const targets =
  process.env.SENDMUX_CLI_PACK_TARGETS ?? "linux-x64,linux-arm64,darwin-x64,darwin-arm64,win32-x64";
const gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: rootDir,
  encoding: "utf8",
}).trim();

if (!oclifBin) {
  throw new Error("Missing oclif binary. Run pnpm install first.");
}

rmSync(join(cliDir, "tmp"), { force: true, recursive: true });
const distDir = join(cliDir, "dist");
if (existsSync(distDir)) {
  for (const file of readdirSync(distDir)) {
    if (/^sendmux-.*\.tar\.(gz|xz)$/.test(file)) {
      rmSync(join(distDir, file), { force: true });
    }
  }
}

const stagingParent = mkdtempSync(join(tmpdir(), "sendmux-cli-pack-"));
const stagingDir = join(stagingParent, "sendmux");
const keepTmp = process.env.SENDMUX_CLI_KEEP_PACK_TMP === "true";

try {
  stagePackage(stagingDir);
  writePackageLock(stagingDir);
  const oclifCommand = commandForWindowsShim(oclifBin, [
    "pack",
    "tarballs",
    "--root",
    stagingDir,
    "--sha",
    gitSha,
    "--targets",
    targets,
    "--no-xz",
  ]);
  execFileSync(
    oclifCommand.command,
    oclifCommand.args,
    {
      cwd: cliDir,
      env: {
        ...process.env,
        CI: "false",
        npm_config_audit: "false",
        npm_config_bin_links: "false",
        npm_config_fund: "false",
        npm_config_install_strategy: "hoisted",
      },
      stdio: "inherit",
    },
  );

  cpTarballs(join(stagingDir, "dist"), distDir);
} finally {
  if (keepTmp) {
    console.error(`Kept CLI pack staging directory: ${stagingDir}`);
  } else {
    rmSync(stagingParent, { force: true, recursive: true });
  }
}

function stagePackage(stagingDir) {
  const manifest = readJson(join(cliDir, "package.json"));
  const sdkManifest = readJson(sdkPackageJson);
  manifest.dependencies = {
    ...manifest.dependencies,
    "@sendmux/sdk": sdkManifest.version,
  };
  delete manifest.devDependencies;
  assertNoWorkspaceDependencies(manifest);

  cpSync(join(cliDir, "bin"), join(stagingDir, "bin"), { recursive: true });
  cpSync(join(cliDir, "dist"), join(stagingDir, "dist"), { recursive: true });
  cpSync(join(cliDir, "README.md"), join(stagingDir, "README.md"));
  cpSync(join(cliDir, "oclif.manifest.json"), join(stagingDir, "oclif.manifest.json"));
  writeFileSync(join(stagingDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function writePackageLock(stagingDir) {
  const npmCommand = commandForWindowsShim(process.platform === "win32" ? "npm.cmd" : "npm", [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--omit=dev",
    "--audit=false",
    "--fund=false",
  ]);

  execFileSync(npmCommand.command, npmCommand.args, {
    cwd: stagingDir,
    env: {
      ...process.env,
      npm_config_install_strategy: "hoisted",
    },
    stdio: "inherit",
  });
}

function assertNoWorkspaceDependencies(manifest) {
  const dependencySections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  const workspaceDependencies = [];

  for (const section of dependencySections) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        workspaceDependencies.push(`${section}.${name}`);
      }
    }
  }

  if (workspaceDependencies.length > 0) {
    throw new Error(
      `Staged CLI package contains workspace dependencies that npm cannot resolve from the registry: ${workspaceDependencies.join(", ")}`,
    );
  }
}

function cpTarballs(fromDir, toDir) {
  for (const file of readdirSync(fromDir)) {
    if (/^sendmux-.*\.tar\.(gz|xz)$/.test(file)) {
      copyFileSync(join(fromDir, file), join(toDir, file));
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function firstExisting(paths) {
  return paths.find((path) => existsSync(path));
}
