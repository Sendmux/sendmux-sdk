import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { gitEnvironment } from "./publication-guard.mjs";

const executeFile = promisify(execFile);
const execute = (command, args, options = {}) => executeFile(command, args, { ...options, env: command === "git" ? gitEnvironment(options.env) : options.env });
const publisher = process.env.SENDMUX_TEST_PHP_PUBLISHER ?? resolve("scripts/publish-php-split.mjs");
const document = { openapi: "3.1.0", paths: { "/mailbox/messages": { get: { operationId: "mailboxList", responses: { 200: { description: "Listed" } } } } }, components: { schemas: { Provider: { required: ["variables", "delivery_group"] } } } };
const skillsControl = process.env.SENDMUX_TEST_SKILLS_ROOT ?? process.env.SENDMUX_SKILLS_ROOT ?? resolve("../sendmux-skills");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function seedFreshnessSources(repo) {
  const write = (file, value) => { mkdirSync(resolve(repo, file, ".."), { recursive: true }); writeFileSync(join(repo, file), value); };
  write("packages/python/mcp/sendmux_mcp/server.py", "fixture-server");
  write("packages/python/mcp/sendmux_mcp/mcp-contract.json", JSON.stringify({ tools: { by_surface: { mailbox: [{ name: "mailbox_list", input_schema: { type: "object" }, description: "List messages" }] } }, provenance: { sources: { "server.py": hash("fixture-server") } } }));
  write("packages/ts/cli/src/generated/operations.ts", 'export const operations = {\n  mailboxList: {"command":"mailbox:list","operationId":"mailboxList","surface":"mailbox"}\n} as const satisfies Record<string, OperationDefinition>;\n');
  write("packages/ts/cli/src/base-command.ts", 'export const authFlags = { "api-key": "Sendmux API key" };\n');
}

async function freshnessFixture(directory, sdk, revision) {
  const root = join(directory, `skills-${revision}`);
  const write = (file, value) => { mkdirSync(resolve(root, file, ".."), { recursive: true }); writeFileSync(join(root, file), typeof value === "string" ? value : `${JSON.stringify(value)}\n`); };
  const git = async (...args) => {
    assert.ok(resolve(root).startsWith(`${directory}/`), "freshness Git fixture escaped mkdtemp");
    return (await execute("git", ["-C", root, ...args])).stdout.trim();
  };
  const commit = async () => { await git("add", "."); await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "reviewed fixture"); return git("rev-parse", "HEAD"); };
  write("scripts/skill-compatibility.mjs", readFileSync(join(skillsControl, "scripts/skill-compatibility.mjs"), "utf8"));
  const names = ["agent-email-inbox", "email-for-ai-agents", "sendmux-attachments", "sendmux-cli", "sendmux-email-for-agents", "sendmux-getting-started", "sendmux-mailbox-agent", "sendmux-management", "sendmux-mcp-setup", "sendmux-send-email", "sendmux-token-efficient-usage"];
  const dependencies = Object.fromEntries(names.map((name) => [name, { app: ["mailboxList"], sending: ["mailboxList"], mcp: ["mailbox_list"], cli: ["mailbox:list"] }]));
  const releaseInputs = {};
  for (const producer of ["app", "sending"]) {
    const openapi = `contracts/${producer}.json`;
    const exportReceipt = `contracts/${producer}-export.json`;
    write(openapi, document);
    const sourceRevision = producer === "app" ? "a".repeat(40) : "b".repeat(40);
    write(exportReceipt, { schemaVersion: 1, producer, revision: sourceRevision, sourceTree: "c".repeat(40), lockfileSha256: "d".repeat(64), openapiSha256: hash(readFileSync(join(root, openapi))), exporter: producer === "app" ? "scripts/emit-openapi-spec.ts" : "app/http-api/v1/schemas/registry.js" });
    releaseInputs[producer] = { revision: sourceRevision, openapi, exportReceipt };
  }
  const policy = { schemaVersion: 1, dependencies, releaseInputs, reviews: [] };
  for (const name of names) write(`skills/${name}/SKILL.md`, `Use ${name} for authorised email.\n`);
  write("skill-compatibility.json", policy);
  await git("init", "-q");
  const published = await commit();
  const descriptor = { schemaVersion: 1, sources: { ...Object.fromEntries(Object.entries(releaseInputs).map(([key, source]) => [key, { ...source, openapi: join(root, source.openapi), exportReceipt: join(root, source.exportReceipt) }])), sdk: { root: sdk, revision } }, skills: { root, publishedRevision: published, proposedRevision: published } };
  const candidate = join(directory, `inspect-${revision}.json`);
  writeFileSync(candidate, JSON.stringify(descriptor));
  const checker = join(root, "scripts/skill-compatibility.mjs");
  const inspected = JSON.parse((await execute(process.execPath, [checker, "--inspect-candidate", candidate])).stdout);
  for (const item of inspected.skills.proposed.entries) {
    const record = `reviews/${item.name}.json`;
    const evidence = `skills/${item.name}/SKILL.md`;
    write(record, { schemaVersion: 1, kind: "compatibility", skill: item.name, skillDigest: item.skillDigest, contractDigest: item.contractDigest, sourceRevisions: inspected.sourceRevisions, reviewer: "Fixture reviewer", rationale: "Reviewed this exact fixture contract and its instruction bytes.", evidence: [{ path: evidence, sha256: hash(readFileSync(join(root, evidence))) }] });
    policy.reviews.push({ skill: item.name, skillDigest: item.skillDigest, contractDigest: item.contractDigest, record, sha256: hash(readFileSync(join(root, record))) });
  }
  releaseInputs.publishedRevision = published;
  write("skill-compatibility.json", policy);
  return { SENDMUX_SKILLS_ROOT: root, SENDMUX_SKILLS_REVISION: await commit(), SENDMUX_SKILL_RECEIPT_DIR: join(directory, `receipts-${revision}`) };
}

