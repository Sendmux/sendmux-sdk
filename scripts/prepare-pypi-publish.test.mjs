import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { pythonPackages } from "./python-release-guardrails.mjs";
import { gitEnvironment } from "./publication-guard.mjs";

const executeFile = promisify(execFile);
const execute = (command, args, options = {}) => executeFile(command, args, { ...options, env: command === "git" ? gitEnvironment(options.env) : options.env });
const prepare = process.env.SENDMUX_TEST_PYPI_PREPARE ?? resolve("scripts/prepare-pypi-publish.mjs");

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-pypi-selection-"));
  const distributions = join(directory, ".tmp/python-dist");
  const published = join(directory, ".tmp/python-publish");
  mkdirSync(distributions, { recursive: true });
  for (const name of pythonPackages) {
    const project = join(directory, "packages/python", name);
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "pyproject.toml"), `[project]\nname = "sendmux-${name}"\nversion = "1.2.3"\n`);
    for (const extension of ["tar.gz", "py3-none-any.whl"]) writeFileSync(join(distributions, `sendmux_${name}-1.2.3.${extension}`), name);
  }
  const requests = [];
  const server = createServer((request, response) => { requests.push(request.url); response.writeHead(404).end(); });
  server.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  const port = server.address().port;
  const preload = join(directory, "transport.mjs");
  writeFileSync(preload, `const transport=fetch;globalThis.fetch=(input,options)=>{const url=new URL(input);if(url.origin!=='https://pypi.org')throw Error('Unexpected host');return transport('http://127.0.0.1:${port}'+url.pathname,options)};`);
  // An older candidate need not contain the guarded preparation implementation.
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, scripts: { "prepare:publish:pypi": "node -e \"throw Error('Candidate preparation predates publication guard')\"" } }));
  mkdirSync(join(directory, ".publication-guard/scripts"), { recursive: true });
  for (const file of ["prepare-pypi-publish.mjs", "python-release-guardrails.mjs"]) {
    writeFileSync(join(directory, ".publication-guard/scripts", file), readFileSync(file === "prepare-pypi-publish.mjs" ? prepare : resolve("scripts", file)));
  }
  t.diagnostic(JSON.stringify({ directory, port, owner: process.pid }));
  t.after(async () => {
    server.closeAllConnections(); await new Promise((done) => server.close(done));
    assert.equal(server.listening, false);
    rmSync(directory, { recursive: true, force: true }); assert.equal(existsSync(directory), false);
    t.diagnostic(JSON.stringify({ removed: directory, serverClosed: port }));
  });
  const run = (selector, command) => {
    const env = { ...process.env, NODE_OPTIONS: `--import=${preload}` };
    delete env.PYTHON_PATHS_RELEASED;
    if (selector !== undefined) env.PYTHON_PATHS_RELEASED = selector;
    const child = command
      ? execute("bash", ["-euo", "pipefail", "-c", command], { cwd: directory, env, timeout: 10_000 })
      : execute(process.execPath, [prepare], { cwd: directory, env, timeout: 10_000 });
    t.diagnostic(JSON.stringify({ child: child.child.pid }));
    return child.finally(() => assert.throws(() => process.kill(child.child.pid, 0), { code: "ESRCH" }));
  };
  return { run, requests, files: () => existsSync(published) ? readdirSync(published).sort() : [] };
}

test("actual PyPI prepare step includes only emitted Python paths when all seven versions are unpublished", async (t) => {
  const candidate = await fixture(t);
  const source = readFileSync(process.env.SENDMUX_TEST_WORKFLOW_FILE ?? resolve(".github/workflows/release-please.yml"), "utf8");
  const job = source.split(/^  publish-pypi:/m)[1].split(/^  [\w-]+:/m)[0];
  const step = job.split("      - name: Select unpublished Python distributions\n")[1].split(/^      - /m)[0];
  const command = step.match(/^        run: (.+)$/m)[1];
  const selector = /^          PYTHON_PATHS_RELEASED: \$\{\{ needs\.release-please\.outputs\.paths_released \}\}$/m.test(step)
    ? '["packages/python/management","packages/ts/cli"]' : undefined;
  await candidate.run(selector, command);
  assert.deepEqual(candidate.files(), ["sendmux_management-1.2.3.py3-none-any.whl", "sendmux_management-1.2.3.tar.gz"]);
  assert.deepEqual(candidate.requests, ["/pypi/sendmux-management/1.2.3/json"]);
});

