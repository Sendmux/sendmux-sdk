#!/usr/bin/env node

import assert from "node:assert/strict";

const {
  SendmuxApiError,
  assertApiKeyKind,
  conditionalHeaders,
  configureGeneratedClient,
  createRetryingFetch,
  idempotencyHeaders,
  mapApiError,
  paginate,
  responseEtag,
} = await import("../packages/ts/core/dist/index.js");
const { createMailboxClient, mailboxGetIdentity } = await import("../packages/ts/mailbox/dist/index.js");
const { createSendingClient } = await import("../packages/ts/sending/dist/index.js");

assert.equal(assertApiKeyKind("smx_root_test", "root"), "root");
assert.equal(assertApiKeyKind("smx_mbx_test", "mailbox"), "mailbox");
assert.equal(assertApiKeyKind("smx_agent_test", "mailbox"), "mailbox");
assert.throws(() => assertApiKeyKind("smx_mbx_test", "root"), /Expected a root API key/);
assert.throws(() => assertApiKeyKind("smx_agent_test", "root"), /Expected a root API key/);
assert.deepEqual(idempotencyHeaders("idem_123"), { "Idempotency-Key": "idem_123" });
assert.deepEqual(conditionalHeaders({ etag: "\"v1\"", ifNoneMatch: "\"v0\"" }), {
  "If-Match": "\"v1\"",
  "If-None-Match": "\"v0\"",
});
assert.equal(responseEtag(new Response(null, { headers: { ETag: "\"v2\"" } })), "\"v2\"");

const pages = [
  { ok: true, data: [1, 2], meta: { request_id: "req_page_1" }, pagination: { has_more: true, next_cursor: "next" } },
  { ok: true, data: [3], meta: { request_id: "req_page_2" }, pagination: { has_more: false } },
];
const seenCursors = [];
const items = [];
for await (const item of paginate(async (cursor) => {
  seenCursors.push(cursor);
  return pages.shift();
})) {
  items.push(item);
}
assert.deepEqual(seenCursors, [undefined, "next"]);
assert.deepEqual(items, [1, 2, 3]);
await assert.rejects(
  async () => {
    for await (const _item of paginate(async () => ({
      ok: true,
      data: [],
      meta: { request_id: "req_bad_page" },
      pagination: { has_more: true },
    }))) {
      // exhausted by assert.rejects
    }
  },
  /has_more=true without next_cursor/,
);

let getAttempts = 0;
const retryingGet = createRetryingFetch(
  { baseDelayMs: 0, jitter: false, maxAttempts: 2, maxDelayMs: 0 },
  async () => {
    getAttempts += 1;
    return getAttempts === 1
      ? new Response("rate limited", { headers: { "Retry-After": "0" }, status: 429 })
      : new Response("ok", { status: 200 });
  },
);
assert.equal((await retryingGet("https://sdk.test/resource")).status, 200);
assert.equal(getAttempts, 2);

let zeroAttemptFetches = 0;
const zeroAttemptFetch = createRetryingFetch({ maxAttempts: 0 }, async () => {
  zeroAttemptFetches += 1;
  return new Response("ok", { status: 200 });
});
assert.equal((await zeroAttemptFetch("https://sdk.test/zero")).status, 200);
assert.equal(zeroAttemptFetches, 1);

let abortAttempts = 0;
const abortController = new AbortController();
abortController.abort();
const abortingFetch = createRetryingFetch({ baseDelayMs: 0, jitter: false, maxAttempts: 2, maxDelayMs: 0 }, async () => {
  abortAttempts += 1;
  throw new DOMException("The operation was aborted", "AbortError");
});
await assert.rejects(
  () => abortingFetch("https://sdk.test/abort", { signal: abortController.signal }),
  /aborted/i,
);
assert.equal(abortAttempts, 1);

let overrideMethod;
const overrideFetch = createRetryingFetch({}, async (request) => {
  overrideMethod = request.method;
  return new Response("ok", { status: 200 });
});
await overrideFetch(new Request("https://sdk.test/override", { method: "GET" }), { method: "POST" });
assert.equal(overrideMethod, "POST");

let postWithoutIdempotencyAttempts = 0;
const postWithoutIdempotency = createRetryingFetch(
  { baseDelayMs: 0, jitter: false, maxAttempts: 2, maxDelayMs: 0 },
  async () => {
    postWithoutIdempotencyAttempts += 1;
    return new Response("rate limited", { status: 429 });
  },
);
assert.equal((await postWithoutIdempotency("https://sdk.test/resource", { method: "POST" })).status, 429);
assert.equal(postWithoutIdempotencyAttempts, 1);