async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-php-publish-"));
  const sdk = join(directory, "sdk");
  const split = join(directory, "split");
  const remote = join(directory, "sendmux-php-mailbox.git");
  const git = (repo, ...args) => {
    assert.ok(resolve(repo).startsWith(`${directory}/`), "PHP Git fixture escaped mkdtemp");
    return execute("git", ["-C", repo, ...args]);
  };
  const commit = async (repo) => {
    await git(repo, "add", ".");
    await git(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
    return (await git(repo, "rev-parse", "HEAD")).stdout.trim();
  };
  for (const repo of [sdk, split]) {
    mkdirSync(repo); await git(repo, "init", "-q");
    await git(repo, "config", "user.name", "Fixture");
    await git(repo, "config", "user.email", "fixture@example.invalid");
  }
  mkdirSync(join(sdk, "packages/php/mailbox"), { recursive: true });
  mkdirSync(join(sdk, "packages/python/mcp/sendmux_mcp/openapi"), { recursive: true });
  const files = { "composer.json": JSON.stringify({ name: "sendmux/mailbox", type: "library" }), "CHANGELOG.md": "# Changelog\n\n## Unreleased\n\nFix\n", "src/Configuration.php": `<?php // SDK Package Version: ${options.wrongVersion ? "3.1.0" : "3.0.0"}\n` };
  for (const [name, content] of Object.entries(files)) {
    for (const base of [join(sdk, "packages/php/mailbox"), split]) { mkdirSync(join(base, name, ".."), { recursive: true }); writeFileSync(join(base, name), content); }
  }
  for (const name of ["app", "sending"]) writeFileSync(join(sdk, `packages/python/mcp/sendmux_mcp/openapi/openapi-${name}.json`), JSON.stringify(document));
  seedFreshnessSources(sdk);
  const sdkSha = await commit(sdk);
  const skillEnvironment = await freshnessFixture(directory, sdk, sdkSha);
  writeFileSync(join(split, "CHANGELOG.md"), files["CHANGELOG.md"].replace("## Unreleased", "## 3.0.0 (2026-09-17)"));
  if (options.wrongSource) writeFileSync(join(split, "src/Configuration.php"), "<?php // unrelated implementation\n");
  if (options.extra) writeFileSync(join(split, "unreviewed.md"), "unmatched file");
  if (options.evidence) { mkdirSync(join(split, "evidence")); writeFileSync(join(split, "evidence/release-20260917.md"), `Source ${sdkSha}\n`); }
  const splitSha = await commit(split);
  assert.ok(resolve(remote).startsWith(`${directory}/`), "PHP remote fixture escaped mkdtemp");
  await execute("git", ["init", "--bare", "-q", remote]);
  await git(split, "remote", "add", "origin", remote);
  const server = createServer((_request, response) => response.end(JSON.stringify(options.mismatch ? { ...document, description: "live drift" } : document)));
  server.listen(0, "127.0.0.1"); await new Promise((done) => server.once("listening", done));
  const port = server.address().port;
  t.diagnostic(JSON.stringify({ directory, port, owner: process.pid }));
  const preload = join(directory, "transport.mjs");
  writeFileSync(preload, `const transport=fetch;globalThis.fetch=(url, options)=>{if(!String(url).endsWith('/api/v1/openapi.json'))throw Error('Unexpected URL');return transport('http://127.0.0.1:${server.address().port}/',options)};`);
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); rmSync(directory, { recursive: true, force: true }); assert.equal(existsSync(directory), false); t.diagnostic(JSON.stringify({ removed: directory, serverClosed: port })); });
  const run = (extra = []) => {
    const child = execute(process.execPath, [publisher, "--sdk-repo", sdk, "--sdk-sha", sdkSha, "--split-repo", split, "--split-sha", splitSha,
    "--package", "mailbox", "--version", "3.0.0", ...(options.evidence ? ["--evidence", "evidence/release-20260917.md"] : []), ...extra],
      { env: { ...process.env, ...skillEnvironment, NODE_OPTIONS: `--import=${preload}` }, timeout: 10_000 });
    t.diagnostic(JSON.stringify({ child: child.child.pid }));
    return child.finally(() => assert.throws(() => process.kill(child.child.pid, 0), { code: "ESRCH" }));
  };
  return { run, git, sdk, split, remote, splitSha, sdkSha, directory };
}

