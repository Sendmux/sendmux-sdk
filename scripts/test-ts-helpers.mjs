#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const {
  createMailboxClient,
  mailboxGetIdentity,
  streamMailboxEvents,
} = await import("../packages/ts/mailbox/dist/index.js");
const {
  createMailboxAttachmentUploadFromFile,
  downloadMailboxAttachmentToBuffer,
  readMailboxTextAttachment,
  sendMailboxMessageWithFiles,
  uploadMailboxAttachmentFromFile,
  uploadMailboxAttachmentViaPresignedFile,
} = await import("../packages/ts/mailbox/dist/node.js");
const { createSendingClient } = await import("../packages/ts/sending/dist/index.js");
const {
  attachmentFromFile,
  sendEmailWithFiles,
  uploadAttachmentFromFile,
} = await import("../packages/ts/sending/dist/node.js");
const sdkNode = await import("../packages/ts/sdk/dist/node.js");

assert.equal(sdkNode.mailbox.uploadMailboxAttachmentFromFile, uploadMailboxAttachmentFromFile);
assert.equal(sdkNode.mailbox.downloadMailboxAttachmentToBuffer, downloadMailboxAttachmentToBuffer);
assert.equal(sdkNode.sending.attachmentFromFile, attachmentFromFile);
assert.equal(sdkNode.sending.uploadAttachmentFromFile, uploadAttachmentFromFile);

assert.equal(assertApiKeyKind("smx_root_test", "root"), "root");
assert.equal(assertApiKeyKind("smx_mbx_test", "mailbox"), "mailbox");
assert.equal(assertApiKeyKind("smx_agent_test", "mailbox"), "mailbox");
assert.doesNotThrow(() => assertApiKeyKind("smx_mbx_test", "sending"));
assert.doesNotThrow(() => assertApiKeyKind("smx_agent_test", "sending"));
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

const seenMailboxStreamRequests = [];
const mailboxStreamClient = createMailboxClient({
  apiKey: "smx_agent_test_mailbox_stream",
  baseUrl: "https://mailbox-stream-sdk.test",
  fetch: async (request) => {
    seenMailboxStreamRequests.push({
      authorization: request.headers.get("Authorization"),
      url: request.url,
    });
    return new Response(
      [
        "event: message.received",
        'data: {"event_type":"message.received","mailbox_id":"mbx_stream","message_id":"msg_stream","message_id_kind":"provider","occurred_at":"2026-07-02T00:00:00.000Z","recipients":["agent@example.com"],"sender":"sender@example.com","team_public_id":"team_stream","message":null,"is_spam":false}',
        "",
        "",
      ].join("\n"),
      {
        headers: { "Content-Type": "text/event-stream" },
        status: 200,
      },
    );
  },
});
const mailboxEvents = [];
for await (const event of streamMailboxEvents({
  client: mailboxStreamClient,
  query: { close_after: 30, event_types: "message.received" },
})) {
  mailboxEvents.push(event);
}
assert.equal(mailboxEvents.length, 1);
assert.equal(mailboxEvents[0].event_type, "message.received");
assert.equal(mailboxEvents[0].message_id, "msg_stream");
assert.equal(seenMailboxStreamRequests.length, 1);
assert.equal(seenMailboxStreamRequests[0].authorization, "Bearer smx_agent_test_mailbox_stream");
const mailboxStreamUrl = new URL(seenMailboxStreamRequests[0].url);
assert.equal(mailboxStreamUrl.origin, "https://mailbox-stream-sdk.test");
assert.equal(mailboxStreamUrl.pathname, "/mailbox/events");
assert.equal(mailboxStreamUrl.searchParams.get("close_after"), "30");
assert.equal(mailboxStreamUrl.searchParams.get("event_types"), "message.received");

