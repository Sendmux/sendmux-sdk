import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const ruby = existsSync(`${process.env.HOME}/.rbenv/bin/rbenv`) || existsSync("/opt/homebrew/bin/rbenv")
  ? ["rbenv", ["exec", "ruby", "scripts/live-e2e-ruby.rb"]]
  : ["ruby", ["scripts/live-e2e-ruby.rb"]];
const adapters = {
  python: [".tmp/python-venv/bin/python", ["scripts/live-e2e-python.py"]],
  go: ["go", ["-C", "go", "run", "./livee2e"]],
  php: ["php", ["scripts/live-e2e-php.php"]],
  ruby,
};
const surfaces = ["management", "mailbox", "sending"];
const operations = surfaces.map((surface) => ({
  surface, operationId: `${surface}GetConnection`, responseKind: "json", risk: "read",
  request: { path: {}, query: {}, headers: {} },
}));

for (const [adapter, [command, args]] of Object.entries(adapters)) {
  test(`${adapter} exposes all three authenticated connection operations`, async () => {
    const requests = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push({
        method: request.method, path: request.url, authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          team: { id: "team_test", name: "Test team" },
          credential: { id: "key_test", type: "api_key", name: null },
          label: "Test team", permissions: [], mailboxes: [],
        },
        meta: { request_id: "req_test" },
      }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
      const { stdout } = await exec(command, args, {
        timeout: 60_000,
        env: {
          ...process.env,
          SENDMUX_LIVE_E2E_LANGUAGE_PLAN: JSON.stringify({ operations }),
          SENDMUX_LIVE_E2E_ROOT_API_KEY: "smx_root_test",
          SENDMUX_LIVE_E2E_MAILBOX_API_KEY: "smx_mbx_test",
          SENDMUX_LIVE_E2E_APP_BASE_URL: baseUrl,
          SENDMUX_LIVE_E2E_SENDING_BASE_URL: baseUrl,
        },
      });
      assert.deepEqual(JSON.parse(stdout).results, operations.map(({ operationId }) => ({
        adapter, operationId, status: "passed",
      })));
      assert.deepEqual(requests, surfaces.map((surface) => ({
        method: "GET", path: surface === "mailbox" ? "/api/v1/mailbox/connection" : "/api/v1/me",
        authorization: `Bearer ${surface === "management" ? "smx_root_test" : "smx_mbx_test"}`,
        body: "",
      })));
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      assert.equal(server.listening, false);
    }
  });
}