for (const selector of ["", "[]", "not-json", '"packages/python/management"', '[null]', '["packages/python/unknown"]', '["packages/ts/cli"]']) {
  test(`supplied invalid or empty Python publication selection fails closed: ${selector}`, async (t) => {
    const candidate = await fixture(t);
    await assert.rejects(candidate.run(selector), (error) => error.code === 1 && /Python publication selection/.test(error.stderr));
    assert.deepEqual(candidate.files(), []);
    assert.deepEqual(candidate.requests, []);
  });
}

test("absent Python selector preserves explicit local all-package preparation", async (t) => {
  const candidate = await fixture(t);
  await candidate.run(undefined);
  assert.equal(candidate.files().length, pythonPackages.length * 2);
  for (const name of pythonPackages) assert(candidate.files().includes(`sendmux_${name}-1.2.3.tar.gz`));
});

for (const [helper, released, dependencies] of [
  ["checkPythonSurfaceDependencyFloors", ["sending", "mailbox", "management"], ["core"]],
  ["checkPythonSdkDependencyFloors", ["sdk"], ["core", "mailbox", "management", "sending"]],
  ["checkPythonMcpDependencyFloors", ["mcp"], ["core"]],
  ["checkPythonLangchainDependencyFloors", ["langchain"], ["sending", "mailbox"]],
]) {
  test(`actual Python build environment rejects stale released dependency floors: ${helper}`, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "sendmux-build-selection-"));
    t.diagnostic(JSON.stringify({ directory, owner: process.pid }));
    t.after(() => { rmSync(directory, { recursive: true, force: true }); assert.equal(existsSync(directory), false); });
    const run = (command, args, options = {}) => {
      const child = execute(command, args, { cwd: directory, timeout: 10_000, ...options });
      t.diagnostic(JSON.stringify({ child: child.child.pid }));
      return child.finally(() => assert.throws(() => process.kill(child.child.pid, 0), { code: "ESRCH" }));
    };
    await run("git", ["init", "-q"]); // No origin/main: the missing selector really yields no released packages.
    assert(existsSync(join(directory, ".git")), "Git initialization must belong to the owned fixture");
    writeFileSync(join(directory, ".release-please-manifest.json"), JSON.stringify(Object.fromEntries(pythonPackages.map((name) => [`packages/python/${name}`, "1.2.0"]))));
    const writeFloors = (version) => {
      for (const name of released) {
        const project = join(directory, "packages/python", name);
        mkdirSync(project, { recursive: true });
        writeFileSync(join(project, "pyproject.toml"), `dependencies = [${dependencies.map((dependency) => `"sendmux-${dependency}>=${version},<2.0.0"`).join(",")} ]\n`);
      }
    };
    const workflow = readFileSync(process.env.SENDMUX_TEST_WORKFLOW_FILE ?? resolve(".github/workflows/release-please.yml"), "utf8");
    const step = workflow.split("      - name: Build Python distributions\n")[1].split(/^      - /m)[0];
    const env = { ...process.env };
    for (const key of ["PYTHON_CHANGED_PACKAGES", "PYTHON_PATHS_RELEASED", "GITHUB_BASE_REF"]) delete env[key];
    if (/^          PYTHON_PATHS_RELEASED: \$\{\{ needs\.release-please\.outputs\.paths_released \}\}$/m.test(step)) {
      env.PYTHON_PATHS_RELEASED = JSON.stringify(released.map((name) => `packages/python/${name}`));
    }
    const source = `import {${helper}} from ${JSON.stringify(resolve("scripts/python-release-guardrails.mjs"))}; ${helper}({root:process.cwd()});`;
    writeFloors("1.1.0");
    await assert.rejects(run(process.execPath, ["--input-type=module", "-e", source], { env }), (error) => error.code === 1 && /must require sendmux-.+ >= 1\.2\.0,<2\.0\.0; found >= 1\.1\.0/.test(error.stderr));
    writeFloors("1.2.0");
    await run(process.execPath, ["--input-type=module", "-e", source], { env });
  });
}
