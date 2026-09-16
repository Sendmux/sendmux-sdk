import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checker = process.env.SENDMUX_TEST_CANARY ?? join(root, "scripts/check-openapi-canary.mjs");

test("closes an open drift issue after the specs converge", async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "sendmux-openapi-canary-"));
  t.after(() => rmSync(fixtureDir, { force: true, recursive: true }));
  const document = { openapi: "3.1.0", info: { title: "Fixture", version: "1.0.0" }, paths: {} };
  for (const filename of ["openapi-app.json", "openapi-sending.json"]) {
    writeFileSync(join(fixtureDir, filename), `${JSON.stringify(document)}\n`);
  }

  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url, body: await readBody(request) });
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([{ number: 135, title: "OpenAPI live-vs-snapshot drift" }]));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ number: 135, state: "closed" }));
  });
  t.after(() => new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  }));
  const githubApiUrl = await listen(server);

  const { stdout } = await execFileAsync(process.execPath, [
    checker,
    "--docs-dir", fixtureDir,
    "--live-dir", fixtureDir,
    "--issue",
  ], {
    env: {
      ...process.env,
      GITHUB_API_URL: githubApiUrl,
      GITHUB_REPOSITORY: "Sendmux/sendmux-sdk",
      GITHUB_TOKEN: "test-token",
    },
  });

  assert.match(stdout, /Closed resolved spec drift issue #135/);
  assert.deepEqual(requests.map(({ method, url }) => ({ method, url })), [
    { method: "GET", url: "/repos/Sendmux/sendmux-sdk/issues?state=open&labels=spec-drift&per_page=100" },
    { method: "PATCH", url: "/repos/Sendmux/sendmux-sdk/issues/135" },
  ]);
  assert.deepEqual(JSON.parse(requests[1].body), { state: "closed", state_reason: "completed" });
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await new Promise((resolveListen, rejectListen) => {
    server.once("listening", resolveListen);
    server.once("error", rejectListen);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

// The preload redirects only the two fixed public URLs to a real owned HTTP
// server. Production CLI flags never expose an endpoint or timeout override.
async function networkFixture(t, handler) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-publication-contract-"));
  const document = { openapi: "3.1.0", paths: {} };
  for (const name of ["app", "sending"]) {
    writeFileSync(join(directory, `openapi-${name}.json`), JSON.stringify(document));
  }
  const server = createServer(handler);
  const endpoint = await listen(server);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    assert.equal(server.listening, false);
    rmSync(directory, { recursive: true, force: true });
  });
  const preload = join(directory, "transport.mjs");
  writeFileSync(preload, `
    const transport = globalThis.fetch;
    globalThis.fetch = (url, options) => {
      if (!['https://app.sendmux.ai/api/v1/openapi.json', 'https://smtp.sendmux.ai/api/v1/openapi.json'].includes(String(url))) throw new Error('Unexpected network URL');
      return transport(${JSON.stringify(endpoint)} + '/' + new URL(url).hostname, options);
    };
  `);
  return {
    directory,
    run: () => execFileAsync(process.execPath, ["--import", preload,
      checker, "--docs-dir", directory],
    { timeout: 19_000, maxBuffer: 1024 * 1024 }),
  };
}

test("rejects redirects instead of certifying a redirected contract", async (t) => {
  const fixture = await networkFixture(t, (request, response) => {
    if (request.url === "/redirected") response.end('{"openapi":"3.1.0","paths":{}}');
    else { response.writeHead(302, { location: "/redirected" }); response.end(); }
  });
  await assert.rejects(fixture.run(), (error) => error.code === 1 && /302|redirect/i.test(error.stderr));
});

test("rejects a decoded body over 8 MiB even when it is valid matching JSON", async (t) => {
  const document = JSON.stringify({ openapi: "3.1.0", paths: {}, description: "x".repeat(8 * 1024 * 1024) });
  const fixture = await networkFixture(t, (_request, response) => response.end(document));
  for (const name of ["app", "sending"]) writeFileSync(join(fixture.directory, `openapi-${name}.json`), document);
  await assert.rejects(fixture.run(), (error) => error.code === 1 && /8 MiB|8388608|too large/i.test(error.stderr));
});

for (const phase of ["headers", "body"]) {
  test(`bounds a never-ended ${phase} within the 15-second request budget`, { timeout: 21_000 }, async (t) => {
    const fixture = await networkFixture(t, (_request, response) => {
      if (phase === "body") { response.writeHead(200); response.write('{"openapi":"3.1.0",'); }
    });
    const started = Date.now();
    await assert.rejects(fixture.run(), (error) => error.code === 1 && /timeout|abort|deadline/i.test(error.stderr));
    assert.ok(Date.now() - started < 18_000, "the guard, not the test runner, must terminate the request");
  });
}

for (const [name, status, body, pattern] of [
  ["non-2xx matching contract", 503, '{"openapi":"3.1.0","paths":{}}', /HTTP 503/],
  ["invalid JSON", 200, '{"openapi":', /JSON|Unexpected/],
  ["non-3.1 OpenAPI", 200, '{"openapi":"3.0.3","paths":{}}', /must be OpenAPI 3.1.0/],
  ["null OpenAPI", 200, "null", /must be OpenAPI 3.1.0/],
]) {
  test(`rejects ${name} instead of reaching a publisher`, async (t) => {
    const fixture = await networkFixture(t, (_request, response) => { response.writeHead(status); response.end(body); });
    let writes = 0;
    await assert.rejects(fixture.run().then(() => writes++), (error) => error.code === 1 && pattern.test(error.stderr));
    assert.equal(writes, 0);
  });
}
