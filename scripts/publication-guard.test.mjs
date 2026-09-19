import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { gitEnvironment } from "./publication-guard.mjs";

const executeFile = promisify(execFile);
const execute = (command, args, options = {}) => executeFile(command, args, { ...options, env: command === "git" ? gitEnvironment(options.env) : options.env });
const guard = process.env.SENDMUX_TEST_PUBLICATION_GUARD ?? resolve("scripts/publication-guard.mjs");
const specPath = "packages/python/mcp/sendmux_mcp/openapi";
const repository = "Sendmux/sendmux-sdk";
const repositoryId = 1253958043;
const document = { openapi: "3.1.0", paths: {}, components: { schemas: { Provider: { required: ["variables", "delivery_group"] } } } };

async function foreignGitFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-foreign-git-"));
  const env = { ...process.env };
  for (const key of execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).trim().split("\n")) delete env[key];
  const run = (command, args, options = {}) => {
    const child = execute(command, args, { env, timeout: 10_000, ...options });
    t.diagnostic(JSON.stringify({ child: child.child.pid }));
    return child.finally(() => assert.throws(() => process.kill(child.child.pid, 0), { code: "ESRCH" }));
  };
  t.diagnostic(JSON.stringify({ directory, owner: process.pid }));
  t.after(() => { rmSync(directory, { recursive: true, force: true }); assert.equal(existsSync(directory), false); });
  const [caller, foreign] = ["caller", "foreign"].map((name) => join(directory, name));
  for (const repo of [caller, foreign]) {
    mkdirSync(join(repo, specPath), { recursive: true });
    for (const name of ["app", "sending"]) writeFileSync(join(repo, specPath, `openapi-${name}.json`), JSON.stringify({ ...document, description: repo }));
    await run("git", ["-C", repo, "init", "-q"]);
    await run("git", ["-C", repo, "add", "."]);
    await run("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", repo]);
  }
  const injected = { ...env, GIT_DIR: join(caller, ".git"), GIT_WORK_TREE: caller, GIT_INDEX_FILE: join(caller, ".git/index") };
  const callerState = async () => ({
    config: readFileSync(join(caller, ".git/config"), "utf8"),
    index: readFileSync(join(caller, ".git/index")).toString("hex"),
    refs: (await run("git", ["-C", caller, "show-ref"])).stdout,
  });
  return { directory, caller, foreign, run, env: injected, callerState };
}

test("foreign Git helper reads the requested repository despite inherited hook location", async (t) => {
  const fixture = await foreignGitFixture(t);
  const expected = (await fixture.run("git", ["-C", fixture.foreign, "rev-parse", "HEAD"])).stdout;
  const source = `import {git} from ${JSON.stringify(guard)}; console.log((await git({repo:${JSON.stringify(fixture.foreign)},args:['rev-parse','HEAD']})).trim());`;
  const result = await fixture.run(process.execPath, ["--input-type=module", "-e", source], { env: fixture.env });
  assert.equal(result.stdout, expected);
});

test("foreign Git helper config writes preserve caller metadata and nonlocal configuration", async (t) => {
  const fixture = await foreignGitFixture(t);
  const before = await fixture.callerState();
  const global = join(fixture.directory, "global.config");
  writeFileSync(global, "[publication]\n\ttransport = preserved\n");
  const source = `import {git} from ${JSON.stringify(guard)}; await git({repo:${JSON.stringify(fixture.foreign)},args:['config','user.name','Foreign fixture']}); console.log((await git({repo:${JSON.stringify(fixture.foreign)},args:['config','--get','publication.transport']})).trim());`;
  const result = await fixture.run(process.execPath, ["--input-type=module", "-e", source], { env: { ...fixture.env, GIT_CONFIG_GLOBAL: global } });
  assert.deepEqual(await fixture.callerState(), before);
  assert.equal((await fixture.run("git", ["-C", fixture.foreign, "config", "user.name"])).stdout.trim(), "Foreign fixture");
  assert.equal(result.stdout.trim(), "preserved");
});

