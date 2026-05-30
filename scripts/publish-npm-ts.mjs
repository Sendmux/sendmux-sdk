import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const packages = [
  "packages/ts/core",
  "packages/ts/sending",
  "packages/ts/mailbox",
  "packages/ts/management",
  "packages/ts/sdk",
];

const dryRun = process.env.NPM_PUBLISH_DRY_RUN === "true";
const outputDir = resolve(process.env.RUNNER_TEMP ?? ".tmp", "sendmux-npm-packages");

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const packageDir of packages) {
  const manifest = readJson(resolve(packageDir, "package.json"));
  assertPublishable(manifest, packageDir);

  if (!dryRun && isPublished(manifest.name, manifest.version)) {
    console.log(`${manifest.name}@${manifest.version} already published; skipping`);
    continue;
  }

  const before = new Set(listTarballs());
  run("pnpm", ["--dir", packageDir, "pack", "--pack-destination", outputDir]);
  const tarball = listTarballs().find((file) => !before.has(file));

  if (!tarball) {
    throw new Error(`pnpm pack did not produce a tarball for ${manifest.name}`);
  }

  const publishArgs = ["publish", join(outputDir, tarball), "--access", "public"];
  if (dryRun) {
    publishArgs.push("--dry-run");
  }

  run("npm", publishArgs);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertPublishable(manifest, packageDir) {
  if (manifest.private) {
    throw new Error(`${packageDir} is still private`);
  }

  if (!manifest.repository?.url?.includes("github.com/Sendmux/sendmux-sdk")) {
    throw new Error(`${packageDir} must set repository.url to the GitHub SDK repository for npm trusted publishing`);
  }

  if (manifest.version === "0.0.0") {
    throw new Error(`${packageDir} still has bootstrap version 0.0.0; merge the release-please PR before publishing`);
  }
}

function isPublished(name, version) {
  let result;
  try {
    result = execFileSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.status === 1 && String(error.stderr).includes("E404")) {
      return false;
    }

    throw error;
  }

  return JSON.parse(result) === version;
}

function listTarballs() {
  if (!existsSync(outputDir)) {
    return [];
  }

  return execFileSync("find", [outputDir, "-maxdepth", "1", "-name", "*.tgz", "-print"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((file) => basename(file));
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}
