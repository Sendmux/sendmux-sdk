import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function check({ root, inputDir = join(repository, "packages/python/mcp/sendmux_mcp/openapi"), writeProvenance = false }) {
  const child = spawn(process.execPath, [join(repository, "scripts/check-surface-coverage.mjs"), "--write", ...(writeProvenance ? ["--write-provenance"] : [])], {
    cwd: root, env: { ...process.env, OPENAPI_INPUT_DIR: inputDir }, stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(JSON.stringify({ pid: child.pid, state: "spawned" }));
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try {
    const code = await new Promise((accept, reject) => { child.on("error", reject); child.on("close", accept); });
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
    return { code, output };
  } finally { clearTimeout(timeout); }
}

test("surface gate rejects Rust source provenance drift", async () => {
  const root = mkdtempSync(join(tmpdir(), "sendmux-rust-coverage-"));
  console.log(JSON.stringify({ directory: root, state: "created" }));
  try {
    for (const path of ["packages/ts", "packages/python/mcp/sendmux_mcp/curation.py", "rust/src", "docs/surface-coverage.md"]) {
      cpSync(join(repository, path), join(root, path), { recursive: true, filter: (path) => !/(?:node_modules|\/dist(?:\/|$))/.test(path) });
    }
    if (existsSync(join(repository, "rust/operation-decisions.json"))) cpSync(join(repository, "rust/operation-decisions.json"), join(root, "rust/operation-decisions.json"));
    const healthy = await check({ root });
    assert.equal(healthy.code, 0, healthy.output);
    const path = join(root, "rust/src/generated/mod.rs");
    const before = readFileSync(path, "utf8");
    const changed = before.replace(/(SENDING_OPENAPI_SHA256: &str =\s*")[^"]+/, `$1${"0".repeat(64)}`);
    assert.notEqual(changed, before);
    writeFileSync(path, changed);
    const result = await check({ root });
    assert.notEqual(result.code, 0, "Rust source provenance drift was ignored");
    assert.match(result.output, /Rust.*(?:provenance|hash)/i);
    writeFileSync(path, before);
    const decisionsPath = join(root, "rust/operation-decisions.json");
    const original = readFileSync(decisionsPath, "utf8");
    const mutations = {
      missing: (value) => value.operations.pop(),
      duplicate: (value) => value.operations.push(value.operations[0]),
      route: (value) => { value.operations[0].path = "/wrong"; },
      unknown: (value) => { value.operations[0].operationId = "managementInvented"; },
      method: (value) => { value.operations.find((row) => row.publicMethods.length).publicMethods = ["missing_method"]; },
      classification: (value) => { value.operations[0].decision = "passed"; },
      hash: (value) => { value.sources["openapi-app.json"] = "0".repeat(64); },
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const value = JSON.parse(original);
      mutate(value);
      assert.notEqual(JSON.stringify(value), JSON.stringify(JSON.parse(original)));
      writeFileSync(decisionsPath, JSON.stringify(value));
      const invalid = await check({ root });
      assert.notEqual(invalid.code, 0, `Rust ${name} decision drift was ignored`);
      assert.match(invalid.output, /Rust/);
    }
    writeFileSync(decisionsPath, original);
    assert.equal((await check({ root })).code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
    console.log(JSON.stringify({ directory: root, state: "absent" }));
  }
});

function provenanceFixture() {
  const root = mkdtempSync(join(tmpdir(), "sendmux-rust-provenance-"));
  for (const relative of ["packages/ts", "packages/python/mcp/sendmux_mcp/curation.py", "rust/src", "rust/operation-decisions.json", "docs/surface-coverage.md"]) {
    cpSync(join(repository, relative), join(root, relative), { recursive: true, filter: (path) => !/(?:node_modules|\/dist(?:\/|$))/.test(path) });
  }
  const inputDir = join(root, "inputs");
  mkdirSync(inputDir);
  for (const name of ["openapi-app.json", "openapi-sending.json"]) {
    const snapshotPath = join(inputDir, name);
    cpSync(join(repository, "packages/python/mcp/sendmux_mcp/openapi", name), snapshotPath);
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    snapshot.info.title += " fixture";
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
  }
  return { root, inputDir };
}

test("explicit Rust provenance writer refreshes only pins after metadata-only snapshot change", async () => {
  const fixture = provenanceFixture();
  const { root, inputDir } = fixture;
  try {
    const decisionsPath = join(root, "rust/operation-decisions.json");
    const rustPath = join(root, "rust/src/generated/mod.rs");
    const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
    const rust = readFileSync(rustPath, "utf8");
    const before = await check(fixture);
    assert.notEqual(before.code, 0, "ordinary gate accepted stale provenance");
    assert.match(before.output, /Rust openapi-app.json provenance hash drift/);
    const generated = await check({ ...fixture, writeProvenance: true });
    assert.equal(generated.code, 0, generated.output);
    let expectedRust = rust;
    for (const name of ["openapi-app.json", "openapi-sending.json"]) {
      const hash = createHash("sha256").update(readFileSync(join(inputDir, name))).digest("hex");
      expectedRust = expectedRust.replace(decisions.sources[name], hash);
      decisions.sources[name] = hash;
    }
    assert.deepEqual(JSON.parse(readFileSync(decisionsPath, "utf8")), decisions);
    assert.equal(readFileSync(rustPath, "utf8"), expectedRust);
    assert.equal((await check(fixture)).code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test("explicit Rust provenance writer refuses invalid routes before changing files", async () => {
  const fixture = provenanceFixture();
  const { root } = fixture;
  try {
    const decisionsPath = join(root, "rust/operation-decisions.json");
    const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
    decisions.operations[0].path = "/wrong";
    writeFileSync(decisionsPath, JSON.stringify(decisions));
    const paths = [decisionsPath, join(root, "rust/src/generated/mod.rs"), join(root, "docs/surface-coverage.md")];
    const bytes = paths.map((path) => readFileSync(path));
    const result = await check({ ...fixture, writeProvenance: true });
    assert.notEqual(result.code, 0, "writer accepted an invalid route decision");
    assert.match(result.output, /Rust stale route decision/);
    paths.forEach((path, index) => assert.deepEqual(readFileSync(path), bytes[index]));
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});