test("negative diagnostic creates only its owned repository under inherited hook location", async (t) => {
  const fixture = await foreignGitFixture(t);
  const before = await fixture.callerState();
  const diagnostic = resolve("scripts/test-publication-gates.mjs");
  const env = { ...fixture.env, RUNNER_TEMP: fixture.directory };
  const result = await fixture.run(process.execPath, [diagnostic, "prepare-negative", "--repo", fixture.foreign], { env });
  const receipt = JSON.parse(result.stdout.trim());
  assert.deepEqual(await fixture.callerState(), before);
  assert(existsSync(join(receipt.directory, ".git")));
  const raw = (await fixture.run("git", ["-C", receipt.directory, "show", `HEAD:${specPath}/openapi-app.json`])).stdout;
  assert.equal(JSON.parse(raw).description, fixture.foreign);
  await fixture.run(process.execPath, [diagnostic, "cleanup-negative", "--directory", receipt.directory], { env });
  assert.equal(existsSync(receipt.directory), false);
});

async function fixture(t, live = document) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-guard-git-"));
  const repo = join(directory, "sdk");
  mkdirSync(join(repo, specPath), { recursive: true });
  for (const name of ["app", "sending"]) writeFileSync(join(repo, specPath, `openapi-${name}.json`), JSON.stringify(document));
  const git = (...args) => execute("git", ["-C", repo, ...args]);
  await git("init", "--quiet");
  await git("add", ".");
  await git("-c", "user.name=Guard Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "candidate");
  const sha = (await git("rev-parse", "HEAD")).stdout.trim();
  const server = createServer((_request, response) => response.end(JSON.stringify(live)));
  server.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  const preload = join(directory, "transport.mjs");
  writeFileSync(preload, `const transport = globalThis.fetch; globalThis.fetch = (url, options) => {
    if (!String(url).endsWith('/api/v1/openapi.json')) throw new Error('Unexpected request');
    return transport('http://127.0.0.1:${server.address().port}/', options);
  };`);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    assert.equal(server.listening, false);
    rmSync(directory, { recursive: true, force: true });
    assert.equal(existsSync(directory), false);
  });
  const run = (args = []) => execute(process.execPath, [guard, "candidate", "--repo", repo, "--sha", sha, ...args], {
    env: { ...process.env, NODE_OPTIONS: `--import=${preload}` }, timeout: 10_000,
  });
  return { repo, sha, directory, run, git };
}

for (const missing of ["variables", "delivery_group"]) {
  test(`first-write boundary blocks a candidate requiring absent ${missing}`, async (t) => {
    const live = structuredClone(document);
    live.components.schemas.Provider.required = live.components.schemas.Provider.required.filter((key) => key !== missing);
    const candidate = await fixture(t, live);
    let writes = 0;
    await assert.rejects(candidate.run().then(() => { writes += 1; }), (error) => error.code === 1 && /differs/.test(error.stderr)
      && error.stdout.includes(candidate.sha) && error.stdout.includes("openapi-app.json"));
    assert.equal(writes, 0);
  });
}

test("strict parity accepts reordered object keys and reaches the writer", async (t) => {
  const candidate = await fixture(t, { components: document.components, paths: {}, openapi: "3.1.0" });
  let writes = 0;
  const result = await candidate.run().then((value) => { writes += 1; return value; });
  assert.equal(writes, 1);
  assert.match(result.stdout, new RegExp(candidate.sha));
});

test("description-only drift is conservatively blocked", async (t) => {
  const candidate = await fixture(t, { ...document, description: "Only prose changed" });
  await assert.rejects(candidate.run(), (error) => error.code === 1 && /differs/.test(error.stderr));
});

