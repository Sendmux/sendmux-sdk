import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const pythonPackages = ["core", "sending", "mailbox", "management", "sdk", "mcp"];

export function checkPythonSdkDependencyFloors({ root, changedPackages = readChangedPythonPackages({ root }) }) {
  const manifest = readManifest(root);
  const pyprojectPath = join(root, "packages", "python", "sdk", "pyproject.toml");
  const pyproject = readFileSync(pyprojectPath, "utf8");
  const dependencies = [
    ["sendmux-core", manifest["packages/python/core"]],
    ["sendmux-mailbox", manifest["packages/python/mailbox"]],
    ["sendmux-management", manifest["packages/python/management"]],
    ["sendmux-sending", manifest["packages/python/sending"]],
  ];

  checkDependencyFloors({
    source: pyproject,
    sourcePath: pyprojectPath,
    dependencies,
    enforceManifestFloor: changedPackages.has("sdk"),
  });
}

export function checkPythonMcpDependencyFloors({ root, changedPackages = readChangedPythonPackages({ root }) }) {
  const manifest = readManifest(root);
  const pyprojectPath = join(root, "packages", "python", "mcp", "pyproject.toml");
  const pyproject = readFileSync(pyprojectPath, "utf8");

  checkDependencyFloors({
    source: pyproject,
    sourcePath: pyprojectPath,
    dependencies: [["sendmux-core", manifest["packages/python/core"]]],
    enforceManifestFloor: changedPackages.has("mcp"),
  });
}

export function readChangedPythonPackages({ root, env = process.env } = {}) {
  const override = env.PYTHON_CHANGED_PACKAGES;
  if (override) {
    return new Set(
      override
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(validatePythonPackageName),
    );
  }

  const releasedPackages = readPythonPackagesFromPaths(env.PYTHON_PATHS_RELEASED);
  if (releasedPackages.size > 0) {
    return releasedPackages;
  }

  const changedFiles = readChangedFiles(root, env);
  const changedPackages = new Set();
  for (const filePath of changedFiles) {
    const match = filePath.match(/^packages\/python\/([^/]+)\//);
    if (match && pythonPackages.includes(match[1])) {
      changedPackages.add(validatePythonPackageName(match[1]));
    }
    const directMatch = filePath.match(/^packages\/python\/([^/]+)$/);
    if (directMatch && pythonPackages.includes(directMatch[1])) {
      changedPackages.add(validatePythonPackageName(directMatch[1]));
    }
  }
  return changedPackages;
}

function checkDependencyFloors({ source, sourcePath, dependencies, enforceManifestFloor }) {
  for (const [packageName, minimumVersion] of dependencies) {
    if (typeof minimumVersion !== "string") {
      throw new Error(`Could not read release manifest version for ${packageName}`);
    }

    const dependencyPattern = new RegExp(`"${escapeRegExp(packageName)}>=([^,"]+),<2\\.0\\.0"`);
    const actualVersion = source.match(dependencyPattern)?.[1];
    if (!actualVersion) {
      throw new Error(`${sourcePath} must require ${packageName} with an explicit >= floor and <2.0.0 upper bound`);
    }
    if (enforceManifestFloor && compareSemver(actualVersion, minimumVersion) !== 0) {
      throw new Error(
        `${sourcePath} must require ${packageName} >= ${minimumVersion},<2.0.0; found >= ${actualVersion},<2.0.0`,
      );
    }
  }
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, ".release-please-manifest.json"), "utf8"));
}

function readPythonPackagesFromPaths(value) {
  if (!value) {
    return new Set();
  }

  let paths;
  try {
    const parsed = JSON.parse(value);
    paths = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    paths = value.split(/[\s,]+/);
  }

  const changedPackages = new Set();
  for (const filePath of paths) {
    if (typeof filePath !== "string") {
      continue;
    }
    const match = filePath.match(/^packages\/python\/([^/]+)\//);
    if (match && pythonPackages.includes(match[1])) {
      changedPackages.add(validatePythonPackageName(match[1]));
    }
    const directMatch = filePath.match(/^packages\/python\/([^/]+)$/);
    if (directMatch && pythonPackages.includes(directMatch[1])) {
      changedPackages.add(validatePythonPackageName(directMatch[1]));
    }
  }
  return changedPackages;
}

function readChangedFiles(root, env = process.env) {
  const ranges = [];
  if (env.GITHUB_BASE_REF) {
    ranges.push(`origin/${env.GITHUB_BASE_REF}...HEAD`);
  }
  ranges.push("origin/main...HEAD");

  for (const range of ranges) {
    const result = spawnSync("git", ["diff", "--name-only", range], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status === 0) {
      return result.stdout.split("\n").filter(Boolean);
    }
  }
  if (env.GITHUB_BASE_REF) {
    throw new Error(
      "Could not determine changed files for Python release guardrails. Configure actions/checkout with fetch-depth: 0 or set PYTHON_CHANGED_PACKAGES/PYTHON_PATHS_RELEASED.",
    );
  }
  return [];
}

function validatePythonPackageName(name) {
  if (!pythonPackages.includes(name)) {
    throw new Error(`Unknown Python package name: ${name}`);
  }
  return name;
}

function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported Python dependency version: ${version}`);
  }
  return match.slice(1).map(Number);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
