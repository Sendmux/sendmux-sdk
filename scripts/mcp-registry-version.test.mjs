import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { waitForMcpRegistryVersion } from "./mcp-registry-version.mjs";

const name = "io.github.Sendmux/sendmux-mcp";
const version = "1.6.0";

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

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}