test("later publisher cannot check a different checkout with matching snapshots", async (t) => {
  const candidate = await fixture(t);
  await candidate.git("-c", "user.name=Guard Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "--quiet", "-m", "other source");
  await assert.rejects(candidate.run(), (error) => /checkout/.test(error.stderr));
});

test("generation cannot silently replace committed candidate snapshots", async (t) => {
  const candidate = await fixture(t);
  writeFileSync(join(candidate.repo, specPath, "openapi-app.json"), JSON.stringify({ ...document, description: "new input" }));
  await assert.rejects(candidate.run(), (error) => /snapshot.*changed/i.test(error.stderr));
});

async function releaseFixture(t, options = {}) {
  const local = await fixture(t);
  const config = { "release-type": "node", "include-component-in-tag": true, "sequential-calls": true,
    "separate-pull-requests": true, packages: { "packages/ts/cli": { component: "ts-cli", "package-name": "@sendmux/cli" } } };
  if (options.customLabels) config.label = "custom pending";
  mkdirSync(join(local.repo, "packages/ts/cli"), { recursive: true });
  writeFileSync(join(local.repo, "packages/python/mcp/pyproject.toml"), '[project]\nversion = "1.2.3"\n');
  mkdirSync(join(local.repo, "packages/python/langchain"), { recursive: true });
  writeFileSync(join(local.repo, "packages/python/langchain/pyproject.toml"), '[project]\nname = "langchain-sendmux"\nversion = "1.2.3"\n');
  mkdirSync(join(local.repo, ".github/workflows"), { recursive: true });
  writeFileSync(join(local.repo, "packages/ts/cli/package.json"), JSON.stringify({ name: "@sendmux/cli", version: "1.2.3" }));
  mkdirSync(join(local.repo, "packages/ts/management"), { recursive: true });
  writeFileSync(join(local.repo, "packages/ts/management/package.json"), JSON.stringify({ name: "@sendmux/management", version: "1.2.3" }));
  writeFileSync(join(local.repo, "release-please-config.json"), JSON.stringify(config));
  writeFileSync(join(local.repo, ".release-please-manifest.json"), '{"packages/ts/cli":"1.2.3"}');
  const workflowSource = readFileSync(resolve(".github/workflows/release-please.yml"), "utf8");
  writeFileSync(join(local.repo, ".github/workflows/release-please.yml"), options.actionOverride
    ? workflowSource.replace("          manifest-file: .release-please-manifest.json", "          manifest-file: .release-please-manifest.json\n          target-branch: another-branch") : workflowSource);
  await local.git("add", ".");
  await local.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "release metadata");
  const sha = (await local.git("rev-parse", "HEAD")).stdout.trim();
  const other = "b".repeat(40);
  const pull = (number, overrides = {}) => ({ number, merged_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-17T00:00:00Z",
    merge_commit_sha: sha, head: { ref: "release-please--branches--main--components--ts-cli" }, base: { ref: "main" },
    labels: [{ name: "autorelease: pending" }], title: "chore(main): release ts-cli 1.2.3",
    body: ":robot: I have created a release *beep* *boop*\n---\n\n<details><summary>ts-cli: 1.2.3</summary>\n\n## 1.2.3\n\nfix: fixture\n</details>\n\n---\nThis PR was generated with Release Please.", ...overrides });
  const queries = [];
  let heads = 0;
  let scans = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://fixture");
    queries.push({ method: request.method, url: request.url, originalUrl: request.headers["x-sendmux-fixture-original-url"] });
    response.setHeader("Content-Type", "application/json");
    const send = (value) => response.end(JSON.stringify(value));
    if (request.method !== "GET") { response.statusCode = 405; return send({ message: "writer forbidden" }); }
    if (url.pathname.endsWith("/api/v1/openapi.json")) return send(options.liveDrift ? { ...document, description: "live differs" } : document);
    const repositoryPrefix = [`/repos/${repository}`, `/repositories/${repositoryId}`]
      .find((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
    const route = repositoryPrefix ? url.pathname.slice(repositoryPrefix.length) : url.pathname;
    if (route === "") return send({ id: repositoryId, default_branch: "main" });
    if (route.startsWith("/git/trees/")) {
      const listing = (await local.git("ls-tree", "-r", sha)).stdout.trim().split("\n");
      return send({ truncated: false, tree: listing.map((line) => {
        const [metadata, filename] = line.split("\t");
        const [mode, type, blob] = metadata.split(" ");
        return { mode, type, sha: blob, path: filename };
      }) });
    }
    if (route.startsWith("/git/blobs/")) {
      const content = (await local.git("cat-file", "blob", route.split("/").at(-1))).stdout;
      return send({ content: Buffer.from(content).toString("base64"), encoding: "base64" });
    }
    if (route === "/git/ref/heads/main") { heads++; return send({ object: { type: "commit", sha: options.superseded || (options.changedHead && heads > 1) ? other : sha } }); }
    if (route.startsWith("/git/ref/tags/")) {
      if (options.conflictingTag) return send({ object: { type: "commit", sha: other } });
      if (options.tagExists) return send({ object: { type: "commit", sha } });
      response.statusCode = 404; return send({ message: "Not Found" });
    }
    if (url.pathname === "/@sendmux/cli/1.2.3") return send({ name: "@sendmux/cli", version: "1.2.3", dist: {
      tarball: "https://registry.npmjs.org/@sendmux/cli/-/cli-1.2.3.tgz", integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
    } });
    if (url.pathname.startsWith("/-/npm/v1/attestations/")) {
      const payload = { predicateType: "https://slsa.dev/provenance/v1", subject: [{ name: "pkg:npm/%40sendmux/cli@1.2.3", digest: { sha512: "01".repeat(64) } }],
        predicate: { buildDefinition: { externalParameters: { workflow: { repository: "https://github.com/Sendmux/sendmux-sdk", path: ".github/workflows/release-please.yml" } },
          resolvedDependencies: [{ uri: "git+https://github.com/Sendmux/sendmux-sdk@refs/heads/main", digest: { gitCommit: options.wrongProducer ? other : sha } }] } } };
      return send({ attestations: [{ predicateType: payload.predicateType, bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(payload)).toString("base64") } } }] });
    }
    if (route === "/pulls") {
      assert.equal(url.searchParams.get("sort"), "updated");
      assert.equal(url.searchParams.get("direction"), "desc");
      assert.equal(url.searchParams.get("base"), "main");
      assert.equal(url.searchParams.get("state"), "closed");
      const page = Number(url.searchParams.get("page") ?? 1);
      const linkOrigin = options.wrongPaginationHost ? "https://example.invalid" : "https://api.github.com";
      const linkRepository = options.numericPagination
        ? `/repositories/${options.wrongNumericRepository ? repositoryId + 1 : repositoryId}`
        : `/repos/${repository}`;
      const nextPage = options.repeatedPage ? page : page + 1;
      const nextLink = `${linkOrigin}${linkRepository}/pulls?state=closed&base=main&sort=updated&direction=desc&page=${nextPage}`;
      if (page === 1) scans++;
      if (options.noPending) return send([]);
      if (options.lastMergedPending) {
        response.setHeader("Link", `<${nextLink}>; rel="next"`);
        if (page === 1) return send(Array.from({ length: 30 }, (_, i) => pull(1000 + i, { merged_at: null, labels: [] })));
        return send(Array.from({ length: 30 }, (_, i) => {
          const number = (page - 2) * 30 + i + 1;
          return pull(number, { labels: number === 200 ? [{ name: "autorelease: pending" }] : [], merge_commit_sha: number === 200 ? other : sha });
        }));
      }
      if (options.incomplete || (options.closedBeforeMerged && page === 1)) response.setHeader("Link", `<${nextLink}>; rel="next"`);
      if (options.incomplete || (options.closedBeforeMerged && page === 1)) return send(Array.from({ length: 30 }, (_, i) => pull(page * 1000 + i, { merged_at: null, labels: [] })));
      if (options.mixed) return send([pull(1), pull(2, { merge_commit_sha: other })]);
      if (options.changedCandidates && scans >= 3) return send([]);
      return send([pull(1, options.incompatiblePending ? { merge_commit_sha: other } : {})]);
    }
    if (route.startsWith("/contents/")) {
      const file = decodeURIComponent(route.slice("/contents/".length));
      let content;
      if (url.searchParams.get("ref") === other && file.startsWith(specPath)) content = JSON.stringify({ ...document, description: "incompatible pending source" });
      else {
        try { content = (await local.git("show", `${sha}:${file}`)).stdout; }
        catch { response.statusCode = 404; return send({ message: "Not Found" }); }
      }
      return send({ content: Buffer.from(content).toString("base64"), encoding: "base64", sha: "c".repeat(40), type: "file", size: content.length });
    }
    response.statusCode = 404; send({ message: `Unexpected fixture route ${route}` });
  });
  server.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); assert.equal(server.listening, false); });
  const preload = join(local.directory, "release-transport.mjs");
  writeFileSync(preload, `const transport = globalThis.fetch; globalThis.fetch = (input, options) => {
    const url = new URL(input);
    if (!['api.github.com', 'app.sendmux.ai', 'smtp.sendmux.ai', 'registry.npmjs.org', 'example.invalid'].includes(url.hostname)) throw new Error('Unexpected host');
    const headers = new Headers(options?.headers);
    headers.set('x-sendmux-fixture-original-url', url.href);
    return transport('http://127.0.0.1:${server.address().port}' + url.pathname + url.search, {...options, headers});
  };`);
  const runCommand = (args, env = {}) => execute(process.execPath, [guard, ...args], {
    env: { ...process.env, GITHUB_REPOSITORY: "Sendmux/sendmux-sdk", NODE_OPTIONS: `--import=${preload}`, ...env }, timeout: 20_000,
  });
  const runBoundary = (command, env = {}, cwd = local.repo) => execute("bash", ["-euo", "pipefail", "-c", `${command}\nprintf writer-reached`], {
    cwd, env: { ...process.env, GITHUB_REPOSITORY: "Sendmux/sendmux-sdk", NODE_OPTIONS: `--import=${preload}`, CANDIDATE_SHA: sha, CONTROL_SHA: sha,
      PUBLICATION_RELEASES: "[]", RUNNER_TEMP: local.directory, PRODUCER_TAG: "ts-cli-v1.2.3", ...env }, timeout: 20_000,
  });
  const run = () => runCommand(["preflight", "--repo", local.repo, "--sha", sha, "--receipt", join(local.directory, "receipt.json")]);
  mkdirSync(join(local.repo, "snap"));
  writeFileSync(join(local.repo, "snap/snapcraft.yaml"), `version: "1.2.3"\nparts:\n  sendmux:\n    source: https://registry.npmjs.org/@sendmux/cli/-/cli-1.2.3.tgz\n    source-checksum: sha512/${"01".repeat(64)}\n`);
  return { run, runCommand, runBoundary, queries, sha, directory: local.directory, repo: local.repo };
}

