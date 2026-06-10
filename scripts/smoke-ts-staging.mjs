#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const {
  SendmuxApiError,
  assertApiKeyKind,
  idempotencyHeaders,
  paginate,
  responseEtag,
} = await import("../packages/ts/core/dist/index.js");
const {
  createMailboxClient,
  mailboxGetSession,
  mailboxListMessages,
} = await import("../packages/ts/mailbox/dist/index.js");
const {
  createManagementClient,
  managementListDomains,
} = await import("../packages/ts/management/dist/index.js");
const {
  createSendingClient,
  sendingSendEmail,
} = await import("../packages/ts/sending/dist/index.js");

const rootApiKey = requireEnv("SENDMUX_STAGING_ROOT_API_KEY");
const mailboxApiKey = requireEnv("SENDMUX_STAGING_MAILBOX_API_KEY");
const appBaseUrl = process.env.SENDMUX_STAGING_APP_BASE_URL;
const smtpBaseUrl = process.env.SENDMUX_STAGING_SMTP_BASE_URL;

assert.equal(assertApiKeyKind(rootApiKey, "root"), "root");
assert.equal(assertApiKeyKind(mailboxApiKey, "mailbox"), "mailbox");

const managementFetch = trackingFetch("management");
const mailboxFetch = trackingFetch("mailbox");
const sendingFetch = trackingFetch("sending");

const managementClient = createManagementClient({
  apiKey: rootApiKey,
  baseUrl: appBaseUrl,
  fetch: managementFetch.fetch,
  retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
});
const mailboxClient = createMailboxClient({
  apiKey: mailboxApiKey,
  baseUrl: appBaseUrl,
  fetch: mailboxFetch.fetch,
  retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
});
const sendingClient = createSendingClient({
  apiKey: mailboxApiKey,
  baseUrl: smtpBaseUrl,
  fetch: sendingFetch.fetch,
  retry: { baseDelayMs: 250, maxAttempts: 2, maxDelayMs: 1_000 },
});

const domains = await managementListDomains({
  client: managementClient,
  query: { limit: 1 },
});
assertEnvelope(domains.data, "managementListDomains");
assert.ok(domains.response.status >= 200 && domains.response.status < 300);

const session = await mailboxGetSession({
  client: mailboxClient,
  headers: { "If-None-Match": "\"sendmux-sdk-smoke-never\"" },
});
assertEnvelope(session.data, "mailboxGetSession");
responseEtag(session.response);

let messageCount = 0;
for await (const _message of paginate(async (cursor) => {
  const page = await mailboxListMessages({
    client: mailboxClient,
    query: { cursor, limit: 1 },
  });
  assertEnvelope(page.data, "mailboxListMessages");
  return page.data;
})) {
  messageCount += 1;
  if (messageCount >= 2) {
    break;
  }
}

if (process.env.SENDMUX_STAGING_SEND === "1") {
  await smokeSend(sendingClient);
}

managementFetch.assertSawBearer("root");
mailboxFetch.assertSawBearer("mailbox");
if (process.env.SENDMUX_STAGING_SEND === "1") {
  sendingFetch.assertSawBearer("mailbox");
}

console.log("TypeScript staging smoke passed.");
console.log(JSON.stringify({
  appBaseUrl: appBaseUrl ?? "default",
  smtpBaseUrl: smtpBaseUrl ?? "default",
  mailboxMessagesObserved: messageCount,
  requests: {
    mailbox: mailboxFetch.summary(),
    management: managementFetch.summary(),
    sending: sendingFetch.summary(),
  },
}, null, 2));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function assertEnvelope(value, operation) {
  assert.equal(value?.ok, true, `${operation} did not return ok=true`);
  assert.equal(typeof value?.meta?.request_id, "string", `${operation} did not return meta.request_id`);
}

async function smokeSend(client) {
  const from = requireEnv("SENDMUX_STAGING_SEND_FROM");
  const to = requireEnv("SENDMUX_STAGING_SEND_TO");
  const idempotencyKey = `sdk-smoke-${randomUUID()}`;
  const response = await sendingSendEmail({
    body: {
      from: { email: from },
      html: "<p>Sendmux TypeScript SDK staging smoke.</p>",
      subject: "Sendmux TypeScript SDK staging smoke",
      text: "Sendmux TypeScript SDK staging smoke.",
      to: [{ email: to }],
    },
    client,
    headers: idempotencyHeaders(idempotencyKey),
  });

  assertEnvelope(response.data, "sendingSendEmail");
  assert.equal(response.data.data.status, "queued");
}

function trackingFetch(label) {
  const requests = [];
  return {
    async fetch(input, init) {
      const request = new Request(input, init);
      const authorization = request.headers.get("Authorization") ?? "";
      requests.push({
        authorizationKind: authorization.startsWith("Bearer smx_root_")
          ? "root"
          : authorization.startsWith("Bearer smx_mbx_")
            ? "mailbox"
            : "missing",
        label,
        method: request.method,
        url: new URL(request.url).pathname,
      });

      return fetch(request);
    },
    assertSawBearer(kind) {
      assert.ok(
        requests.some((request) => request.authorizationKind === kind),
        `${label} did not send a ${kind} bearer token`,
      );
    },
    summary() {
      return requests.map(({ authorizationKind, method, url }) => ({ authorizationKind, method, url }));
    },
  };
}

process.on("unhandledRejection", (error) => {
  if (error instanceof SendmuxApiError) {
    console.error(`${error.status ?? "unknown"} ${error.code}: ${error.message}`);
  }
  throw error;
});
