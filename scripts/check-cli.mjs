#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnCommandSync } from "./windows-command-shims.mjs";

const cliPath = "packages/ts/cli/bin/run.js";
const cliManifestPath = "packages/ts/cli/package.json";
const operationsPath = "packages/ts/cli/src/generated/operations.ts";
const operationRunnerPath = "packages/ts/cli/src/operation-runner.ts";
const commandsDir = "packages/ts/cli/src/commands";
const mailboxKey = "smx_mbx_testkey1234567890";
const agentKey = "smx_agent_testkey1234567890";
const durableAgentKey = "smx_agent_durable_read_testkey1234567890";
const delegatedAgentSendKey = "smx_agent_delegated_send_testkey1234567890";
const rootKey = "smx_root_testkey1234567890";
const envelope = {
  ok: true,
  data: {
    messages: [],
  },
  meta: {
    request_id: "req_cli_test",
  },
  pagination: {
    has_more: false,
  },
};
const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Sending API fixture",
    version: "1.0.0",
  },
  paths: {},
};

ensureCliBuilt();

const serverState = { readinessAttempts: 0, registrations: 0, requests: [], tokenExchanges: 0 };
const tempHome = mkdtempSync(join(tmpdir(), "sendmux-cli-"));
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  serverState.requests.push({
    body,
    headers: request.headers,
    method: request.method,
    url: request.url ?? "",
  });
  if ((request.url ?? "").startsWith("/mailbox/events")) {
    response.setHeader("Content-Type", "text/event-stream");
    response.write(
      `event: message.received\ndata: ${JSON.stringify({
        event_type: "message.received",
        mailbox_id: "mbx_cli_stream",
        message_id: "msg_cli_stream_1",
        message_id_kind: "provider",
        occurred_at: "2026-07-02T00:00:00.000Z",
        recipients: ["agent@example.com"],
        sender: "sender@example.com",
        team_public_id: "team_cli_stream",
      })}\n\n`,
    );
    response.write(
      `event: message.received\ndata: ${JSON.stringify({
        event_type: "message.received",
        mailbox_id: "mbx_cli_stream",
        message_id: "msg_cli_stream_2",
        message_id_kind: "provider",
        occurred_at: "2026-07-02T00:00:01.000Z",
        recipients: ["agent@example.com"],
        sender: "sender@example.com",
        team_public_id: "team_cli_stream",
      })}\n\n`,
    );
    response.end();
    return;
  }

  const requestUrl = request.url ?? "";
  if (request.method === "POST" && requestUrl === "/agent-auth/agent/identity") {
    serverState.registrations += 1;
    const configPath = join(tempHome, ".config", "sendmux", "config.json");
    const savedConfig = JSON.parse(readFileSync(configPath, "utf8"));
    const registeringProfile = savedConfig.profiles["durable-agent"];
    const parsed = JSON.parse(body.toString("utf8"));
    if (registeringProfile?.type !== "agent" || registeringProfile?.state !== "registering") {
      response.writeHead(500);
      response.end(JSON.stringify({ error: "registration state was not saved before network" }));
      return;
    }
    if (registeringProfile.idempotencyKey !== request.headers["idempotency-key"] || parsed.idempotency_key !== registeringProfile.idempotencyKey) {
      response.writeHead(500);
      response.end(JSON.stringify({ error: "saved idempotency key did not match request" }));
      return;
    }
    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      access_token: durableAgentKey,
      mailbox: { email: "durable-agent@myagent.mx", status: "provisioning" },
      registration_id: "areg_cli_durable",
      registration_type: "anonymous",
      scope: "mailbox.read email.receive",
      token_type: "Bearer",
    }));
    return;
  }

  if (request.method === "GET" && requestUrl === "/api/v1/mailbox/me") {
    serverState.readinessAttempts += 1;
    if (request.headers.authorization !== `Bearer ${durableAgentKey}`) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "wrong durable token" }));
      return;
    }
    if (serverState.readinessAttempts === 1) {
      response.writeHead(503, { "Content-Type": "application/json", "Retry-After": "0" });
      response.end(JSON.stringify({ error: "temporarily_unavailable", retry_after: 0 }));
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, data: { email: "durable-agent@myagent.mx" }, meta: {} }));
    return;
  }

  if (request.method === "POST" && requestUrl === "/agent-auth/agent/identity/invite") {
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ invite_id: "ainv_cli_owner", status: "pending" }));
    return;
  }

  if (request.method === "POST" && requestUrl === "/agent-auth/oauth2/token") {
    serverState.tokenExchanges += 1;
    const form = new URLSearchParams(body.toString("utf8"));
    if (
      form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:token-exchange" ||
      form.get("subject_token") !== durableAgentKey ||
      form.get("subject_token_type") !== "urn:ietf:params:oauth:token-type:access_token" ||
      form.get("resource") !== "https://smtp.sendmux.ai/api/v1" ||
      form.get("scope") !== "email.send"
    ) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "invalid exchange" }));
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      access_token: delegatedAgentSendKey,
      expires_in: 3600,
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      scope: "email.send",
      token_type: "Bearer",
    }));
    return;
  }

  if (request.method === "POST" && requestUrl.startsWith("/mailbox/attachments:upload")) {
    const url = new URL(requestUrl, "http://127.0.0.1");
    const filename = url.searchParams.get("filename") ?? "attachment.bin";
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      data: {
        blob_id: `blob_cli_${filename}`,
        content_type: request.headers["content-type"] ?? "application/octet-stream",
        filename,
        size_bytes: body.byteLength,
      },
      meta: { request_id: "req_cli_upload" },
    }));
    return;
  }

  if (request.method === "POST" && requestUrl.startsWith("/emails/attachments")) {
    const url = new URL(requestUrl, "http://127.0.0.1");
    const filename = url.searchParams.get("filename") ?? "attachment.bin";
    response.writeHead(201, {
      "Content-Type": "application/json",
      Location: `/emails/attachments/att_cli_${filename}`,
    });
    response.end(JSON.stringify({
      ok: true,
      data: {
        attachment_id: "att_1234567890abcdefghijklmn",
        content_type: request.headers["content-type"] ?? "application/octet-stream",
        expires_at: "2026-07-07T10:00:00.000Z",
        filename,
        size_bytes: body.byteLength,
      },
      meta: { request_id: "req_cli_sending_upload" },
    }));
    return;
  }

  if (request.method === "POST" && requestUrl.startsWith("/mailbox/attachment-uploads")) {
    const parsed = JSON.parse(body.toString("utf8"));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP port");
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      data: {
        expires_at: "2026-07-02T00:10:00.000Z",
        headers: {
          "Content-Length": String(parsed.size_bytes),
          "Content-Type": parsed.content_type,
        },
        max_size_bytes: 7_500_000,
        method: "PUT",
        upload_id: "upl_cli_test",
        upload_url: `http://127.0.0.1:${address.port}/mailbox/attachment-uploads/upl_cli_test?upload_token=tok_cli`,
      },
      meta: { request_id: "req_cli_upload_intent" },
    }));
    return;
  }

  if (request.method === "PUT" && requestUrl.startsWith("/mailbox/attachment-uploads/upl_cli_test")) {
    if (request.headers.authorization) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: { code: "unexpected_auth", message: "Unexpected auth" } }));
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      data: {
        blob_id: "blob_cli_presigned",
        content_type: request.headers["content-type"] ?? "application/octet-stream",
        filename: "report.txt",
        size_bytes: body.byteLength,
      },
      meta: { request_id: "req_cli_presigned_put" },
    }));
    return;
  }

  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(requestUrl.startsWith("/openapi.json") ? openApiDocument : envelope));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  assertCliPackageMetadata();
  assertCliCommandCoverage();
  assertBinaryOperationRunnerGuard();
  await assertCliArrayParameterSupport();

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const jsonResult = await runCli([
    "mailbox:messages:list",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "limit=1",
    "--json",
  ]);

  if (jsonResult.status !== 0) {
    throw new Error(`mailbox:messages:list --json failed:\n${jsonResult.stderr}`);
  }

  const parsed = JSON.parse(jsonResult.stdout);
  assertDeepEqual(parsed, envelope, "--json must emit the raw API response envelope");

  const openApiResult = await runCli([
    "sending:get-open-api-spec",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--json",
  ]);

  assertCliSuccess(openApiResult, "sending:get-open-api-spec with mailbox key");
  assertDeepEqual(
    JSON.parse(openApiResult.stdout),
    openApiDocument,
    "--json must emit non-envelope API response payloads without the SDK response wrapper",
  );

  const identityResult = await runCli([
    "mailbox:get-identity",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "mailbox_id=mbx_cli_target",
    "--json",
  ]);

  assertCliSuccess(identityResult, "mailbox:get-identity with mailbox_id query");
  const identityRequest = latestRequest();
  if (!identityRequest.url.startsWith("/mailbox/identity")) {
    throw new Error(`mailbox:get-identity used the wrong path: ${identityRequest.url}`);
  }
  assertSearchParam(identityRequest.url, "mailbox_id", "mbx_cli_target");

  const countResult = await runCli([
    "mailbox:count-messages",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "min_size_bytes=10",
    "--query",
    "has_attachment=true",
    "--json",
  ]);

  if (countResult.status !== 0) {
    throw new Error(`mailbox:count-messages with typed query filters failed:\n${countResult.stderr}`);
  }

  const countRequest = latestRequest();
  assertSearchParam(countRequest.url, "min_size_bytes", "10");
  assertSearchParam(countRequest.url, "has_attachment", "true");

  const agentMailboxResult = await runCli([
    "mailbox:messages:list",
    "--api-key",
    agentKey,
    "--base-url",
    baseUrl,
    "--json",
  ]);

  assertCliSuccess(agentMailboxResult, "mailbox:messages:list with agent token");

  if (latestRequest().headers.authorization !== `Bearer ${agentKey}`) {
    throw new Error("Agent token was not passed through for mailbox command");
  }

  const requestsBeforeInvalidQuery = serverState.requests.length;
  const invalidQueryResult = await runCli([
    "mailbox:count-messages",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "min_size_bytes=abc",
  ]);

  if (invalidQueryResult.status === 0) {
    throw new Error("mailbox:count-messages accepted a non-integer min_size_bytes query parameter");
  }

  if (!invalidQueryResult.stderr.includes('query parameter "min_size_bytes" must be an integer')) {
    throw new Error(`Expected integer validation error, got:\n${invalidQueryResult.stderr}`);
  }

  if (serverState.requests.length !== requestsBeforeInvalidQuery) {
    throw new Error("Invalid query parameter made a network request before rejecting");
  }

  const unknownQueryResult = await runCli([
    "mailbox:count-messages",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "unknown_filter=true",
  ]);

  if (unknownQueryResult.status === 0) {
    throw new Error("mailbox:count-messages accepted an unknown query parameter");
  }

  if (!unknownQueryResult.stderr.includes('Unknown query parameter "unknown_filter"')) {
    throw new Error(`Expected unknown query validation error, got:\n${unknownQueryResult.stderr}`);
  }

  if (serverState.requests.length !== requestsBeforeInvalidQuery) {
    throw new Error("Unknown query parameter made a network request before rejecting");
  }

  const headerRejectResult = await runCli([
    "management:domains:list",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--if-match",
    'W/"domain"',
  ]);

  if (headerRejectResult.status === 0) {
    throw new Error("management:domains:list accepted an unsupported If-Match header");
  }

  if (!headerRejectResult.stderr.includes("does not support the If-Match header")) {
    throw new Error(`Expected unsupported header validation error, got:\n${headerRejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestsBeforeInvalidQuery) {
    throw new Error("Unsupported header made a network request before rejecting");
  }

  const getDomainResult = await runCli([
    "management:domains:get",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--path",
    "public_id=mdom_cli_test",
    "--if-none-match",
    'W/"domain"',
    "--json",
  ]);

  assertCliSuccess(getDomainResult, "management:domains:get with path and If-None-Match");

  const getDomainRequest = latestRequest();
  if (!getDomainRequest.url.startsWith("/domains/mdom_cli_test")) {
    throw new Error(`Path parameter was not passed through correctly: ${getDomainRequest.url}`);
  }

  if (getDomainRequest.headers["if-none-match"] !== 'W/"domain"') {
    throw new Error("If-None-Match header was not passed through correctly");
  }

  const attachmentPath = join(tempHome, "attachment.bin");
  const attachmentBytes = Buffer.from([0, 1, 2, 255]);
  writeFileSync(attachmentPath, attachmentBytes);
  const uploadResult = await runCli([
    "mailbox:upload-attachment",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "filename=test.bin",
    "--body-file",
    attachmentPath,
    "--json",
  ]);

  assertCliSuccess(uploadResult, "mailbox:upload-attachment with binary body");

  const uploadRequest = latestRequest();
  assertSearchParam(uploadRequest.url, "filename", "test.bin");
  if (!uploadRequest.body.equals(attachmentBytes)) {
    throw new Error("Binary upload body was not passed through unchanged");
  }

  const fileUploadResult = await runCli([
    "mailbox:upload-attachment",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--file",
    attachmentPath,
    "--json",
  ]);

  assertCliSuccess(fileUploadResult, "mailbox:upload-attachment --file");

  const fileUploadRequest = latestRequest();
  assertSearchParam(fileUploadRequest.url, "filename", "attachment.bin");
  if (!fileUploadRequest.body.equals(attachmentBytes)) {
    throw new Error("File upload body was not read from disk unchanged");
  }

  const textAttachmentPath = join(tempHome, "report.txt");
  const textAttachmentBytes = Buffer.from("sendmux attachment body\n", "utf8");
  writeFileSync(textAttachmentPath, textAttachmentBytes);

  const presignedUploadResult = await runCli([
    "mailbox:upload-attachment",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--file",
    textAttachmentPath,
    "--via-presigned",
    "--json",
  ]);

  assertCliSuccess(presignedUploadResult, "mailbox:upload-attachment --file --via-presigned");

  const presignedIntentRequest = serverState.requests.at(-2);
  const presignedPutRequest = latestRequest();
  if (!presignedIntentRequest) {
    throw new Error("Presigned upload did not create an upload intent");
  }
  if (presignedIntentRequest.url !== "/mailbox/attachment-uploads") {
    throw new Error(`Presigned upload used the wrong intent URL: ${presignedIntentRequest.url}`);
  }
  assertDeepEqual(JSON.parse(presignedIntentRequest.body.toString("utf8")), {
    content_type: "text/plain",
    filename: "report.txt",
    size_bytes: textAttachmentBytes.byteLength,
  }, "Presigned upload intent must include file metadata");
  if (presignedPutRequest.headers.authorization) {
    throw new Error("Presigned PUT leaked Authorization header");
  }
  if (presignedPutRequest.headers["content-type"] !== "text/plain") {
    throw new Error("Presigned PUT did not send the promised Content-Type");
  }
  if (presignedPutRequest.headers["content-length"] !== String(textAttachmentBytes.byteLength)) {
    throw new Error("Presigned PUT did not send the promised Content-Length");
  }
  if (!presignedPutRequest.body.equals(textAttachmentBytes)) {
    throw new Error("Presigned PUT body was not read from disk unchanged");
  }

  const createUploadIntentResult = await runCli([
    "mailbox:create-attachment-upload",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--file",
    textAttachmentPath,
    "--json",
  ]);

  assertCliSuccess(createUploadIntentResult, "mailbox:create-attachment-upload --file");

  const createUploadIntentRequest = latestRequest();
  if (createUploadIntentRequest.url !== "/mailbox/attachment-uploads") {
    throw new Error(`mailbox:create-attachment-upload --file used wrong path: ${createUploadIntentRequest.url}`);
  }
  assertDeepEqual(JSON.parse(createUploadIntentRequest.body.toString("utf8")), {
    content_type: "text/plain",
    filename: "report.txt",
    size_bytes: textAttachmentBytes.byteLength,
  }, "mailbox:create-attachment-upload --file must send local file metadata");

  const mailboxSendResult = await runCli([
    "mailbox:send-message",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "mailbox_id=mbx_cli_target",
    "--body",
    JSON.stringify({
      subject: "CLI attachment",
      text_body: "Attached",
      to: [{ email: "agent@example.com", name: null }],
    }),
    "--attach",
    textAttachmentPath,
    "--json",
  ]);

  assertCliSuccess(mailboxSendResult, "mailbox:send-message --attach");

  const mailboxAttachUploadRequest = serverState.requests.at(-2);
  const mailboxSendRequest = latestRequest();
  if (!mailboxAttachUploadRequest) {
    throw new Error("mailbox:send-message --attach did not upload before send");
  }
  if (!mailboxAttachUploadRequest.url.startsWith("/mailbox/attachments:upload")) {
    throw new Error(`mailbox:send-message --attach used wrong upload path: ${mailboxAttachUploadRequest.url}`);
  }
  assertSearchParam(mailboxAttachUploadRequest.url, "mailbox_id", "mbx_cli_target");
  assertSearchParam(mailboxAttachUploadRequest.url, "filename", "report.txt");
  const mailboxSendBody = JSON.parse(mailboxSendRequest.body.toString("utf8"));
  assertDeepEqual(mailboxSendBody.attachments, [
    {
      blob_id: "blob_cli_report.txt",
      content_type: "text/plain",
      filename: "report.txt",
    },
  ], "mailbox:send-message --attach must inject uploaded blob references");

  const sendingAttachResult = await runCli([
    "sending:send",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--body",
    JSON.stringify({
      from: { email: "from@example.com" },
      html_body: "<p>Attached</p>",
      subject: "CLI attachment",
      to: { email: "agent@example.com" },
    }),
    "--attach",
    textAttachmentPath,
    "--json",
  ]);

  assertCliSuccess(sendingAttachResult, "sending:send --attach");

  const sendingAttachUploadRequest = serverState.requests.at(-2);
  const sendingAttachSendRequest = latestRequest();
  if (!sendingAttachUploadRequest) {
    throw new Error("sending:send --attach did not upload before send");
  }
  if (!sendingAttachUploadRequest.url.startsWith("/emails/attachments")) {
    throw new Error(`sending:send --attach used wrong upload path: ${sendingAttachUploadRequest.url}`);
  }
  if (!sendingAttachUploadRequest.body.equals(textAttachmentBytes)) {
    throw new Error("sending:send --attach did not upload raw file bytes");
  }
  if (sendingAttachUploadRequest.headers["content-length"] !== String(textAttachmentBytes.byteLength)) {
    throw new Error("sending:send --attach did not send the file Content-Length");
  }

  const sendingAttachBody = JSON.parse(sendingAttachSendRequest.body.toString("utf8"));
  assertDeepEqual(sendingAttachBody.attachments, [
    {
      attachment_id: "att_1234567890abcdefghijklmn",
    },
  ], "sending:send --attach must inject uploaded attachment references");

  const streamResult = await runCli([
    "mailbox:stream-events",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "close_after=30",
    "--json",
  ]);

  assertCliSuccess(streamResult, "mailbox:stream-events first event");
  assertDeepEqual(JSON.parse(streamResult.stdout).message_id, "msg_cli_stream_1", "stream command must return the first event by default");

  const followResult = await runCli([
    "mailbox:stream-events",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "close_after=30",
    "--follow",
  ]);

  assertCliSuccess(followResult, "mailbox:stream-events --follow");
  const followedEvents = followResult.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assertDeepEqual(
    followedEvents.map((event) => event.message_id),
    ["msg_cli_stream_1", "msg_cli_stream_2"],
    "stream follow mode must print each event as one JSON line",
  );

  const missingRequiredQueryResult = await runCli([
    "mailbox:upload-attachment",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--body-file",
    attachmentPath,
  ]);

  if (missingRequiredQueryResult.status === 0) {
    throw new Error("mailbox:upload-attachment accepted a missing filename query parameter");
  }

  if (!missingRequiredQueryResult.stderr.includes('Missing query parameter "filename"')) {
    throw new Error(`Expected missing query validation error, got:\n${missingRequiredQueryResult.stderr}`);
  }

  const profileResult = await runCli([
    "profiles:set",
    "mbx",
    "--api-key",
    mailboxKey,
    "--default",
  ]);

  if (profileResult.status !== 0) {
    throw new Error(`profiles:set failed:\n${profileResult.stderr}`);
  }

  const requestCountBeforePreflight = serverState.requests.length;
  const rejectResult = await runCli([
    "management:domains:list",
    "--profile",
    "mbx",
    "--base-url",
    baseUrl,
  ]);

  if (rejectResult.status === 0) {
    throw new Error("management:domains:list accepted a mailbox API key");
  }

  if (!rejectResult.stderr.includes("requires a root API key")) {
    throw new Error(`Expected root-key preflight error, got:\n${rejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestCountBeforePreflight) {
    throw new Error("Root command preflight made a network request before rejecting a mailbox key");
  }

  const agentProfileResult = await runCli([
    "profiles:set",
    "agent",
    "--api-key",
    agentKey,
  ]);

  if (agentProfileResult.status !== 0) {
    throw new Error(`profiles:set accepted mailbox-compatible agent token failed:\n${agentProfileResult.stderr}`);
  }

  const requestCountBeforeAgentRootPreflight = serverState.requests.length;
  const agentRejectResult = await runCli([
    "management:domains:list",
    "--profile",
    "agent",
    "--base-url",
    baseUrl,
  ]);

  if (agentRejectResult.status === 0) {
    throw new Error("management:domains:list accepted an agent token");
  }

  if (!agentRejectResult.stderr.includes("requires a root API key")) {
    throw new Error(`Expected root-key preflight error for agent token, got:\n${agentRejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestCountBeforeAgentRootPreflight) {
    throw new Error("Root command preflight made a network request before rejecting an agent token");
  }

  const requestCountBeforeSendingPreflight = serverState.requests.length;
  const sendingRejectResult = await runCli([
    "sending:send",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--body",
    "{}",
  ]);

  if (sendingRejectResult.status === 0) {
    throw new Error("sending:send accepted a root API key");
  }

  if (!sendingRejectResult.stderr.includes("requires a sending API key")) {
    throw new Error(`Expected sending-key preflight error, got:\n${sendingRejectResult.stderr}`);
  }

  if (serverState.requests.length !== requestCountBeforeSendingPreflight) {
    throw new Error("Sending command preflight made a network request before rejecting a root key");
  }

  const sendingResult = await runCli([
    "sending:send",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--body",
    "{}",
    "--idempotency-key",
    "idem_cli_send",
    "--json",
  ]);

  assertCliSuccess(sendingResult, "sending:send with mailbox key");

  if (latestRequest().headers["idempotency-key"] !== "idem_cli_send") {
    throw new Error("Idempotency-Key header was not passed through for sending:send");
  }

  const durableRegistrationResult = await runCli([
    "agent:register",
    "durable-agent",
    "--base-url",
    baseUrl,
    "--client-name",
    "CLI durable agent",
    "--mailbox-local-part",
    "durable-agent",
    "--owner-email",
    "owner@example.com",
    "--default",
    "--json",
  ]);
  assertCliSuccess(durableRegistrationResult, "agent:register durable profile");
  if (durableRegistrationResult.stdout.includes(durableAgentKey)) {
    throw new Error("agent:register printed the durable access token");
  }
  const durableResultBody = JSON.parse(durableRegistrationResult.stdout);
  assertDeepEqual(durableResultBody.data, {
    default: true,
    mailbox_email: "durable-agent@myagent.mx",
    name: "durable-agent",
    owner_invite_status: "pending",
    registration_id: "areg_cli_durable",
    status: "active",
  }, "agent:register returned unexpected safe profile metadata");

  const agentConfigDir = join(tempHome, ".config", "sendmux");
  const agentConfigPath = join(agentConfigDir, "config.json");
  if (
    process.platform !== "win32" &&
    ((statSync(agentConfigDir).mode & 0o777) !== 0o700 || (statSync(agentConfigPath).mode & 0o777) !== 0o600)
  ) {
    throw new Error("agent profile storage permissions are not 0700/0600");
  }
  const agentConfig = JSON.parse(readFileSync(agentConfigPath, "utf8"));
  if (agentConfig.profiles["durable-agent"].accessToken !== durableAgentKey) {
    throw new Error("agent:register did not persist the durable access token");
  }
  if (serverState.readinessAttempts !== 2) {
    throw new Error(`agent:register did not poll readiness through a temporary 503: ${serverState.readinessAttempts}`);
  }

  const resumedRegistrationResult = await runCli([
    "agent:register",
    "durable-agent",
    "--base-url",
    baseUrl,
    "--client-name",
    "CLI durable agent",
    "--mailbox-local-part",
    "durable-agent",
    "--default",
    "--json",
  ]);
  assertCliSuccess(resumedRegistrationResult, "agent:register resume from an active persisted profile");
  if (serverState.registrations !== 1) {
    throw new Error("agent:register resume created a duplicate registration");
  }

  const ownerInviteResult = await runCli([
    "agent:invite-owner",
    "second-owner@example.com",
    "--profile",
    "durable-agent",
    "--json",
  ]);
  assertCliSuccess(ownerInviteResult, "agent:invite-owner with a freshly reloaded durable profile");
  assertDeepEqual(JSON.parse(ownerInviteResult.stdout).data, {
    email: "second-owner@example.com",
    profile: "durable-agent",
    status: "pending",
  }, "agent:invite-owner returned unexpected safe metadata");
  if (latestRequest().headers.authorization !== `Bearer ${durableAgentKey}`) {
    throw new Error("agent:invite-owner did not use the durable read token");
  }

  const durableMailboxResult = await runCli(["mailbox:me:get", "--profile", "durable-agent", "--json"]);
  assertCliSuccess(durableMailboxResult, "mailbox read with a freshly reloaded durable profile");
  if (latestRequest().headers.authorization !== `Bearer ${durableAgentKey}`) {
    throw new Error("mailbox operation did not use the durable read token");
  }

  const exchangedSendResult = await runCli([
    "sending:send",
    "--profile",
    "durable-agent",
    "--body",
    "{}",
    "--idempotency-key",
    "idem_cli_exchanged_send",
    "--json",
  ]);
  assertCliSuccess(exchangedSendResult, "sending:send with automatic agent token exchange");
  if (latestRequest().headers.authorization !== `Bearer ${delegatedAgentSendKey}`) {
    throw new Error("sending operation did not use the delegated send token");
  }
  if (serverState.tokenExchanges !== 1) {
    throw new Error(`sending operation made ${serverState.tokenExchanges} token exchanges instead of one`);
  }

  const cachedSendResult = await runCli([
    "sending:send",
    "--profile",
    "durable-agent",
    "--body",
    "{}",
    "--idempotency-key",
    "idem_cli_cached_send",
  ]);
  assertCliSuccess(cachedSendResult, "sending:send with cached delegated token");
  if (serverState.tokenExchanges !== 1) {
    throw new Error("sending operation did not reuse the unexpired delegated token across processes");
  }

  const requestCountBeforeAgentSendingPreflight = serverState.requests.length;
  const agentSendingResult = await runCli([
    "sending:send",
    "--api-key",
    agentKey,
    "--base-url",
    baseUrl,
    "--body",
    "{}",
    "--idempotency-key",
    "idem_cli_agent_send",
  ]);

  assertCliSuccess(agentSendingResult, "sending:send with agent token");

  if (latestRequest().headers["idempotency-key"] !== "idem_cli_agent_send") {
    throw new Error("Idempotency-Key header was not passed through for sending:send with agent token");
  }

  if (serverState.requests.length !== requestCountBeforeAgentSendingPreflight + 1) {
    throw new Error("Sending command did not make exactly one request with an agent token");
  }

  const rootResult = await runCli([
    "management:domains:list",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--json",
  ]);

  assertCliSuccess(rootResult, "management:domains:list with root key");

  console.log("CLI gate checks passed.");
} finally {
  server.close();
  rmSync(tempHome, { force: true, recursive: true });
}

function ensureCliBuilt() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnCommandSync(command, ["--filter", "@sendmux/cli", "build"], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`CLI build failed before gate checks: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error("CLI build failed before gate checks");
  }
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        HOME: tempHome,
        SENDMUX_API_KEY: "",
        SENDMUX_BASE_URL: "",
        SENDMUX_PROFILE: "",
        XDG_CONFIG_HOME: join(tempHome, ".config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI command timed out: ${args.join(" ")}`));
    }, 15_000);
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({
        status,
        stderr,
        stdout,
      });
    });
  });
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

function assertCliSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertCliPackageMetadata() {
  const manifest = JSON.parse(readFileSync(cliManifestPath, "utf8"));
  if (manifest.license !== "MIT") {
    throw new Error('@sendmux/cli package.json must declare "license": "MIT" for npm package metadata');
  }
  if (manifest.repository?.directory !== "packages/ts/cli") {
    throw new Error('@sendmux/cli package.json must point repository.directory at "packages/ts/cli"');
  }
}

function assertCliCommandCoverage() {
  const source = readFileSync(operationsPath, "utf8");
  const commands = [...source.matchAll(/"command": "([^"]+)"/g)].map((match) => match[1]);
  const uniqueCommands = new Set(commands);

  if (commands.length === 0) {
    throw new Error("CLI operation manifest did not contain any commands");
  }

  if (uniqueCommands.size !== commands.length) {
    throw new Error("CLI operation manifest contains duplicate command names");
  }

  const missing = [];
  for (const command of uniqueCommands) {
    const commandPath = join(commandsDir, ...command.split(":")) + ".ts";
    if (!existsSync(commandPath)) {
      missing.push(`${command} -> ${commandPath}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`CLI command modules are missing for generated operations:\n${missing.join("\n")}`);
  }
}

function assertBinaryOperationRunnerGuard() {
  const source = readFileSync(operationRunnerPath, "utf8");
  const operationsSource = readFileSync(operationsPath, "utf8");
  const delegatedUploadBlock = operationsSource.match(/sendingCompleteAttachmentUpload: \{[\s\S]*?\n  \}/)?.[0];
  if (!delegatedUploadBlock?.includes('"requiredKeyKind": "none"')) {
    throw new Error("CLI operation manifest must not require a Sendmux API key for sendingCompleteAttachmentUpload");
  }
  if (!source.includes('operation.requiredKeyKind === "none"')) {
    throw new Error("CLI operation runner must skip Sendmux auth resolution for no-auth operations");
  }

  const operationBlock = operationsSource.match(/mailboxGetMessageAttachment: \{[\s\S]*?\n  \}/)?.[0];
  if (!operationBlock?.includes('"responseKind": "binary"')) {
    throw new Error("CLI operation manifest must classify mailboxGetMessageAttachment as a binary response");
  }

  const branch = source.match(/if \(operation\.operationId === "mailboxGetMessageAttachment"\) \{[\s\S]*?\n  \}/)?.[0];
  if (!branch) {
    throw new Error("CLI operation runner must special-case mailboxGetMessageAttachment");
  }
  if (!branch.includes("return command.renderBinaryResult(data);")) {
    throw new Error("CLI attachment branch must render binary results directly");
  }
  if (!branch.includes('throw new Error("SDK operation mailboxGetMessageAttachment did not return binary content");')) {
    throw new Error("CLI attachment branch must reject non-binary data instead of falling through");
  }
}

async function assertCliArrayParameterSupport() {
  const fixtureDir = mkdtempSync(join(tmpdir(), "sendmux-cli-array-spec-"));
  try {
    writeFileSync(
      join(fixtureDir, "openapi-app.json"),
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "CLI array parameter fixture", version: "1.0.0" },
        paths: {
          "/array-probe": {
            get: {
              operationId: "managementArrayProbe",
              summary: "Array probe",
              parameters: [
                {
                  in: "query",
                  name: "event_types",
                  required: false,
                  schema: {
                    type: "array",
                    minItems: 1,
                    maxItems: 3,
                    items: {
                      type: "string",
                      enum: ["message.received", "sync_required"],
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    );
    writeFileSync(
      join(fixtureDir, "openapi-sending.json"),
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Empty Sending fixture", version: "1.0.0" },
        paths: {},
      }),
    );

    const generatedPath = join(fixtureDir, "operations.ts");
    const generateResult = spawnSync(
      process.execPath,
      [
        "scripts/generate-cli.mjs",
        "--input-dir",
        fixtureDir,
        "--output",
        generatedPath,
        "--cli-source-dir",
        join(fixtureDir, "cli-src"),
        "--commands-dir",
        join(fixtureDir, "commands"),
      ],
      { encoding: "utf8" },
    );
    if (generateResult.status !== 0) {
      throw new Error(`CLI generator array-parameter fixture failed:\n${generateResult.stderr}`);
    }

    const generated = readFileSync(generatedPath, "utf8");
    for (const expected of ['"type": "array"', '"items"', '"enum"', '"minItems": 1', '"maxItems": 3']) {
      if (!generated.includes(expected)) {
        throw new Error(`CLI generator dropped array parameter metadata: missing ${expected}`);
      }
    }

    const { parseOperationOptions } = await import("../packages/ts/cli/dist/operation-flags.js");
    const parsed = await parseOperationOptions(errorOnlyCommand(), {
      bodyKind: "none",
      command: "management:array-probe",
      description: "Array probe",
      headerParams: [],
      method: "get",
      operationId: "managementArrayProbe",
      path: "/array-probe",
      pathParams: [],
      queryParams: [
        {
          name: "event_types",
          required: false,
          schema: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "string",
              enum: ["message.received", "sync_required"],
            },
          },
        },
      ],
      responseKind: "json",
      requestBodyRequired: false,
      requiredKeyKind: "root",
      surface: "management",
    }, {
      query: ["event_types=message.received", "event_types=sync_required"],
    });

    assertDeepEqual(parsed.query?.event_types, ["message.received", "sync_required"], "Repeated array query flags must append instead of overwrite");
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

function errorOnlyCommand() {
  return {
    error(message, options) {
      const error = new Error(message);
      error.exit = options?.exit;
      throw error;
    },
  };
}

function latestRequest() {
  const request = serverState.requests.at(-1);
  if (!request) {
    throw new Error("Expected the test server to receive a request");
  }
  return request;
}

function assertSearchParam(url, name, expected) {
  const parsed = new URL(url, "http://127.0.0.1");
  const actual = parsed.searchParams.get(name);
  if (actual !== expected) {
    throw new Error(`Expected ${name}=${expected} in ${url}, got ${actual}`);
  }
}