for (const [name, options, error] of [
  ["live-compatible event cannot certify incompatible pending merge B", { incompatiblePending: true }, /differs/],
  ["mixed pending merge sources fail before tags", { mixed: true }, /multiple|mixed/i],
  ["existing conflicting tag fails before Release Please", { conflictingTag: true }, /tag.*conflict/i],
  ["superseded event fails before Release Please", { superseded: true }, /head|superseded/i],
  ["incomplete bounded discovery is not an empty set", { incomplete: true }, /discovery.*bound/i],
  ["candidate set changes before action fail closed", { changedCandidates: true }, /changed/i],
  ["main changes before action fail closed", { changedHead: true }, /head|changed/i],
  ["unsupported action inputs cannot change the guarded target", { actionOverride: true }, /configuration|inputs/i],
  ["custom labels cannot silently change discovery", { customLabels: true }, /configuration/i],
  ["200th merged candidate remains covered after unmerged closed rows", { lastMergedPending: true }, /differs/i],
]) {
  test(name, async (t) => {
    const candidate = await releaseFixture(t, options);
    let writes = 0;
    await assert.rejects(candidate.run().then(() => { writes++; }), (failure) => failure.code === 1 && error.test(failure.stderr));
    assert.equal(writes, 0);
    assert.ok(candidate.queries.every((query) => query.method === "GET"));
  });
}