const tempDir = await mkdtemp(join(tmpdir(), "sendmux-ts-helpers-"));
try {
  const reportPath = join(tempDir, "report.txt");
  const reportBytes = Buffer.from("typed helper attachment\n", "utf8");
  await writeFile(reportPath, reportBytes);

  const seenMailboxFileRequests = [];
  const mailboxFileClient = createMailboxClient({
    apiKey: "smx_agent_test_mailbox_file",
    baseUrl: "https://mailbox-file-sdk.test",
    fetch: async (request) => {
      const body = Buffer.from(await request.arrayBuffer());
      seenMailboxFileRequests.push({
        authorization: request.headers.get("Authorization"),
        body,
        contentType: request.headers.get("Content-Type"),
        method: request.method,
        url: request.url,
      });
      const url = new URL(request.url);
      if (url.pathname === "/mailbox/attachment-uploads") {
        const parsed = JSON.parse(body.toString("utf8"));
        return new Response(JSON.stringify({
          ok: true,
          data: {
            expires_at: "2026-07-02T00:10:00.000Z",
            headers: {
              "Content-Length": String(parsed.size_bytes),
              "Content-Type": parsed.content_type,
            },
            max_size_bytes: 7500000,
            method: "PUT",
            upload_id: "upl_ts_helper",
            upload_url: "https://upload-sdk.test/mailbox/attachment-uploads/upl_ts_helper?upload_token=tok",
          },
          meta: { request_id: "req_ts_intent" },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (url.pathname === "/mailbox/attachments:upload") {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            blob_id: "blob_ts_report",
            content_type: request.headers.get("Content-Type"),
            filename: url.searchParams.get("filename"),
            size_bytes: body.byteLength,
          },
          meta: { request_id: "req_ts_upload" },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (url.pathname === "/mailbox/messages/send") {
        return new Response(JSON.stringify({
          ok: true,
          data: { message_id: "msg_ts_file", status: "queued" },
          meta: { request_id: "req_ts_send" },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      if (url.pathname === "/mailbox/messages/msg_ts_attachment/attachments/att_ts_markdown") {
        return new Response("typed helper recipe\n", {
          headers: { "Content-Type": "text/markdown" },
          status: 200,
        });
      }
      throw new Error(`Unexpected mailbox helper request: ${request.method} ${request.url}`);
    },
  });

  const directUpload = await uploadMailboxAttachmentFromFile({
    client: mailboxFileClient,
    filePath: reportPath,
    mailboxId: "mbx_ts_file",
  });
  assert.equal(directUpload.data.blob_id, "blob_ts_report");
  assert.equal(seenMailboxFileRequests.at(-1).contentType, "text/plain");
  assert.equal(seenMailboxFileRequests.at(-1).url, "https://mailbox-file-sdk.test/mailbox/attachments:upload?filename=report.txt&mailbox_id=mbx_ts_file");
  assert.deepEqual(seenMailboxFileRequests.at(-1).body, reportBytes);

  const sentWithFiles = await sendMailboxMessageWithFiles({
    client: mailboxFileClient,
    files: [reportPath],
    query: { mailbox_id: "mbx_ts_file" },
    body: {
      subject: "TS file",
      text_body: "Attached",
      to: [{ email: "agent@example.com", name: null }],
    },
  });
  assert.equal(sentWithFiles.data.message_id, "msg_ts_file");
  const sendRequest = seenMailboxFileRequests.at(-1);
  assert.equal(sendRequest.url, "https://mailbox-file-sdk.test/mailbox/messages/send?mailbox_id=mbx_ts_file");
  assert.deepEqual(JSON.parse(sendRequest.body.toString("utf8")).attachments, [
    {
      blob_id: "blob_ts_report",
      content_type: "text/plain",
      filename: "report.txt",
    },
  ]);

  const downloaded = await downloadMailboxAttachmentToBuffer({
    client: mailboxFileClient,
    attachmentId: "att_ts_markdown",
    mailboxId: "mbx_ts_file",
    messageId: "msg_ts_attachment",
  });
  assert.deepEqual(downloaded, Buffer.from("typed helper recipe\n", "utf8"));
  const downloadRequest = seenMailboxFileRequests.at(-1);
  assert.equal(
    downloadRequest.url,
    "https://mailbox-file-sdk.test/mailbox/messages/msg_ts_attachment/attachments/att_ts_markdown?mailbox_id=mbx_ts_file",
  );

  const textAttachment = await readMailboxTextAttachment({
    client: mailboxFileClient,
    attachmentId: "att_ts_markdown",
    messageId: "msg_ts_attachment",
  });
  assert.equal(textAttachment, "typed helper recipe\n");

  const intent = await createMailboxAttachmentUploadFromFile({
    client: mailboxFileClient,
    filePath: reportPath,
    mailboxId: "mbx_ts_file",
  });
  assert.equal(intent.data.upload_id, "upl_ts_helper");
  const intentRequest = seenMailboxFileRequests.at(-1);
  assert.equal(intentRequest.url, "https://mailbox-file-sdk.test/mailbox/attachment-uploads?mailbox_id=mbx_ts_file");
  assert.deepEqual(JSON.parse(intentRequest.body.toString("utf8")), {
    content_type: "text/plain",
    filename: "report.txt",
    size_bytes: reportBytes.byteLength,
  });

  const seenPresignedPuts = [];
  const presignedResult = await uploadMailboxAttachmentViaPresignedFile({
    client: mailboxFileClient,
    filePath: reportPath,
    mailboxId: "mbx_ts_file",
    fetch: async (url, init) => {
      seenPresignedPuts.push({
        body: Buffer.from(await new Response(init.body).arrayBuffer()),
        headers: init.headers,
        method: init.method,
        url: String(url),
      });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          blob_id: "blob_ts_presigned",
          content_type: "text/plain",
          filename: "report.txt",
          size_bytes: reportBytes.byteLength,
        },
        meta: { request_id: "req_ts_put" },
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    },
  });
  assert.equal(presignedResult.data.blob_id, "blob_ts_presigned");
  assert.deepEqual(seenPresignedPuts, [
    {
      body: reportBytes,
      headers: {
        "Content-Length": String(reportBytes.byteLength),
        "Content-Type": "text/plain",
      },
      method: "PUT",
      url: "https://upload-sdk.test/mailbox/attachment-uploads/upl_ts_helper?upload_token=tok",
    },
  ]);

  await assert.rejects(
    () => uploadMailboxAttachmentViaPresignedFile({
      client: mailboxFileClient,
      filePath: reportPath,
      mailboxId: "mbx_ts_file",
      fetch: async () => new Response("", { status: 503 }),
    }),
    /HTTP 503/,
  );
  await assert.rejects(
    () => uploadMailboxAttachmentViaPresignedFile({
      client: mailboxFileClient,
      filePath: reportPath,
      mailboxId: "mbx_ts_file",
      fetch: async () => new Response(null, { status: 200 }),
    }),
    /did not return attachment metadata/,
  );

  const sendingAttachment = await attachmentFromFile(reportPath);
  assert.deepEqual(sendingAttachment, {
    content: reportBytes.toString("base64"),
    encoding: "base64",
    filename: "report.txt",
    type: "text/plain",
  });

  const seenSendingFileRequests = [];
  const sendingFileClient = createSendingClient({
    apiKey: "smx_mbx_test_sending_file",
    baseUrl: "https://sending-file-sdk.test",
    fetch: async (request) => {
      const url = new URL(request.url);
      const body = Buffer.from(await request.arrayBuffer());
      seenSendingFileRequests.push({
        authorization: request.headers.get("Authorization"),
        body,
        contentType: request.headers.get("Content-Type"),
        method: request.method,
        url: request.url,
      });
      if (url.pathname === "/emails/attachments") {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            attachment_id: "att_1234567890abcdefghijklmn",
            content_type: request.headers.get("Content-Type") ?? "application/octet-stream",
            expires_at: "2026-07-07T10:00:00.000Z",
            filename: url.searchParams.get("filename") ?? "attachment.bin",
            size_bytes: body.byteLength,
          },
          meta: { request_id: "req_ts_sending_upload" },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: { message_id: "msg_ts_sending_file", status: "queued" },
        meta: { request_id: "req_ts_sending_file" },
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    },
  });
  const sendingUpload = await uploadAttachmentFromFile({
    client: sendingFileClient,
    filePath: reportPath,
  });
  assert.equal(sendingUpload.data.attachment_id, "att_1234567890abcdefghijklmn");

  const sendingWithFiles = await sendEmailWithFiles({
    client: sendingFileClient,
    files: [reportPath],
    body: {
      from: { email: "from@example.com" },
      html_body: "<p>Attached</p>",
      subject: "TS file",
      to: { email: "agent@example.com" },
    },
  });
  assert.equal(sendingWithFiles.data.message_id, "msg_ts_sending_file");
  assert.equal(seenSendingFileRequests[0].authorization, "Bearer smx_mbx_test_sending_file");
  assert.equal(new URL(seenSendingFileRequests[0].url).pathname, "/emails/attachments");
  assert.equal(new URL(seenSendingFileRequests[0].url).searchParams.get("filename"), "report.txt");
  assert.equal(seenSendingFileRequests[0].contentType, "text/plain");
  assert.deepEqual(seenSendingFileRequests[0].body, reportBytes);
  assert.equal(new URL(seenSendingFileRequests[1].url).pathname, "/emails/attachments");
  assert.equal(new URL(seenSendingFileRequests[2].url).pathname, "/emails/send");
  assert.deepEqual(JSON.parse(seenSendingFileRequests[2].body.toString("utf8")).attachments, [
    { attachment_id: "att_1234567890abcdefghijklmn" },
  ]);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("TypeScript core helper tests passed.");
