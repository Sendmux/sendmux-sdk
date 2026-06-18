#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliManifestPath = join(rootDir, "packages/ts/cli/package.json");
const tapRepo = process.env.SENDMUX_HOMEBREW_TAP_REPO ?? "Sendmux/homebrew-tap";
const baseBranch = process.env.SENDMUX_HOMEBREW_TAP_BASE_BRANCH ?? "main";
const packageName = "@sendmux/cli";
const cliManifest = JSON.parse(readFileSync(cliManifestPath, "utf8"));
const version = cliManifest.version;
const branch = process.env.SENDMUX_HOMEBREW_TAP_BRANCH ?? `homebrew/sendmux-v${version}`;
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("Missing GH_TOKEN or GITHUB_TOKEN for Sendmux/homebrew-tap write access.");
}

let tapDir;

await main();

async function main() {
  const tarballUrl = await npmViewWithRetry(`${packageName}@${version}`, "dist.tarball");
  const sha256 = await sha256FromUrl(tarballUrl);
  const tempDir = mkdtempSync(join(tmpdir(), "sendmux-homebrew-tap-"));
  tapDir = join(tempDir, "tap");

  try {
    execFileSync("gh", ["auth", "setup-git"], { env: process.env, stdio: "inherit" });
    execFileSync("gh", ["repo", "clone", tapRepo, tapDir, "--", "--depth=1"], {
      env: process.env,
      stdio: "inherit",
    });
    execFileSync("git", ["checkout", "-B", branch], { cwd: tapDir, stdio: "inherit" });
    execFileSync("git", ["config", "user.name", "sendmux-release-bot"], {
      cwd: tapDir,
      stdio: "inherit",
    });
    execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], {
      cwd: tapDir,
      stdio: "inherit",
    });

    mkdirSync(join(tapDir, "Formula"), { recursive: true });
    writeFileSync(join(tapDir, "Formula/sendmux.rb"), formulaFor({ sha256, tarballUrl, version }));

    if (!git(["status", "--porcelain", "--", "Formula/sendmux.rb"])) {
      console.log(`Homebrew formula already matches ${packageName}@${version}.`);
      return;
    }

    execFileSync("git", ["add", "Formula/sendmux.rb"], { cwd: tapDir, stdio: "inherit" });
    execFileSync("git", ["commit", "-m", `sendmux ${version}`], { cwd: tapDir, stdio: "inherit" });
    execFileSync("git", ["push", "--force-with-lease", "origin", branch], {
      cwd: tapDir,
      stdio: "inherit",
    });

    const owner = tapRepo.split("/")[0];
    const head = `${owner}:${branch}`;
    const existingPrUrl = gh(
      ["pr", "list", "--repo", tapRepo, "--base", baseBranch, "--head", head, "--state", "open", "--json", "url", "--jq", ".[0].url"],
      { allowFailure: true },
    );

    if (existingPrUrl) {
      console.log(`Homebrew tap PR already open: ${existingPrUrl}`);
      return;
    }

    const body = [
      `Updates the Sendmux Homebrew formula to ${packageName}@${version}.`,
      "",
      `- npm tarball: ${tarballUrl}`,
      `- sha256: ${sha256}`,
      "",
      "Release workflow generated this PR after publishing the CLI package.",
    ].join("\n");

    const prUrl = gh([
      "pr",
      "create",
      "--repo",
      tapRepo,
      "--base",
      baseBranch,
      "--head",
      head,
      "--title",
      `Update sendmux formula to ${version}`,
      "--body",
      body,
    ]);
    console.log(`Homebrew tap PR opened: ${prUrl}`);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

async function npmViewWithRetry(pkg, field) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return JSON.parse(execFileSync("npm", ["view", pkg, field, "--json"], { encoding: "utf8" }).trim());
    } catch (error) {
      lastError = error;
      await sleep(attempt * 5000);
    }
  }
  throw lastError;
}

async function sha256FromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download npm tarball ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

function formulaFor({ sha256, tarballUrl, version }) {
  return `class Sendmux < Formula
  desc "Command-line access to Sendmux APIs"
  homepage "https://docs.sendmux.ai/cli"
  url "${tarballUrl}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/sendmux --version")
    assert_match "Sendmux", shell_output("#{bin}/sendmux --help")
  end
end
`;
}

function gh(args, options = {}) {
  return run("gh", args, options);
}

function git(args, options = {}) {
  return run("git", args, { ...options, cwd: tapDir });
}

function run(cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: process.env,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return error.status ?? 1;
    }
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
