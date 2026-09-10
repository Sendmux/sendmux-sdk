import assert from "node:assert/strict";
import { test } from "node:test";

import { sendmux } from "@sendmux/ai-sdk";

await test("all AI SDK tools resolve the current OAuth token before each request", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (request) => {
    requests.push({
      path: new URL(request.url).pathname,
      authorization: request.headers.get("authorization"),
    });
    return Response.json({
      ok: true,
      data:
        request.method === "GET"
          ? []
          : { message_id: "eml_aaaaaaaaaaaaaaaaaaaaaaaa", status: "queued" },
      meta: { request_id: "req_aaaaaaaaaaaaaaaaaaaaaaaa" },
      ...(request.method === "GET" ? { pagination: { has_more: false } } : {}),
    });
  });
  let token = "oauth-first";
  const tools = sendmux({
    accessToken: async () => token,
    defaultFrom: "agent@example.com",
  });
  const options = { toolCallId: "test", messages: [] };
  await tools.list_messages.execute({ limit: 1 }, options);
  token = "oauth-second";
  await tools.send_email.execute(
    { to: "reader@example.com", subject: "Test", text: "Test" },
    options,
  );
  token = "oauth-third";
  await tools.reply.execute(
    { to: "reader@example.com", subject: "Test", text: "Test" },
    options,
  );
  assert.deepEqual(requests, [
    { path: "/api/v1/mailbox/messages", authorization: "Bearer oauth-first" },
    { path: "/api/v1/emails/send", authorization: "Bearer oauth-second" },
    {
      path: "/api/v1/mailbox/messages/send",
      authorization: "Bearer oauth-third",
    },
  ]);
});

await test("AI SDK tools accept a static OAuth token", async (t) => {
  const headers = [];
  t.mock.method(globalThis, "fetch", async (request) => {
    headers.push(request.headers.get("authorization"));
    return Response.json({
      ok: true,
      data: [],
      pagination: { has_more: false },
      meta: { request_id: "req_aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
  });
  const tools = sendmux({ accessToken: "oauth-static" });
  await tools.list_messages.execute(
    { limit: 1 },
    { toolCallId: "test", messages: [] },
  );
  assert.deepEqual(headers, ["Bearer oauth-static"]);
});

await test("AI SDK tools reject ambiguous API-key and OAuth configuration", () => {
  assert.throws(
    () => sendmux({ apiKey: "smx_mbx_test", accessToken: "oauth-static" }),
    /exactly one of apiKey or accessToken/,
  );
});