for (const [name, options, pattern] of [
  ["live mismatch leaves local and remote refs absent", { mismatch: true }, /differs/],
  ["wrong SDK-to-split mapping leaves refs absent", { wrongSource: true }, /split.*differ|version/i],
  ["unmatched Markdown is not ignored", { extra: true }, /file set|unmatched/i],
  ["source-identical native metadata still must match the intended version", { wrongVersion: true }, /native version mismatch/i],
]) {
  test(name, async (t) => {
    const candidate = await fixture(t, options);
    await assert.rejects(candidate.run(), (error) => error.code === 1 && pattern.test(error.stderr));
    assert.equal((await candidate.git(candidate.split, "tag", "--list")).stdout, "");
    assert.equal((await candidate.git(candidate.remote, "tag", "--list")).stdout, "");
  });
}

test("equal proven split creates only annotated exact-target tag and pushes it", async (t) => {
  const candidate = await fixture(t, { evidence: true });
  await candidate.run();
  assert.equal((await candidate.git(candidate.split, "cat-file", "-t", "refs/tags/v3.0.0")).stdout.trim(), "tag");
  assert.equal((await candidate.git(candidate.remote, "rev-parse", "v3.0.0^{}")).stdout.trim(), candidate.splitSha);
  assert.equal((await candidate.git(candidate.remote, "tag", "--list")).stdout.trim(), "v3.0.0");
  assert.match((await candidate.git(candidate.remote, "cat-file", "-p", "refs/tags/v3.0.0")).stdout, new RegExp(candidate.sdkSha));
});

test("dirty split is rejected before any tag", async (t) => {
  const candidate = await fixture(t);
  writeFileSync(join(candidate.split, "composer.json"), "dirty");
  await assert.rejects(candidate.run(), (error) => /dirty/i.test(error.stderr));
  assert.equal((await candidate.git(candidate.split, "tag", "--list")).stdout, "");
});

