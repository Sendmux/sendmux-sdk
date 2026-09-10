import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const token = "opaque.oauth-token";
const connection = {
  ok: true,
  data: {
    team: { id: "team_cli", name: "CLI fixture" },
    credential: { id: "grant_cli", type: "oauth", name: null },
    label: "CLI fixture", permissions: [], mailboxes: [],
  },
  meta: { request_id: "req_cli_connection" },
};

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "sendmux-cli-oauth-"));
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(connection));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
    assert.equal(server.listening, false);
    await assert.rejects(access(directory), { code: "ENOENT" });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { directory, requests, baseUrl: `http://127.0.0.1:${server.address().port}/api/v1` };
}

async function cli(t, fixture, args, env = {}) {
  const child = spawn(process.execPath, ["packages/ts/cli/bin/run.js", ...args], {
    env: {
      ...process.env,
      HOME: fixture.directory,
      XDG_CONFIG_HOME: join(fixture.directory, ".config"),
      SENDMUX_API_KEY: "",
      SENDMUX_PROFILE: "",
      SENDMUX_ACCESS_TOKEN: token,
      SENDMUX_BASE_URL: fixture.baseUrl,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const closed = once(child, "close");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
  });
  const [code] = await closed;
  return { code, stdout, stderr };
}

for (const surface of ["sending", "mailbox", "management"]) {
  test(`${surface}: headless OAuth token works without exposing it`, async (t) => {
    const state = await fixture(t);
    const result = await cli(t, state, [`${surface}:get-connection`, "--json"]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), connection);
    assert.deepEqual(state.requests, [{
      url: surface === "mailbox" ? "/api/v1/mailbox/connection" : "/api/v1/me",
      authorization: `Bearer ${token}`,
    }]);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(token));
  });
}

test("conflicting API key and OAuth token fail before HTTP", async (t) => {
  const state = await fixture(t);
  const result = await cli(t, state, ["sending:get-connection", "--json"], { SENDMUX_API_KEY: "smx_mbx_test" });
  assert.notEqual(result.code, 0);
  assert.match(`${result.stdout}${result.stderr}`, /exactly one/i);
  assert.deepEqual(state.requests, []);
});

test("malformed headless token fails before HTTP without leaking it", async (t) => {
  const state = await fixture(t);
  const badToken = "Bearer token-must-not-appear";
  const result = await cli(t, state, ["sending:get-connection", "--json"], { SENDMUX_ACCESS_TOKEN: badToken });
  assert.notEqual(result.code, 0);
  assert.match(`${result.stdout}${result.stderr}`, /access token/i);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(badToken));
  assert.deepEqual(state.requests, []);
});
