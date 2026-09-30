import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  isRetryableMcpPublisherError,
  waitForMcpRegistryVersion,
} from "./mcp-registry-version.mjs";

const name = "io.github.Sendmux/sendmux-mcp";
const version = "1.6.0";

test("actual npm ownership step retries transport failures within its publication bounds", async () => {
  const workflow = readFileSync(process.env.SENDMUX_TEST_WORKFLOW_FILE ?? resolve(".github/workflows/release-please.yml"), "utf8");
  const job = workflow.split(/^  publish-mcp-registry:/m)[1]?.split(/^  [\w-]+:/m)[0];
  const step = job?.split("      - name: Wait for npm MCP ownership marker\n")[1]?.split(/^      - /m)[0];
  const source = step?.match(/          node --input-type=module <<'JS'\n([\s\S]+?)\n          JS/)?.[1]?.replace(/^          /gm, "");
  assert.equal(typeof source, "string", "npm publication must retain an executable ownership wait");
  const metadata = { name: "sendmux-mcp", version, mcpName: name };
  const scenarios = [
    ["connection reset", [new Error("connection reset"), 200], 2, 1, null],
    ["timeout", [new Error("timeout"), 200], 2, 1, null],
    ["exhaustion", [new Error("connection reset")], 30, 29, "connection reset"],
    ["permanent HTTP", [403], 1, 0, "npm returned HTTP 403"],
    ["wrong identity", ["wrong-identity"], 1, 0, "npm MCP package identity, version or ownership marker differs"],
    ["transient HTTP", [404, 429, 503, 200], 4, 3, null],
  ];
  const actual = [];
  for (const [scenario, responses] of scenarios) {
    let attempts = 0;
    let waits = 0;
    let failure = null;
    let exit = null;
    const finished = Symbol("process exit");
    try {
      await runInNewContext(`(async () => { ${source} })()`, {
        process: { env: { MCP_NPM_PACKAGE_VERSION: version, MCP_SERVER_NAME: name }, exit: (code) => { exit = code; throw finished; } },
        fetch: async () => {
          const response = responses[Math.min(attempts++, responses.length - 1)];
          if (response instanceof Error) throw response;
          const status = response === "wrong-identity" ? 200 : response;
          return { ok: status === 200, status, json: async () => response === "wrong-identity" ? { ...metadata, name: "wrong" } : metadata };
        },
        setTimeout: (done, delay) => { assert.equal(delay, 10_000); waits += 1; done(); },
        AbortSignal: { timeout: (delay) => { assert.equal(delay, 20_000); return {}; } },
      });
    } catch (error) {
      if (error !== finished) failure = error.message;
    }
    actual.push({ scenario, attempts, waits, failure, exit });
  }
  assert.deepEqual(actual, scenarios.map(([scenario, , attempts, waits, failure]) => ({ scenario, attempts, waits, failure, exit: failure ? null : 0 })));
});

test("waits for the exact MCP Registry version detail endpoint", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (requests.length === 1) {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ server: { name, version } }));
  });
  t.after(() => server.close());

  const registryBaseUrl = await listen(server);
  const result = await waitForMcpRegistryVersion({
    attempts: 2,
    delayMs: 0,
    name,
    registryBaseUrl,
    version,
  });

  assert.equal(result.server.name, name);
  assert.equal(result.server.version, version);
  assert.deepEqual(requests, [
    "/v0.1/servers/io.github.Sendmux%2Fsendmux-mcp/versions/1.6.0",
    "/v0.1/servers/io.github.Sendmux%2Fsendmux-mcp/versions/1.6.0",
  ]);
});

test("rejects mismatched metadata from the exact version endpoint", async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ server: { name, version: "1.5.1" } }));
  });
  t.after(() => server.close());

  const registryBaseUrl = await listen(server);
  await assert.rejects(
    waitForMcpRegistryVersion({ attempts: 1, name, registryBaseUrl, version }),
    /returned io\.github\.Sendmux\/sendmux-mcp 1\.5\.1, expected io\.github\.Sendmux\/sendmux-mcp 1\.6\.0/,
  );
});

test("preflight retries transient errors but treats an exact 404 as unpublished", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(requests.length === 1 ? 503 : 404).end();
  });
  t.after(() => server.close());

  const registryBaseUrl = await listen(server);
  const result = await waitForMcpRegistryVersion({
    attempts: 2,
    delayMs: 0,
    name,
    registryBaseUrl,
    retryNotFound: false,
    version,
  });

  assert.equal(result, null);
  assert.equal(requests.length, 2);
});

test("retries PyPI version propagation failures from the MCP publisher", () => {
  const output =
    "registry validation failed for package 0 (sendmux-mcp): PyPI package 'sendmux-mcp' exists, but version '1.6.1' was not found (status: 404). A newly published release can take a moment to appear on PyPI.";

  assert.equal(isRetryableMcpPublisherError(output), true);
});

test("does not retry unrelated MCP publisher failures", () => {
  const output =
    'server returned status 400: {"detail":"Failed to publish server","errors":[{"message":"namespace is not owned by this repository"}]}';

  assert.equal(isRetryableMcpPublisherError(output), false);
});

test("an existing metadata version must retain both exact package identities and the remote", async (t) => {
  const expectedServer = {
    name, version,
    packages: [
      { registryType: "npm", identifier: "sendmux-mcp", version: "1.0.0", transport: { type: "stdio" } },
      { registryType: "pypi", identifier: "sendmux-mcp", version: "2.1.3", transport: { type: "stdio" } },
    ],
    remotes: [{ type: "streamable-http", url: "https://mcp.sendmux.ai/mcp" }],
  };
  let actual = structuredClone(expectedServer);
  actual.packages.reverse();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ server: actual }));
  });
  t.after(() => server.close());
  const registryBaseUrl = await listen(server);
  const check = () => waitForMcpRegistryVersion({ attempts: 1, name, registryBaseUrl, version, expectedServer });
  await check();
  actual.packages.find((entry) => entry.registryType === "pypi").version = "2.1.2";
  await assert.rejects(check(), /metadata differs/);
  actual = structuredClone(expectedServer);
  actual.packages = actual.packages.filter((entry) => entry.registryType !== "npm");
  await assert.rejects(check(), /metadata differs/);
  actual = structuredClone(expectedServer);
  actual.remotes[0].url = "https://wrong.invalid/mcp";
  await assert.rejects(check(), /metadata differs/);
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}
