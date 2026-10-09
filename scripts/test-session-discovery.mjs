import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { mailbox } from "@sendmux/sdk";

const payload = JSON.parse(await readFile(new URL("./fixtures/mailbox-session-discovery.json", import.meta.url), "utf8"));

test("SDK and CLI mailbox session preserve the advertised 30 day horizon", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "s13-session-cli-"));
  const server = createServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/mailbox/session");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
    await t.test("public SDK response preserves the limit", async () => {
      const client = mailbox.createMailboxClient({ apiKey: "smx_mbx_discovery_test", baseUrl });
      const result = await mailbox.mailboxGetSession({ client });
      assert.equal(result.data.data.limits.draft_schedule_days_max, 30);
    });
    await t.test("public CLI JSON response preserves the limit", async () => {
      const { stdout } = await promisify(execFile)(process.execPath, ["packages/ts/cli/bin/run.js", "mailbox:get-session", "--json"], {
        env: { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: home, SENDMUX_API_KEY: "smx_mbx_discovery_test", SENDMUX_BASE_URL: baseUrl },
        timeout: 10_000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
      });
      assert.equal(JSON.parse(stdout).data?.limits?.draft_schedule_days_max, 30);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