let postWithIdempotencyAttempts = 0;
const postWithIdempotency = createRetryingFetch(
  { baseDelayMs: 0, jitter: false, maxAttempts: 2, maxDelayMs: 0 },
  async () => {
    postWithIdempotencyAttempts += 1;
    return postWithIdempotencyAttempts === 1 ? new Response("retry", { status: 503 }) : new Response("ok", { status: 200 });
  },
);
assert.equal(
  (await postWithIdempotency("https://sdk.test/resource", {
    body: JSON.stringify({ ok: true }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": "idem_123" },
    method: "POST",
  })).status,
  200,
);
assert.equal(postWithIdempotencyAttempts, 2);

let binaryPostAttempts = 0;
const binaryPost = createRetryingFetch(
  { baseDelayMs: 0, jitter: false, maxAttempts: 2, maxDelayMs: 0 },
  async () => {
    binaryPostAttempts += 1;
    return new Response("retry", { status: 503 });
  },
);
assert.equal(
  (await binaryPost("https://sdk.test/upload", {
    body: new Blob(["large"]),
    headers: { "Content-Type": "application/octet-stream", "Idempotency-Key": "idem_123" },
    method: "POST",
  })).status,
  503,
);
assert.equal(binaryPostAttempts, 1);

let oversizedPostAttempts = 0;
const oversizedPost = createRetryingFetch(
  { baseDelayMs: 0, jitter: false, maxAttempts: 2, maxDelayMs: 0, maxReplayBodyBytes: 4 },
  async () => {
    oversizedPostAttempts += 1;
    return new Response("retry", { status: 503 });
  },
);
assert.equal(
  (await oversizedPost("https://sdk.test/resource", {
    body: JSON.stringify({ larger: true }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": "idem_oversized" },
    method: "POST",
  })).status,
  503,
);
assert.equal(oversizedPostAttempts, 1);

const apiError = mapApiError(
  {
    ok: false,
	    error: { code: "rate_limited", message: "Slow down", retryable: true },
    meta: { request_id: "req_123" },
  },
  new Response("rate limited", { status: 429 }),
);
assert.ok(apiError instanceof SendmuxApiError);
assert.equal(apiError.code, "rate_limited");
assert.equal(apiError.requestId, "req_123");
assert.equal(apiError.status, 429);
assert.equal(apiError.retryable, true);

const malformedApiError = mapApiError({ error: null });
assert.ok(malformedApiError instanceof SendmuxApiError);
assert.equal(malformedApiError.code, "request_failed");

const generatedClient = {
  configs: [],
	  interceptors: {
	    error: {
	      fns: [],
      use(fn) {
        this.fns.push(fn);
        return this.fns.length - 1;
	      },
	    },
	    request: {
	      fns: [],
	      use(fn) {
	        this.fns.push(fn);
	        return this.fns.length - 1;
	      },
	    },
	  },
  setConfig(config) {
    this.configs.push(config);
  },
};
configureGeneratedClient(generatedClient, { apiKey: "smx_root_test", baseUrl: "https://sdk.test" }, "root");
configureGeneratedClient(generatedClient, { apiKey: "smx_root_test" }, "root");
assert.equal(generatedClient.configs.length, 2);
assert.equal(generatedClient.configs[0].baseUrl, "https://sdk.test");
assert.equal("baseUrl" in generatedClient.configs[1], false);
assert.equal(generatedClient.interceptors.error.fns.length, 1);
assert.equal(generatedClient.interceptors.request.fns.length, 1);

const seenConfiguredRequests = [];
const sendingA = createSendingClient({
  apiKey: "smx_mbx_test_a",
  baseUrl: "https://sdk-a.test",
  fetch: async (request) => {
    seenConfiguredRequests.push({
      authorization: request.headers.get("Authorization"),
      url: request.url,
    });
    return new Response("{}", { headers: { "Content-Type": "application/json" }, status: 200 });
  },
});
const sendingB = createSendingClient({
  apiKey: "smx_mbx_test_b",
  baseUrl: "https://sdk-b.test",
  fetch: async (request) => {
    seenConfiguredRequests.push({
      authorization: request.headers.get("Authorization"),
      url: request.url,
    });
    return new Response("{}", { headers: { "Content-Type": "application/json" }, status: 200 });
  },
});
const sendingAgent = createSendingClient({
  apiKey: "smx_agent_test_c",
  baseUrl: "https://sdk-c.test",
  fetch: async (request) => {
    seenConfiguredRequests.push({
      authorization: request.headers.get("Authorization"),
      url: request.url,
    });
    return new Response("{}", { headers: { "Content-Type": "application/json" }, status: 200 });
  },
});

await sendingA.get({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/auth-check",
});
await sendingB.get({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/auth-check",
});
await sendingAgent.get({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/auth-check",
});
assert.deepEqual(seenConfiguredRequests, [
  { authorization: "Bearer smx_mbx_test_a", url: "https://sdk-a.test/auth-check" },
  { authorization: "Bearer smx_mbx_test_b", url: "https://sdk-b.test/auth-check" },
  { authorization: "Bearer smx_agent_test_c", url: "https://sdk-c.test/auth-check" },
]);

const seenMailboxRequests = [];
const mailboxClient = createMailboxClient({
  apiKey: "smx_agent_test_mailbox",
  baseUrl: "https://mailbox-sdk.test",
  fetch: async (request) => {
    seenMailboxRequests.push({
      authorization: request.headers.get("Authorization"),
      url: request.url,
    });
    return new Response(JSON.stringify({ ok: true, data: {}, meta: { request_id: "req_mailbox_identity" } }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  },
});
await mailboxGetIdentity({
  client: mailboxClient,
  query: { mailbox_id: "mbx_ts_target" },
});
assert.deepEqual(seenMailboxRequests, [
  {
    authorization: "Bearer smx_agent_test_mailbox",
    url: "https://mailbox-sdk.test/mailbox/identity?mailbox_id=mbx_ts_target",
  },
]);

console.log("TypeScript core helper tests passed.");
