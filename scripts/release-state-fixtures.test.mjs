import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const editJson = (path, edit) => { const value = readJson(path); edit(value); writeFileSync(path, JSON.stringify(value)); };

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "sendmux-release-state-"));
  try {
    for (const path of ["packages", "go/go.mod", "rust/Cargo.toml", "release-please-config.json", ".release-please-manifest.json", ".ruby-version"]) {
      if (!existsSync(join(repository, path))) continue;
      cpSync(join(repository, path), join(root, path), { recursive: true, filter: (source) => !/node_modules|vendor|\.venv|__pycache__|\/dist(?:\/|$)/.test(source) && (!/\.[^/]+$/.test(source) || /(?:package\.json|pyproject\.toml|Cargo\.toml|go\.mod|composer\.json|\.gemspec|version\.rb|__init__\.py|release-please.*\.json|\.ruby-version)$/.test(source)) });
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
    console.log(`release fixture ${root} absent`);
  }
}

function check(root) {
  const child = spawnSync(process.execPath, [join(repository, "scripts/release-state.test.mjs"), "--root", root], { encoding: "utf8", timeout: 30_000 });
  assert.ok(child.pid);
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  console.log(`release checker child ${child.pid} ESRCH`);
  for (const line of child.stdout.split("\n")) if (line.startsWith("Ruby metadata child ")) console.log(line);
  assert.equal(child.error, undefined);
  return child;
}

function mutateNativeVersion(root, file, pattern) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const match = before.match(pattern);
  assert.ok(match, `${file} must contain a native version`);
  const version = match[1];
  const changed = before.replace(pattern, (field) => field.replace(version, version === "0.0.0" ? "0.0.1" : "0.0.0"));
  assert.notEqual(changed, before, `${file} version mutation must change native bytes`);
  writeFileSync(path, changed);
}

const mutations = {
  "typescript version": (root) => editJson(join(root, "packages/ts/core/package.json"), (p) => { p.version = "0.0.0"; }),
  "python version": (root) => mutateNativeVersion(root, "packages/python/core/pyproject.toml", /^version = "([^"]+)"$/m),
  "rust version": (root) => mutateNativeVersion(root, "rust/Cargo.toml", /^version = "([^"]+)"$/m),
  "ruby version": (root) => mutateNativeVersion(root, "packages/ruby/core/lib/sendmux/core/version.rb", /^\s*VERSION = '([^']+)'$/m),
  "ruby identity": (root) => writeFileSync(join(root, "packages/ruby/core/sendmux-core.gemspec"), readFileSync(join(root, "packages/ruby/core/sendmux-core.gemspec"), "utf8").replace("spec.name = 'sendmux-core'", "spec.name = 'wrong-core'")),
  "go identity": (root) => writeFileSync(join(root, "go/go.mod"), readFileSync(join(root, "go/go.mod"), "utf8").replace("module sendmux.ai/go", "module wrong.invalid/go")),
  "go tag convention": (root) => editJson(join(root, "release-please-config.json"), (c) => { c.packages.go["tag-separator"] = "-"; }),
  "missing manifest owner": (root) => editJson(join(root, ".release-please-manifest.json"), (m) => { delete m["packages/python/mcp"]; }),
  "extra manifest owner": (root) => editJson(join(root, ".release-please-manifest.json"), (m) => { m["packages/other"] = "1.0.0"; }),
  "missing config owner": (root) => editJson(join(root, "release-please-config.json"), (c) => { delete c.packages["rust"]; }),
  "missing both owners": (root) => { editJson(join(root, "release-please-config.json"), (c) => { delete c.packages["packages/python/mcp"]; }); editJson(join(root, ".release-please-manifest.json"), (m) => { delete m["packages/python/mcp"]; }); },
  "php release ownership": (root) => editJson(join(root, "release-please-config.json"), (c) => { c.packages["packages/php/core"] = { "package-name": "sendmux/core" }; }),
  "php invented version": (root) => editJson(join(root, "packages/php/core/composer.json"), (c) => { c.version = "2.1.0"; }),
  "php identity": (root) => editJson(join(root, "packages/php/core/composer.json"), (c) => { c.name = "wrong/core"; }),
  "php missing umbrella dependency": (root) => editJson(join(root, "packages/php/sdk/composer.json"), (c) => { delete c.require["sendmux/mailbox"]; }),
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`native release gate rejects ${name}`, () => fixture((root) => {
    mutate(root);
    const result = check(root);
    assert.notEqual(result.status, 0, `${name} drift was accepted: ${result.stdout}`);
  }));
}

test("native release gate accepts native versions without inventing Go or PHP fields", () => fixture((root) => {
  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
}));

for (const [language, owner, versionFile] of [
  ["python", "packages/python/core", "packages/python/core/pyproject.toml"],
  ["rust", "rust", "rust/Cargo.toml"],
  ["ruby", "packages/ruby/core", "packages/ruby/core/lib/sendmux/core/version.rb"],
]) {
  test(`native release gate accepts synchronized future ${language} release and rejects its version mutation`, () => fixture((root) => {
    const manifest = readJson(join(root, ".release-please-manifest.json"));
    const current = manifest[owner];
    const future = `${Number(current.split(".")[0]) + 1}.0.0`;
    const path = join(root, versionFile);
    const before = readFileSync(path, "utf8");
    const advanced = before.replace(current, future);
    assert.notEqual(advanced, before, `${language} future fixture must change native bytes`);
    writeFileSync(path, advanced);
    editJson(join(root, ".release-please-manifest.json"), (m) => { m[owner] = future; });
    const healthy = check(root);
    assert.equal(healthy.status, 0, healthy.stderr);
    mutations[`${language} version`](root);
    const mismatch = check(root);
    assert.notEqual(mismatch.status, 0, `${language} future version drift was accepted: ${mismatch.stdout}`);
    assert.notEqual(readFileSync(path, "utf8"), advanced, `${language} mutation must change native bytes`);
  }));
}