test("official release construction reaches writer after updated-order scan including unmerged closed rows", async (t) => {
  const candidate = await releaseFixture(t, { closedBeforeMerged: true, numericPagination: true });
  let writes = 0;
  await candidate.run().then(() => { writes++; });
  assert.equal(writes, 1);
  const receipt = JSON.parse(readFileSync(join(candidate.directory, "receipt.json"), "utf8"));
  assert.deepEqual(receipt.releases, [{ path: "packages/ts/cli", tag: "ts-cli-v1.2.3", version: "1.2.3", sha: candidate.sha }]);
  assert.ok(candidate.queries.every((query) => query.method === "GET"));
  assert.ok(candidate.queries.some((query) => query.originalUrl?.startsWith(`https://api.github.com/repositories/${repositoryId}/pulls?`)));
});

for (const [name, options] of [
  ["wrong numeric repository pagination fails before writer or unapproved fetch", { wrongNumericRepository: true }],
  ["wrong pagination host fails before writer or unapproved fetch", { wrongPaginationHost: true }],
  ["repeated numeric pagination page fails before writer", { repeatedPage: true }],
]) {
  test(name, async (t) => {
    const candidate = await releaseFixture(t, { closedBeforeMerged: true, numericPagination: true, ...options });
    let writes = 0;
    await assert.rejects(candidate.run().then(() => { writes++; }), (failure) => failure.code === 1 && /Non-progressing discovery pagination/.test(failure.stderr));
    assert.equal(writes, 0);
    assert.ok(candidate.queries.every((query) => query.method === "GET"));
    assert.ok(candidate.queries.every((query) => !query.originalUrl?.startsWith("https://example.invalid/")
      && !query.originalUrl?.startsWith(`https://api.github.com/repositories/${repositoryId + 1}/`)));
  });
}