test("retry with existing local tag still requires fresh live equality", async (t) => {
  const candidate = await fixture(t, { mismatch: true });
  await candidate.git(candidate.split, "tag", "-a", "v3.0.0", candidate.splitSha, "-m", "existing local tag");
  await assert.rejects(candidate.run(), (error) => /differs/.test(error.stderr));
  assert.equal((await candidate.git(candidate.remote, "tag", "--list")).stdout, "");
});

test("conflicting annotated local tag cannot be repointed or pushed", async (t) => {
  const candidate = await fixture(t);
  const tree = (await candidate.git(candidate.split, "rev-parse", "HEAD^{tree}")).stdout.trim();
  const other = (await candidate.git(candidate.split, "commit-tree", tree, "-m", "other target")).stdout.trim();
  await candidate.git(candidate.split, "tag", "-a", "v3.0.0", other, "-m", "conflict");
  await assert.rejects(candidate.run(), (error) => /local tag conflicts/i.test(error.stderr));
  assert.equal((await candidate.git(candidate.split, "rev-parse", "v3.0.0^{}")).stdout.trim(), other);
  assert.equal((await candidate.git(candidate.remote, "tag", "--list")).stdout, "");
});

test("multiple PHP push destinations are rejected before creating any release ref", async (t) => {
  const candidate = await fixture(t);
  const second = join(candidate.directory, "unapproved-destination.git");
  assert.ok(resolve(second).startsWith(`${candidate.directory}/`), "PHP remote fixture escaped mkdtemp");
  await execute("git", ["init", "--bare", "-q", second]);
  await candidate.git(candidate.split, "remote", "set-url", "--add", "--push", "origin", candidate.remote);
  await candidate.git(candidate.split, "remote", "set-url", "--add", "--push", "origin", second);
  await assert.rejects(candidate.run(), (error) => /exactly one push destination/i.test(error.stderr));
  for (const repo of [candidate.split, candidate.remote, second]) assert.equal((await candidate.git(repo, "tag", "--list")).stdout, "");
});

test("a tagged fetch URL cannot skip publication to the sole validated push destination", async (t) => {
  const candidate = await fixture(t);
  await candidate.run();
  const second = join(candidate.directory, "second/sendmux-php-mailbox.git");
  assert.ok(resolve(second).startsWith(`${candidate.directory}/`), "PHP remote fixture escaped mkdtemp");
  await execute("git", ["init", "--bare", "-q", second]);
  await candidate.git(candidate.split, "remote", "set-url", "--push", "origin", second);
  await candidate.run();
  assert.equal((await candidate.git(second, "rev-parse", "v3.0.0^{}")).stdout.trim(), candidate.splitSha);
});

test("a conflicting tag on the actual PHP push destination blocks a clean fetch origin", async (t) => {
  const candidate = await fixture(t);
  const second = join(candidate.directory, "second/sendmux-php-mailbox.git");
  assert.ok(resolve(second).startsWith(`${candidate.directory}/`), "PHP remote fixture escaped mkdtemp");
  await execute("git", ["init", "--bare", "-q", second]);
  await candidate.git(candidate.split, "remote", "set-url", "--push", "origin", second);
  const tree = (await candidate.git(candidate.split, "rev-parse", "HEAD^{tree}")).stdout.trim();
  const other = (await candidate.git(candidate.split, "commit-tree", tree, "-m", "conflicting remote target")).stdout.trim();
  await candidate.git(candidate.split, "tag", "-a", "v3.0.0", other, "-m", "conflict");
  await candidate.git(candidate.split, "push", second, "refs/tags/v3.0.0:refs/tags/v3.0.0");
  await candidate.git(candidate.split, "tag", "-d", "v3.0.0");
  await assert.rejects(candidate.run(), (error) => /remote tag conflicts/i.test(error.stderr));
  assert.equal((await candidate.git(candidate.split, "tag", "--list")).stdout, "");
  assert.equal((await candidate.git(candidate.remote, "tag", "--list")).stdout, "");
  assert.equal((await candidate.git(second, "rev-parse", "v3.0.0^{}")).stdout.trim(), other);
});
