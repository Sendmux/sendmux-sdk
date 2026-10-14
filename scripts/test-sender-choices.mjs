import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { mailbox } from "@sendmux/sdk";

const populated = {
  origin_address: "origin@example.com",
  from: { addresses: ["sender@example.com"], domains: ["example.com"] },
  reply_to: { addresses: ["reply@example.com"], domains: ["example.org"] },
};
const empty = { origin_address: "origin@example.com", from: { addresses: [], domains: [] }, reply_to: { addresses: [], domains: [] } };

test("SDK and CLI preserve permitted sender choices and selected delivery groups", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "s12-sender-cli-"));
  const requests = [];
  let data = populated;
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: new URL(request.url, "http://localhost") });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, meta: { request_id: "req_sender_choices_test" }, data }));
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
    for (const [label, choices, groups] of [["populated", populated, ["group-one", "group-two"]], ["empty", empty, []]]) {
      data = choices;
      await t.test(`public SDK preserves ${label} choices`, async () => {
        assert.equal(typeof mailbox.mailboxGetSenderChoices, "function");
        const client = mailbox.createMailboxClient({ apiKey: "smx_mbx_discovery_test", baseUrl });
        const result = await mailbox.mailboxGetSenderChoices({ client, query: groups.length ? { delivery_group_id: groups } : {} });
        assert.deepEqual(result.data.data, choices);
        const request = requests.pop();
        assert.equal(request.method, "GET");
        assert.equal(request.url.pathname, "/api/v1/mailbox/sender-choices");
        assert.deepEqual(request.url.searchParams.getAll("delivery_group_id"), groups);
      });
      await t.test(`public CLI preserves ${label} choices`, async () => {
        const args = ["packages/ts/cli/bin/run.js", "mailbox:get-sender-choices", "--json", ...groups.flatMap((group) => ["--query", `delivery_group_id=${group}`])];
        const result = await promisify(execFile)(process.execPath, args, {
          env: { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: home, SENDMUX_API_KEY: "smx_mbx_discovery_test", SENDMUX_BASE_URL: baseUrl },
          timeout: 10_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024,
        }).catch((error) => ({ error }));
        assert.equal(result.error, undefined, result.error?.message);
        assert.deepEqual(JSON.parse(result.stdout).data, choices);
        const request = requests.pop();
        assert.equal(request.method, "GET");
        assert.equal(request.url.pathname, "/api/v1/mailbox/sender-choices");
        assert.deepEqual(request.url.searchParams.getAll("delivery_group_id"), groups);
      });
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