test("no pending candidate permits guarded PR maintenance with no publisher identity", async (t) => {
  const candidate = await releaseFixture(t, { noPending: true });
  await candidate.run();
  const receipt = JSON.parse(readFileSync(join(candidate.directory, "receipt.json"), "utf8"));
  assert.deepEqual(receipt.candidates, []);
  assert.deepEqual(receipt.releases, []);
  assert.deepEqual(receipt.checked.map((entry) => entry.sha), [candidate.sha]);
});

test("recovery resolves the tag commit and rejects a manual version/source mismatch", async (t) => {
  const candidate = await releaseFixture(t, { tagExists: true });
  await assert.rejects(candidate.runCommand(["resolve", "--tag", "ts-cli-v9.9.9"]), (error) => /version/.test(error.stderr));
  const { stdout } = await candidate.runCommand(["resolve", "--tag", "ts-cli-v1.2.3"]);
  assert.match(stdout, new RegExp(candidate.sha));
});

test("recovery resolves a Management tag commit and rejects a manual version/source mismatch", async (t) => {
  const candidate = await releaseFixture(t, { tagExists: true });
  await assert.rejects(candidate.runCommand(["resolve", "--tag", "ts-management-v9.9.9"]), (error) => /version/.test(error.stderr));
  const { stdout } = await candidate.runCommand(["resolve", "--tag", "ts-management-v1.2.3"]);
  assert.match(stdout, new RegExp(candidate.sha));
  assert.match(stdout, /"path":"packages\/ts\/management"/);
});

test("recovery resolves a Python package tag commit, emits its released path, and rejects a manual version/source mismatch", async (t) => {
  const candidate = await releaseFixture(t, { tagExists: true });
  await assert.rejects(candidate.runCommand(["resolve", "--tag", "python-langchain-v9.9.9"]), (error) => /version/.test(error.stderr));
  await assert.rejects(candidate.runCommand(["resolve", "--tag", "python-unknown-v1.2.3"]), (error) => /release tag/.test(error.stderr));
  const output = join(candidate.directory, "python-producer-output");
  const { stdout } = await candidate.runCommand(["resolve", "--tag", "python-langchain-v1.2.3"], { GITHUB_OUTPUT: output });
  assert.match(stdout, new RegExp(candidate.sha));
  assert.match(stdout, /"path":"packages\/python\/langchain"/);
  const outputs = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("=")));
  assert.equal(outputs.paths_released, '["packages/python/langchain"]');
});

test("Snap binds checksum and producer source before its write", async (t) => {
  const candidate = await releaseFixture(t, { tagExists: true });
  let writes = 0;
  await candidate.runCommand(["snap", "--repo", candidate.repo]).then(() => writes++);
  assert.equal(writes, 1);
});

test("Snap rejects a matching version and checksum from a different producer commit", async (t) => {
  const candidate = await releaseFixture(t, { tagExists: true, wrongProducer: true });
  let writes = 0;
  await assert.rejects(candidate.runCommand(["snap", "--repo", candidate.repo]).then(() => writes++), (error) => /producer|provenance/.test(error.stderr));
  assert.equal(writes, 0);
});

test("post-action verification does not trust output sha over actual tag identity", async (t) => {
  const candidate = await releaseFixture(t, { conflictingTag: true });
  const release = { path: "packages/ts/cli", tag: "ts-cli-v1.2.3", sha: candidate.sha, version: "1.2.3" };
  const receipt = join(candidate.directory, "receipt.json");
  writeFileSync(receipt, JSON.stringify({ releases: [release] }));
  await assert.rejects(candidate.runCommand(["verify-release", "--receipt", receipt], { RELEASE_PLEASE_OUTPUTS: JSON.stringify({ paths_released: '["packages/ts/cli"]',
    "packages/ts/cli--sha": candidate.sha, "packages/ts/cli--tag_name": release.tag, "packages/ts/cli--version": release.version }) }), (error) => /tag|candidate/i.test(error.stderr));
});

