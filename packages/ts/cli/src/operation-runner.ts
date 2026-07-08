import * as sdk from "@sendmux/sdk";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { SendmuxCommand } from "./base-command.js";
import {
  parseOperationOptions,
  type ParsedOperationOptions,
  type OperationFlags,
} from "./operation-flags.js";
import type { OperationDefinition } from "./operation-types.js";

type SdkOperation = (options: Record<string, unknown>) => Promise<unknown>;
type ClientFactory = (config: {
  apiKey: string;
  baseUrl?: string;
}) => unknown;
type MailboxClient = ReturnType<typeof sdk.mailbox.createMailboxClient>;
type SendingClient = ReturnType<typeof sdk.sending.createSendingClient>;

const surfaceModules = {
  mailbox: sdk.mailbox,
  management: sdk.management,
  sending: sdk.sending,
} as const;

const clientFactories = {
  mailbox: sdk.mailbox.createMailboxClient,
  management: sdk.management.createManagementClient,
  sending: sdk.sending.createSendingClient,
} satisfies Record<OperationDefinition["surface"], ClientFactory>;

export async function runSdkOperation(
  command: SendmuxCommand,
  operation: OperationDefinition,
  flags: OperationFlags,
): Promise<unknown> {
  validateAttachmentConvenienceFlags(command, operation, flags);

  let baseUrl: string | undefined;
  let client: ReturnType<(typeof clientFactories)[OperationDefinition["surface"]]> | undefined;
  if (operation.requiredKeyKind === "none") {
    baseUrl = flags["base-url"] ?? process.env.SENDMUX_BASE_URL;
  } else {
    const auth = await command.resolveAuth(flags, operation.requiredKeyKind);
    baseUrl = auth.baseUrl;
    client = clientFactories[operation.surface]({
      apiKey: auth.apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    });
  }
  const operationOptions = await parseOperationOptions(command, operation, flags);
  const sdkOperation = operationFor(operation);
  const baseRequestOptions = {
    ...(client ? { client } : {}),
    ...operationOptions,
    ...(!client && baseUrl ? { baseUrl } : {}),
  };

  if (operation.operationId === "mailboxCreateAttachmentUpload" && flags.file) {
    return createMailboxAttachmentUploadFromFile(command, client, operationOptions, flags);
  }

  if (operation.operationId === "mailboxUploadAttachment" && flags.file) {
    return uploadMailboxAttachmentFromFile(command, client, operationOptions, flags);
  }

  if ((operation.operationId === "mailboxSendMessage" || operation.operationId === "sendingSendEmail") && flags.attach?.length) {
    const nextOptions = await withAttachedFiles(command, operation, client, operationOptions, flags);
    const response = await sdkOperation({
      ...baseRequestOptions,
      ...nextOptions,
    });
    return command.renderResult(rawResponseData(response));
  }

  if (operation.operationId === "mailboxStreamEvents") {
    const controller = new AbortController();
    const response = await sdkOperation({
      ...baseRequestOptions,
      signal: controller.signal,
    });
    if (flags.follow) {
      return streamEvents(command, response, controller);
    }
    return command.renderResult(await firstStreamEvent(response, controller));
  }

  if (operation.operationId === "mailboxGetMessageAttachment") {
    const response = await sdkOperation({
      ...baseRequestOptions,
      parseAs: "arrayBuffer",
    });
    const data = rawResponseData(response);
    if (typeof data === "string" || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return command.renderBinaryResult(data);
    }
    throw new Error("SDK operation mailboxGetMessageAttachment did not return binary content");
  }

  const response = await sdkOperation(baseRequestOptions);

  const data = rawResponseData(response);
  if (operation.responseKind === "text" && typeof data === "string") {
    return command.renderTextResult(data);
  }

  return command.renderResult(data);
}

function validateAttachmentConvenienceFlags(
  command: SendmuxCommand,
  operation: OperationDefinition,
  flags: OperationFlags,
): void {
  const supportsFile = operation.operationId === "mailboxUploadAttachment" || operation.operationId === "mailboxCreateAttachmentUpload";
  if (flags.file && !supportsFile) {
    command.error("This command does not support --file. Use --attach on send commands.", { exit: 2 });
  }

  if (flags["via-presigned"] && operation.operationId !== "mailboxUploadAttachment") {
    command.error("--via-presigned is only supported by mailbox:upload-attachment --file.", { exit: 2 });
  }

  const supportsAttach = operation.operationId === "mailboxSendMessage" || operation.operationId === "sendingSendEmail";
  if (flags.attach?.length && !supportsAttach) {
    command.error("--attach is only supported by mailbox:send-message and sending:send.", { exit: 2 });
  }

  if (flags.attach?.length && flags["content-type"] && flags.attach.length > 1) {
    command.error("--content-type with multiple --attach files would apply the same type to every file. Omit it to infer per file.", {
      exit: 2,
    });
  }
}

