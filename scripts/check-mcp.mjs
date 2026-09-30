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

export function verifyRegistryVersion(packageDir = mcpPackageDir, npmPackageDir = join(root, "packages/ts/mcp")) {
  const pyprojectPath = join(packageDir, "pyproject.toml");
  const registryPath = join(packageDir, "server.json");
  const packageVersion = readProjectVersion(pyprojectPath);
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const packageEntries = registry.packages?.filter((entry) => entry.registryType === "pypi" && entry.identifier === "sendmux-mcp") ?? [];
  const npmEntries = registry.packages?.filter((entry) => entry.registryType === "npm" && entry.identifier === "sendmux-mcp") ?? [];
  assert.equal(packageEntries.length, 1, "MCP Registry must contain exactly one PyPI sendmux-mcp entry");
  assert.equal(npmEntries.length, 1, "MCP Registry must contain exactly one npm sendmux-mcp entry");
  const [packageEntry] = packageEntries;
  const [npmEntry] = npmEntries;
  const npmPackage = JSON.parse(readFileSync(join(npmPackageDir, "package.json"), "utf8"));
  const contract = JSON.parse(readFileSync(join(packageDir, "sendmux_mcp/mcp-contract.json"), "utf8"));

  assert.equal(contract.package.version, packageVersion, "MCP contract version must match native project version");
  assert.equal(registry.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json", "MCP Registry schema");
  assert.equal(registry.name, `io.github.Sendmux/${contract.package.identity}`, "MCP Registry identity");
  assert.deepEqual(registry.remotes, contract.hosted.transports.map((type) => ({ type, url: contract.hosted.resource })), "MCP Registry resource/transport must match the package contract");
  assert.equal(packageEntry?.identifier, contract.package.identity, "MCP Registry package identity");
  assert.equal(packageEntry?.transport?.type, contract.local.default_transport, "MCP Registry local transport");

  assert.match(registry.version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/, "MCP Registry metadata version must be a semantic version");
  assert.notEqual(registry.version, "0.0.0", "MCP Registry metadata version must not be a bootstrap version");
  assert.equal(npmEntry.identifier, npmPackage.name, "MCP Registry npm package identity");
  assert.equal(npmEntry.version, npmPackage.version, "MCP Registry npm version must match package.json version");
  assert.equal(npmEntry.transport?.type, "stdio", "MCP Registry npm bridge transport");
  assert.equal(npmPackage.mcpName, registry.name, "MCP Registry npm ownership marker");

  if (packageEntry?.version !== packageVersion) {
    throw new Error(`packages/python/mcp/server.json package version ${packageEntry?.version ?? "<missing>"} must match pyproject.toml version ${packageVersion}`);
  }

  if (typeof registry.description !== "string" || registry.description.trim().length === 0) {
    throw new Error("packages/python/mcp/server.json description must be a non-empty string");
  }

  if (registry.description.length > mcpRegistryDescriptionMaxLength) {
    throw new Error(`packages/python/mcp/server.json description length ${registry.description.length} exceeds MCP Registry limit ${mcpRegistryDescriptionMaxLength}`);
  }
  return registry;
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