// Execute the checked-in guard command, not a reimplementation of its condition.
// Actions' own failure/conditional propagation is separately exercised by the
// credential-free diagnostic workflow; these fixtures never invoke a writer.
for (const [workflow, job, guardName] of [
  ["release-please", "release-please", "Guard exact pending release candidates before tags"],
  ...["publish-npm", "publish-cratesio", "recover-ts-cli-release", "recover-ts-management-release", "recover-mcp-registry-release", "recover-python-release", "publish-pypi", "publish-mcp-registry", "publish-rubygems"].map((job) => ["release-please", job, "Guard candidate before first publication"]),
  ["snap", "build", "Guard producer before Snap publication"],
  ["chocolatey", "package", "Guard candidate before first publication"],
]) {
  test(`${workflow}/${job}: actual gate stops the next writer on drift and allows equality`, async (t) => {
    const workflowSource = readFileSync(process.env.SENDMUX_TEST_WORKFLOW_FILE ?? resolve(`.github/workflows/${workflow}.yml`), "utf8");
    const jobSource = workflowSource.split(new RegExp(`^  ${job}:`, "m"))[1]?.split(/^  [\w-]+:/m)[0] ?? "";
    const step = jobSource.split(`      - name: ${guardName}\n`)[1]?.split(/^      - /m)[0];
    const inline = step?.match(/^        run: (?!\|)(.+)$/m)?.[1];
    const block = step?.match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1]?.replace(/^          /gm, "");
    const negative = await releaseFixture(t, { tagExists: true, liveDrift: true });
    // A checkout path is data even when its name contains shell metacharacters.
    const fixtureGuard = join(negative.directory, "guard ' $(printf expanded) `printf substituted`.mjs");
    writeFileSync(fixtureGuard, `process.argv[1] = ${JSON.stringify(guard)}; await import(${JSON.stringify(guard)});`);
    const command = (inline ?? block ?? "true").replace(/(?:\.\.\/)?(?:\.publication-guard\/)?scripts\/publication-guard\.mjs/g, '"$SENDMUX_TEST_GUARD_PATH"');
    await assert.rejects(negative.runBoundary(command, { SENDMUX_TEST_GUARD_PATH: fixtureGuard }), (error) => error.code === 1 && !error.stdout.includes("writer-reached") && /differs/.test(error.stderr));
    const positive = await releaseFixture(t, { tagExists: true });
    const { stdout } = await positive.runBoundary(command, { SENDMUX_TEST_GUARD_PATH: fixtureGuard, ...(job.includes("mcp") ? { PRODUCER_TAG: "python-mcp-v1.2.3" } : {}),
      ...(job === "recover-python-release" ? { PRODUCER_TAG: "python-langchain-v1.2.3" } : {}) });
    assert.match(stdout, /writer-reached/);
  });
}

for (const job of ["pre-release-please", "dependent-publisher-sentinel", "independent-recovery", "conditional-distribution"]) {
  test(`diagnostic ${job} sentinel rejects reachability`, async (t) => {
    const workflow = readFileSync(resolve(".github/workflows/publication-guard-diagnostic.yml"), "utf8");
    const jobSource = workflow.split(new RegExp(`^  ${job}:`, "m"))[1]?.split(/^  [\w-]+:/m)[0] ?? "";
    const step = jobSource.split(/^      - /m).slice(1).find((source) => job === "dependent-publisher-sentinel" ? source.startsWith("run:") : /^        id: writer$/m.test(source));
    const inline = step?.match(/^(?:        )?run: (?!\|)(.+)$/m)?.[1];
    const block = step?.match(/^(?:        )?run: \|\n((?:          .*\n|\n)+)/m)?.[1]?.replace(/^          /gm, "");
    const command = inline ?? block;
    assert.equal(typeof command, "string", `${job} must retain an executable sentinel`);
    const child = execute("bash", ["-euo", "pipefail", "-c", command], { timeout: 10_000 });
    t.diagnostic(JSON.stringify({ child: child.child.pid }));
    try {
      await assert.rejects(child, (error) => error.code === 1 && /ERROR — .* was reachable/.test(error.stdout));
    } finally {
      assert.throws(() => process.kill(child.child.pid, 0), { code: "ESRCH" });
    }
  });
}

test("credential-free Actions fixture uses a real committed mismatch and tears down its exact repository", async (t) => {
  const candidate = await releaseFixture(t);
  const diagnostic = resolve("scripts/test-publication-gates.mjs");
  const { stdout } = await execute(process.execPath, [diagnostic, "prepare-negative", "--repo", candidate.repo], { env: { ...process.env, RUNNER_TEMP: candidate.directory } });
  const receipt = JSON.parse(stdout);
  try {
    await assert.rejects(candidate.runCommand(["candidate", "--repo", receipt.directory, "--sha", receipt.sha]), (error) => error.code === 1 && /differs/.test(error.stderr));
  } finally {
    await execute(process.execPath, [diagnostic, "cleanup-negative", "--directory", receipt.directory], { env: { ...process.env, RUNNER_TEMP: candidate.directory } });
  }
  assert.equal(existsSync(receipt.directory), false);
});

