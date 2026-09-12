import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = process.cwd();
const venv = join(root, ".tmp", "python-venv");
const python = join(venv, "bin", "python");
const distDir = join(root, ".tmp", "mcp-dist");
const mcpPackageDir = join(root, "packages/python/mcp");
const mcpRegistryDescriptionMaxLength = 100;

function main() {
  verifyRegistryVersion();
  if (!existsSync(python)) {
    mkdirSync(join(root, ".tmp"), { recursive: true });
    run("python3", ["-m", "venv", venv]);
  }
  run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(python, ["-m", "pip", "install", "-r", "requirements-dev.txt"]);
  run(python, ["-m", "pip", "install", "-e", "packages/python/core", "-e", "packages/python/mcp"]);
  run(python, ["-m", "sendmux_mcp.contract", "--check"]);
  run(python, ["-m", "compileall", "-q", "packages/python/mcp"]);
  run(python, ["-m", "mypy", "packages/python/mcp"]);
  run(python, ["-m", "pytest", "packages/python/tests/test_mcp.py", "packages/python/tests/test_mcp_retry.py", "packages/python/mcp/tests"]);
  rmSync(distDir, { force: true, recursive: true });
  mkdirSync(distDir, { recursive: true });
  run(python, ["-m", "build", "--outdir", distDir, "packages/python/mcp"]);
  run(python, ["-m", "twine", "check", `${distDir}/*`], { shell: true });
  run(python, ["scripts/check-mcp-artifacts.py", distDir]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

export function verifyRegistryVersion(packageDir = mcpPackageDir) {
  const pyprojectPath = join(packageDir, "pyproject.toml");
  const registryPath = join(packageDir, "server.json");
  const packageVersion = readProjectVersion(pyprojectPath);
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const packageEntry = registry.packages?.find((entry) => entry.identifier === "sendmux-mcp");
  const contract = JSON.parse(readFileSync(join(packageDir, "sendmux_mcp/mcp-contract.json"), "utf8"));

  assert.equal(contract.package.version, packageVersion, "MCP contract version must match native project version");
  assert.equal(registry.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json", "MCP Registry schema");
  assert.equal(registry.name, `io.github.Sendmux/${contract.package.identity}`, "MCP Registry identity");
  assert.deepEqual(registry.remotes, contract.hosted.transports.map((type) => ({ type, url: contract.hosted.resource })), "MCP Registry resource/transport must match the package contract");
  assert.equal(packageEntry?.identifier, contract.package.identity, "MCP Registry package identity");
  assert.equal(packageEntry?.transport?.type, contract.local.default_transport, "MCP Registry local transport");

  if (registry.version !== packageVersion) {
    throw new Error(`packages/python/mcp/server.json version ${registry.version} must match pyproject.toml version ${packageVersion}`);
  }

  if (packageEntry?.version !== packageVersion) {
    throw new Error(`packages/python/mcp/server.json package version ${packageEntry?.version ?? "<missing>"} must match pyproject.toml version ${packageVersion}`);
  }

  if (typeof registry.description !== "string" || registry.description.trim().length === 0) {
    throw new Error("packages/python/mcp/server.json description must be a non-empty string");
  }

  if (registry.description.length > mcpRegistryDescriptionMaxLength) {
    throw new Error(`packages/python/mcp/server.json description length ${registry.description.length} exceeds MCP Registry limit ${mcpRegistryDescriptionMaxLength}`);
  }
}

function readProjectVersion(pyprojectPath) {
  let inProjectSection = false;

  for (const line of readFileSync(pyprojectPath, "utf8").split(/\r?\n/)) {
    if (/^\[.+\]$/.test(line)) {
      inProjectSection = line === "[project]";
      continue;
    }

    if (!inProjectSection) {
      continue;
    }

    const version = line.match(/^version = "([^"]+)"$/)?.[1];
    if (version) {
      return version;
    }
  }

  throw new Error("Could not read packages/python/mcp/pyproject.toml project version");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
