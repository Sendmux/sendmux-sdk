import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { gitEnvironment } from "./publication-guard.mjs";

const executeFile = promisify(execFile);
const execute = (command, args, options = {}) => executeFile(command, args, { ...options, env: command === "git" ? gitEnvironment(options.env) : options.env });
const publisher = process.env.SENDMUX_TEST_PHP_PUBLISHER ?? resolve("scripts/publish-php-split.mjs");
const document = { openapi: "3.1.0", paths: {} };

async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-php-publish-"));
  const sdk = join(directory, "sdk");
  const split = join(directory, "split");
  const remote = join(directory, "sendmux-php-mailbox.git");
  const git = (repo, ...args) => execute("git", ["-C", repo, ...args]);
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
  const sdkSha = await commit(sdk);
  writeFileSync(join(split, "CHANGELOG.md"), files["CHANGELOG.md"].replace("## Unreleased", "## 3.0.0 (2026-09-17)"));
  if (options.wrongSource) writeFileSync(join(split, "src/Configuration.php"), "<?php // unrelated implementation\n");
  if (options.extra) writeFileSync(join(split, "unreviewed.md"), "unmatched file");
  if (options.evidence) { mkdirSync(join(split, "evidence")); writeFileSync(join(split, "evidence/release-20260917.md"), `Source ${sdkSha}\n`); }
  const splitSha = await commit(split);
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
      { env: { ...process.env, NODE_OPTIONS: `--import=${preload}` }, timeout: 10_000 });
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
  await execute("git", ["init", "--bare", "-q", second]);
  await candidate.git(candidate.split, "remote", "set-url", "--push", "origin", second);
  await candidate.run();
  assert.equal((await candidate.git(second, "rev-parse", "v3.0.0^{}")).stdout.trim(), candidate.splitSha);
});

test("a conflicting tag on the actual PHP push destination blocks a clean fetch origin", async (t) => {
  const candidate = await fixture(t);
  const second = join(candidate.directory, "second/sendmux-php-mailbox.git");
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
