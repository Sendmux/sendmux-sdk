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
    join(root, "scripts", "check-openapi-canary.mjs"),
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
