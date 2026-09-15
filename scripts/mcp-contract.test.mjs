import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyRegistryVersion } from "./check-mcp.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const changes = {
  resource: (registry) => { registry.remotes[0].url = "https://wrong.invalid/mcp"; },
  transport: (registry) => { registry.remotes[0].type = "stdio"; },
  version: (registry) => { registry.version = "0.0.0"; },
  identity: (registry) => { registry.name = "io.github.Wrong/sendmux-mcp"; },
  schema: (registry) => { registry.$schema = "https://wrong.invalid/schema"; },
  package: (registry) => { registry.packages[0].identifier = "wrong-mcp"; },
};

for (const [name, mutate] of Object.entries(changes)) {
  test(`registry rejects ${name} drift against the package contract`, () => {
    const root = mkdtempSync(join(tmpdir(), "sendmux-registry-contract-"));
    try {
      cpSync(join(repository, "packages/python/mcp"), root, { recursive: true, filter: (path) => !path.includes("__pycache__") });
      const path = join(root, "server.json");
      const registry = JSON.parse(readFileSync(path, "utf8"));
      mutate(registry);
      writeFileSync(path, JSON.stringify(registry));
      assert.throws(() => verifyRegistryVersion(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
      assert.equal(existsSync(root), false);
      console.log(`registry fixture ${root} absent`);
    }
  });
}

test("registry matches the actual package contract", () => {
  verifyRegistryVersion(join(repository, "packages/python/mcp"));
});

test("workspace drift gate rejects changed generated MCP contract", () => {
  const root = mkdtempSync(join(tmpdir(), "sendmux-contract-git-"));
  const child = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 10_000 });
    assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
    console.log(`drift child ${result.pid} ESRCH`);
    assert.equal(result.error, undefined);
    return result;
  };
  try {
    const relative = "packages/python/mcp/sendmux_mcp/mcp-contract.json";
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    cpSync(join(repository, relative), path);
    assert.equal(child("git", ["init", "--quiet"]).status, 0);
    assert.equal(child("git", ["add", relative]).status, 0);
    assert.equal(child(process.execPath, [join(repository, "scripts/verify-sdk-staleness.mjs")]).status, 0);
    const contract = JSON.parse(readFileSync(path, "utf8"));
    contract.tools.count += 1;
    writeFileSync(path, JSON.stringify(contract));
    assert.notEqual(child(process.execPath, [join(repository, "scripts/verify-sdk-staleness.mjs")]).status, 0, "Generated MCP contract drift was ignored");
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
    console.log(`drift fixture ${root} absent`);
  }
});
