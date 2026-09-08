import assert from "node:assert/strict";
import test from "node:test";
import * as sendmux from "@sendmux/sdk";

for (const [surface, apiKey, endpoint, host] of [
  ["management", "smx_root_test", "/me", "app.sendmux.ai"],
  ["mailbox", "smx_mbx_test", "/mailbox/connection", "app.sendmux.ai"],
  ["sending", "smx_mbx_test", "/me", "smtp.sendmux.ai"],
]) {
  test(`${surface} connection uses the authenticated GET and returns metadata`, async () => {
    const sdk = sendmux[surface];
    const response = {
      ok: true,
      data: {
        team: { id: "team_test", name: "Fixture team" },
        credential: { id: "key_test", type: "api_key", name: null },
        label: "Fixture team",
        permissions: [],
        mailboxes: [],
      },
      meta: { request_id: "req_test" },
    };
    const requests = [];
    const factory = sdk[`create${surface[0].toUpperCase()}${surface.slice(1)}Client`];
    const client = factory({
      apiKey,
      fetch: async (request) => {
        requests.push(request);
        return Response.json(response);
      },
    });

    const result = await sdk[`${surface}GetConnection`]({ client });

    assert.deepEqual(result.data, response);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `https://${host}/api/v1${endpoint}`);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].headers.get("Authorization"), `Bearer ${apiKey}`);
    assert.equal(requests[0].body, null);
  });
}