for (const [job, tag] of [["recover-ts-cli-release", "ts-cli-v1.2.3"], ["recover-ts-management-release", "ts-management-v1.2.3"], ["recover-mcp-registry-release", "python-mcp-v1.2.3"], ["recover-python-release", "python-langchain-v1.2.3"]]) {
  test(`${job}: empty-workspace checkout lifecycle retains exact current guard and reaches publication boundary`, async (t) => {
    const candidate = await releaseFixture(t, { tagExists: true });
    const control = join(candidate.directory, "control");
    const workspace = join(candidate.directory, "workspace");
    t.diagnostic(JSON.stringify({ directory: candidate.directory, owner: process.pid }));
    mkdirSync(join(control, "scripts"), { recursive: true });
    mkdirSync(workspace);
    for (const file of ["publication-guard.mjs", "check-openapi-canary.mjs"]) {
      writeFileSync(join(control, "scripts", file), readFileSync(resolve("scripts", file)));
    }
    await execute("git", ["-C", control, "init", "-q"]);
    await execute("git", ["-C", control, "add", "."]);
    await execute("git", ["-C", control, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "immutable guard"]);
    const controlSha = (await execute("git", ["-C", control, "rev-parse", "HEAD"])).stdout.trim();
    const output = join(candidate.directory, "producer-output");
    const workflow = readFileSync(process.env.SENDMUX_TEST_WORKFLOW_FILE ?? resolve(".github/workflows/release-please.yml"), "utf8");
    const jobSource = workflow.split(new RegExp(`^  ${job}:`, "m"))[1].split(/^  [\w-]+:/m)[0];
    let producer;
    let reached = false;
    for (const step of jobSource.split(/^      - /m).slice(1)) {
      if (step.includes("uses: actions/checkout@")) {
        const ref = step.match(/^          ref: (.+)$/m)?.[1];
        const target = join(workspace, step.match(/^          path: (.+)$/m)?.[1] ?? ".");
        const source = ref === "${{ github.sha }}" ? control : candidate.repo;
        const sha = ref === "${{ github.sha }}" ? controlSha : producer?.sha;
        assert(sha, "candidate checkout requires successful producer resolution");
        mkdirSync(target, { recursive: true });
        // Pinned checkout de0fac2 git-directory-helper.ts24–29,108–114:
        // missing root .git removes ALL children even when clean:false.
        // Exercise those real filesystem effects and real Git checkouts, not a
        // source substring assertion or an absolute replacement of guard paths.
        if (!existsSync(join(target, ".git"))) {
          for (const file of readdirSync(target)) rmSync(join(target, file), { recursive: true, force: true });
          await execute("git", ["clone", "-q", "--no-checkout", source, target], { timeout: 10_000 });
        }
        await execute("git", ["-C", target, "checkout", "-q", "--detach", sha], { timeout: 10_000 });
        t.diagnostic(JSON.stringify({ checkout: target, sha }));
      } else if (/^name: Resolve (CLI|Management|MCP|Python) producer/.test(step)) {
        const command = step.match(/^        run: (.+)$/m)[1];
        await candidate.runBoundary(command, { REQUESTED_VERSION: "1.2.3", REQUESTED_TAG: tag, GITHUB_OUTPUT: output }, workspace);
        producer = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("=")));
        assert.equal(producer.sha, candidate.sha);
        assert.equal(producer.tag, tag);
      } else if (step.startsWith("name: Guard candidate before first publication")) {
        const command = step.match(/^        run: (.+)$/m)[1];
        const result = await candidate.runBoundary(command, { PRODUCER_TAG: producer.tag }, workspace);
        assert.match(result.stdout, /writer-reached/);
        assert.match(result.stdout, new RegExp(controlSha));
        assert.match(result.stdout, new RegExp(candidate.sha));
        assert.equal((await execute("git", ["-C", join(workspace, ".publication-guard"), "rev-parse", "HEAD"])).stdout.trim(), controlSha);
        assert.equal((await execute("git", ["-C", workspace, "rev-parse", "HEAD"])).stdout.trim(), candidate.sha);
        reached = true;
        break;
      }
    }
    assert(reached, "workflow must reach the real relative guard command");
  });
}
