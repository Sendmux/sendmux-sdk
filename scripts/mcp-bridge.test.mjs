import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(process.env.SENDMUX_MCP_TEST_PACKAGE ?? join(root, "packages/ts/mcp"));
const artifacts = join(root, ".claude/artifacts/install-surface");
mkdirSync(artifacts, { recursive: true });

async function fixture(t, { unavailable = false } = {}) {
  const manifestPath = join(packageRoot, "package.json");
  assert.ok(existsSync(manifestPath), "npm MCP bridge package is missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const remotePackage = createRequire(realpathSync(manifestPath)).resolve("mcp-remote/package.json");
  const directory = mkdtempSync(join(artifacts, "npm-bridge-test-"));
  const certificate = join(directory, "cert.pem");
  const key = join(directory, "key.pem");
  const pids = join(directory, "pids");
  const cert = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=mcp.sendmux.ai", "-addext", "subjectAltName=DNS:mcp.sendmux.ai", "-keyout", key, "-out", certificate], { encoding: "utf8" });
  assert.equal(cert.status, 0, cert.stderr);
  const requests = [];
  const tools = [{ name: "remote_contract_probe", description: "Fixture operation", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } }];
  const server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, async (request, response) => {
    assert.equal(request.headers.host, "mcp.sendmux.ai");
    if (request.url.includes("/.well-known/")) {
      response.writeHead(404).end();
      return;
    }
    assert.equal(request.url, "/mcp");
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks));
    requests.push(message);
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "remote-fixture", version: "1.0.0" } }
      : message.method === "tools/list"
        ? { tools }
        : { content: [{ type: "text", text: "remote result" }], structuredContent: { nested: { preserved: true } } };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const port = server.address().port;
  if (unavailable) await new Promise((resolve) => server.close(resolve));
  const child = spawn(process.execPath, [join(packageRoot, manifest.bin["sendmux-mcp"])], {
    cwd: directory,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: `--import=${pathToFileURL(join(root, "scripts/fixtures/mcp-bridge-tls.mjs")).href}`,
      MCP_REMOTE_CONFIG_DIR: join(directory, "auth"),
      SENDMUX_MCP_TEST_REMOTE_PACKAGE: remotePackage,
      SENDMUX_MCP_TEST_CERT: certificate,
      SENDMUX_MCP_TEST_PORT: String(port),
      SENDMUX_MCP_TEST_PIDS: pids,
    },
  });
  appendFileSync(join(artifacts, "npm-test-pids"), `${child.pid}\n`);
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const messages = [];
  const output = createInterface({ input: child.stdout });
  output.on("line", (line) => messages.push(JSON.parse(line)));
  const ended = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 15_000);
  t.after(async () => {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await ended;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    output.close();
    for (const pid of new Set(readFileSync(pids, "utf8").trim().split("\n").map(Number))) {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, `CLI process ${pid} leaked`);
    }
    rmSync(directory, { recursive: true, force: true });
    assert.equal(existsSync(directory), false);
  });
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 10_000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline && child.exitCode === null && child.signalCode === null, `CLI did not answer: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = async (message) => {
    send(message);
    await waitFor(() => messages.some((item) => item.id === message.id));
    return messages.find((item) => item.id === message.id);
  };
  return { child, ended, messages, requests, request, send, tools, waitFor, stderr: () => stderr };
}

async function initialize(client) {
  const response = await client.request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bridge-test", version: "1.0.0" } } });
  assert.equal(response.result.serverInfo.name, "remote-fixture");
  client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
}

test("CLI forwards the remote tool catalogue, results and cancellation over verified TLS", { timeout: 20_000 }, async (t) => {
  const client = await fixture(t);
  await initialize(client);
  const listed = await client.request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed, { jsonrpc: "2.0", id: 2, result: { tools: client.tools } });
  const called = await client.request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "remote_contract_probe", arguments: {} } });
  assert.deepEqual(called.result, { content: [{ type: "text", text: "remote result" }], structuredContent: { nested: { preserved: true } } });
  const cancellation = { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 4, reason: "Client cancelled" } };
  client.send(cancellation);
  await client.waitFor(() => client.requests.some((item) => item.method === cancellation.method));
  assert.deepEqual(client.requests.find((item) => item.method === cancellation.method), cancellation);
  client.child.stdin.end();
  assert.deepEqual(await client.ended, { code: 0, signal: null });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`CLI ${signal} stops its remote child`, { timeout: 20_000 }, async (t) => {
    const client = await fixture(t);
    await initialize(client);
    client.child.kill(signal);
    assert.deepEqual(await client.ended, signal === "SIGINT" ? { code: 0, signal: null } : { code: null, signal });
  });
}

test("CLI returns the remote process failure status and keeps diagnostics on stderr", { timeout: 20_000 }, async (t) => {
  const client = await fixture(t, { unavailable: true });
  assert.deepEqual(await client.ended, { code: 1, signal: null });
  assert.deepEqual(client.messages, []);
  assert.match(client.stderr(), /ECONNREFUSED/);
});
