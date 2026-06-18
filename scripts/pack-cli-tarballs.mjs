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

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDir = join(rootDir, "packages/ts/cli");
const sdkPackageJson = join(rootDir, "packages/ts/sdk/package.json");
const rootLock = join(rootDir, "pnpm-lock.yaml");
const oclifBin = firstExisting([
  join(cliDir, "node_modules/.bin/oclif"),
  join(rootDir, "node_modules/.pnpm/node_modules/.bin/oclif"),
  join(rootDir, "node_modules/.bin/oclif"),
]);
const targets =
  process.env.SENDMUX_CLI_PACK_TARGETS ?? "linux-x64,linux-arm64,darwin-x64,darwin-arm64,win32-x64";
const gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: rootDir,
  encoding: "utf8",
}).trim();

if (!existsSync(rootLock)) {
  throw new Error(`Missing root pnpm lockfile: ${rootLock}`);
}

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
  execFileSync(
    oclifBin,
    [
      "pack",
      "tarballs",
      "--root",
      stagingDir,
      "--sha",
      gitSha,
      "--targets",
      targets,
      "--no-xz",
    ],
    {
      cwd: cliDir,
      env: {
        ...process.env,
        CI: "false",
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

  cpSync(join(cliDir, "bin"), join(stagingDir, "bin"), { recursive: true });
  cpSync(join(cliDir, "dist"), join(stagingDir, "dist"), { recursive: true });
  copyFileSync(join(cliDir, "README.md"), join(stagingDir, "README.md"));
  copyFileSync(join(cliDir, "oclif.manifest.json"), join(stagingDir, "oclif.manifest.json"));
  copyFileSync(rootLock, join(stagingDir, "pnpm-lock.yaml"));
  writeFileSync(join(stagingDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
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