async function createMailboxAttachmentUploadFromFile(
  command: SendmuxCommand,
  client: unknown,
  operationOptions: ParsedOperationOptions,
  flags: OperationFlags,
): Promise<unknown> {
  const file = await readAttachmentFile(command, flags.file as string, flags["content-type"]);
  const response = await sdk.mailbox.mailboxCreateAttachmentUpload({
    client: client as MailboxClient,
    body: {
      content_type: file.contentType,
      filename: file.filename,
      size_bytes: file.sizeBytes,
    },
    query: mailboxUploadQuery(operationOptions),
  });

  return command.renderResult(rawResponseData(response));
}

async function uploadMailboxAttachmentFromFile(
  command: SendmuxCommand,
  client: unknown,
  operationOptions: ParsedOperationOptions,
  flags: OperationFlags,
): Promise<unknown> {
  const file = await readAttachmentFile(command, flags.file as string, flags["content-type"]);
  if (flags["via-presigned"]) {
    const intentResponse = await sdk.mailbox.mailboxCreateAttachmentUpload({
      client: client as MailboxClient,
      query: mailboxUploadQuery(operationOptions),
      body: {
        content_type: file.contentType,
        filename: file.filename,
        size_bytes: file.sizeBytes,
      },
    });
    const intent = envelopeData<Record<string, unknown>>(intentResponse, "mailboxCreateAttachmentUpload");
    const uploadUrl = stringField(intent, "upload_url", "mailboxCreateAttachmentUpload");
    const method = stringField(intent, "method", "mailboxCreateAttachmentUpload");
    const headers = recordField(intent, "headers", "mailboxCreateAttachmentUpload");
    const contentType = stringField(headers, "Content-Type", "mailboxCreateAttachmentUpload headers");
    const contentLength = stringField(headers, "Content-Length", "mailboxCreateAttachmentUpload headers");

    if (method !== "PUT") {
      throw new Error(`mailboxCreateAttachmentUpload returned unsupported method ${method}`);
    }

    const putResponse = await fetch(uploadUrl, {
      body: arrayBufferFor(file.bytes),
      headers: {
        "Content-Length": contentLength,
        "Content-Type": contentType,
      },
      method,
    });
    const payload = await putResponse.json().catch(() => undefined);
    if (!putResponse.ok) {
      throw new Error(`Presigned attachment upload failed with HTTP ${putResponse.status}`);
    }

    return command.renderResult(payload);
  }

  const response = await sdk.mailbox.mailboxUploadAttachment({
    client: client as MailboxClient,
    body: blobFor(file),
    headers: {
      ...(recordOrUndefined(operationOptions.headers)),
      "Content-Type": file.contentType,
    },
    query: {
      ...mailboxUploadQuery(operationOptions),
      filename: file.filename,
    },
  });

  return command.renderResult(rawResponseData(response));
}

async function withAttachedFiles(
  command: SendmuxCommand,
  operation: OperationDefinition,
  client: unknown,
  operationOptions: ParsedOperationOptions,
  flags: OperationFlags,
): Promise<ParsedOperationOptions> {
  const body = jsonObjectBody(command, operationOptions.body);
  const existingAttachments = attachmentArray(command, body.attachments);
  const files = [];
  for (const path of flags.attach ?? []) {
    files.push(await readAttachmentFile(command, path, flags["content-type"]));
  }

  if (operation.operationId === "mailboxSendMessage") {
    const uploaded = [];
    for (const file of files) {
      const uploadResponse = await sdk.mailbox.mailboxUploadAttachment({
        client: client as MailboxClient,
        body: blobFor(file),
        headers: {
          "Content-Type": file.contentType,
        },
        query: {
          ...mailboxUploadQuery(operationOptions),
          filename: file.filename,
        },
      });
      const result = envelopeData<Record<string, unknown>>(uploadResponse, "mailboxUploadAttachment");
      uploaded.push({
        blob_id: stringField(result, "blob_id", "mailboxUploadAttachment"),
        content_type: stringField(result, "content_type", "mailboxUploadAttachment"),
        filename: stringField(result, "filename", "mailboxUploadAttachment"),
      });
    }

    return {
      ...operationOptions,
      body: {
        ...body,
        attachments: [...existingAttachments, ...uploaded],
      },
    };
  }

  if (operation.operationId === "sendingSendEmail") {
    const uploaded = [];
    for (const file of files) {
      const uploadResponse = await sdk.sending.sendingUploadAttachment({
        client: client as SendingClient,
        body: blobFor(file),
        headers: {
          "Content-Length": file.sizeBytes,
          "Content-Type": file.contentType,
        },
        query: {
          content_type: file.contentType,
          filename: file.filename,
        },
      });
      const result = envelopeData<Record<string, unknown>>(uploadResponse, "sendingUploadAttachment");
      uploaded.push({
        attachment_id: stringField(result, "attachment_id", "sendingUploadAttachment"),
      });
    }

    return {
      ...operationOptions,
      body: {
        ...body,
        attachments: [...existingAttachments, ...uploaded],
      },
    };
  }

  return {
    ...operationOptions,
    body: {
      ...body,
      attachments: [
        ...existingAttachments,
        ...files.map((file) => ({
          content: file.bytes.toString("base64"),
          encoding: "base64",
          filename: file.filename,
          type: file.contentType,
        })),
      ],
    },
  };
}

interface AttachmentFile {
  bytes: Buffer;
  contentType: string;
  filename: string;
  sizeBytes: number;
}

async function readAttachmentFile(
  command: SendmuxCommand,
  filePath: string,
  contentTypeOverride: string | undefined,
): Promise<AttachmentFile> {
  const info = await stat(filePath).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    command.error(`Could not read attachment file ${filePath}: ${message}`, { exit: 2 });
  });

  if (!info.isFile()) {
    command.error(`Attachment path is not a regular file: ${filePath}`, { exit: 2 });
  }

  if (info.size === 0) {
    command.error(`Attachment file is empty: ${filePath}`, { exit: 2 });
  }

  const bytes = await readFile(filePath);
  return {
    bytes,
    contentType: contentTypeOverride ?? inferContentType(filePath),
    filename: basename(filePath),
    sizeBytes: bytes.byteLength,
  };
}

function inferContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".csv":
      return "text/csv";
    case ".gif":
      return "image/gif";
    case ".htm":
    case ".html":
      return "text/html";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".json":
      return "application/json";
    case ".md":
    case ".txt":
      return "text/plain";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function jsonObjectBody(command: SendmuxCommand, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    command.error("--attach requires a JSON object request body.", { exit: 2 });
  }

  return value as Record<string, unknown>;
}

function attachmentArray(command: SendmuxCommand, value: unknown): Record<string, unknown>[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    command.error('Request body field "attachments" must be an array when using --attach.', { exit: 2 });
  }

  return value as Record<string, unknown>[];
}

function mailboxUploadQuery(operationOptions: ParsedOperationOptions): Record<string, string> {
  const mailboxId = recordOrUndefined(operationOptions.query)?.mailbox_id;
  return typeof mailboxId === "string" && mailboxId.length > 0 ? { mailbox_id: mailboxId } : {};
}

function envelopeData<T extends Record<string, unknown>>(value: unknown, operationId: string): T {
  const raw = rawResponseData(value);
  if (!raw || typeof raw !== "object" || !("data" in raw)) {
    throw new Error(`SDK operation ${operationId} did not return an API envelope`);
  }

  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`SDK operation ${operationId} did not return object data`);
  }

  return data as T;
}

function stringField(record: Record<string, unknown>, field: string, source: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} did not return string field ${field}`);
  }

  return value;
}

function recordField(record: Record<string, unknown>, field: string, source: string): Record<string, unknown> {
  const value = record[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} did not return object field ${field}`);
  }

  return value as Record<string, unknown>;
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function blobFor(file: AttachmentFile): Blob {
  return new Blob([arrayBufferFor(file.bytes)], { type: file.contentType });
}

function arrayBufferFor(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function firstStreamEvent(value: unknown, controller: AbortController): Promise<unknown> {
  const stream = (value as { stream?: AsyncIterable<unknown> } | null)?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("SDK operation mailboxStreamEvents did not return an async stream");
  }

  const iterator = stream[Symbol.asyncIterator]();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for mailbox stream event")), 20_000);
  });

  try {
    const next = await Promise.race([iterator.next(), timeout]);
    if (next.done) {
      throw new Error("Mailbox stream ended before yielding an event");
    }
    return next.value;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    controller.abort();
    await closeAsyncIterator(iterator);
  }
}

async function streamEvents(command: SendmuxCommand, value: unknown, controller: AbortController): Promise<void> {
  const stream = (value as { stream?: AsyncIterable<unknown> } | null)?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("SDK operation mailboxStreamEvents did not return an async stream");
  }

  const iterator = stream[Symbol.asyncIterator]();
  const abort = () => {
    controller.abort();
  };
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) {
        return;
      }
      command.log(JSON.stringify(next.value));
    }
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    controller.abort();
    await closeAsyncIterator(iterator);
  }
}

async function closeAsyncIterator(iterator: AsyncIterator<unknown>): Promise<void> {
  if (typeof iterator.return !== "function") {
    return;
  }
  await Promise.race([iterator.return(), sleep(1_000)]).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    timeout.unref?.();
  });
}

function operationFor(operation: OperationDefinition): SdkOperation {
  const module = surfaceModules[operation.surface] as Record<string, unknown>;
  const sdkOperation = module[operation.operationId];
  if (typeof sdkOperation !== "function") {
    throw new Error(`SDK operation ${operation.operationId} is not exported by @sendmux/sdk`);
  }

  return sdkOperation as SdkOperation;
}

function rawResponseData(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("data" in value)) {
    return value;
  }

  return (value as { data?: unknown }).data;
}
