import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import {
  mailboxCreateAttachmentUpload,
  mailboxSendMessage,
  mailboxUploadAttachment,
} from "./generated/sdk.gen.js";
import type { Client } from "./generated/client/index.js";
import type {
  MailboxAttachmentUploadIntentResultResponse,
  MailboxAttachmentUploadResultResponse,
  MailboxSendResultResponse,
  SendMailboxMessageBody,
} from "./generated/types.gen.js";

export interface NodeFileAttachment {
  contentType?: string;
  filename?: string;
  path: string;
}

export type NodeFileAttachmentInput = string | NodeFileAttachment;

export interface UploadMailboxAttachmentFromFileOptions {
  client: Client;
  contentType?: string;
  filePath: string;
  filename?: string;
  mailboxId?: string;
}

export interface CreateMailboxAttachmentUploadFromFileOptions extends UploadMailboxAttachmentFromFileOptions {}

export interface UploadMailboxAttachmentViaPresignedFileOptions extends UploadMailboxAttachmentFromFileOptions {
  fetch?: typeof fetch;
}

export interface SendMailboxMessageWithFilesOptions {
  body: SendMailboxMessageBody;
  client: Client;
  files: NodeFileAttachmentInput[];
  headers?: {
    "Idempotency-Key"?: string;
  };
  query?: {
    mailbox_id?: string;
  };
}

export async function uploadMailboxAttachmentFromFile({
  client,
  contentType,
  filePath,
  filename,
  mailboxId,
}: UploadMailboxAttachmentFromFileOptions): Promise<MailboxAttachmentUploadResultResponse> {
  const file = await readAttachmentFile(fileInput({ contentType, filename, path: filePath }));
  const response = await mailboxUploadAttachment({
    client,
    body: blobFor(file),
    headers: {
      "Content-Type": file.contentType,
    },
    query: mailboxUploadQuery({ filename: file.filename, mailboxId }),
    throwOnError: true,
  });
  return response.data;
}

export async function createMailboxAttachmentUploadFromFile({
  client,
  contentType,
  filePath,
  filename,
  mailboxId,
}: CreateMailboxAttachmentUploadFromFileOptions): Promise<MailboxAttachmentUploadIntentResultResponse> {
  const file = await readAttachmentFile(fileInput({ contentType, filename, path: filePath }));
  const response = await mailboxCreateAttachmentUpload({
    client,
    body: {
      content_type: file.contentType,
      filename: file.filename,
      size_bytes: file.sizeBytes,
    },
    ...(mailboxId ? { query: { mailbox_id: mailboxId } } : {}),
    throwOnError: true,
  });
  return response.data;
}

export async function uploadMailboxAttachmentViaPresignedFile({
  client,
  contentType,
  fetch: uploadFetch = fetch,
  filePath,
  filename,
  mailboxId,
}: UploadMailboxAttachmentViaPresignedFileOptions): Promise<MailboxAttachmentUploadResultResponse> {
  const file = await readAttachmentFile(fileInput({ contentType, filename, path: filePath }));
  const intentResponse = await mailboxCreateAttachmentUpload({
    client,
    body: {
      content_type: file.contentType,
      filename: file.filename,
      size_bytes: file.sizeBytes,
    },
    ...(mailboxId ? { query: { mailbox_id: mailboxId } } : {}),
    throwOnError: true,
  });
  const intent = intentResponse.data;

  const response = await uploadFetch(intent.data.upload_url, {
    body: arrayBufferFor(file.bytes),
    headers: {
      "Content-Length": intent.data.headers["Content-Length"],
      "Content-Type": intent.data.headers["Content-Type"],
    },
    method: intent.data.method,
  });
  if (!response.ok) {
    throw new Error(`Presigned attachment upload failed with HTTP ${response.status}`);
  }
  return parseUploadResultResponse(await response.text());
}

export async function sendMailboxMessageWithFiles({
  body,
  client,
  files,
  headers,
  query,
}: SendMailboxMessageWithFilesOptions): Promise<MailboxSendResultResponse> {
  const attachments = [];
  for (const fileInput of files) {
    const file = await readAttachmentFile(fileInput);
    const uploaded = await uploadMailboxAttachmentFromFile({
      client,
      contentType: file.contentType,
      filePath: file.path,
      filename: file.filename,
      mailboxId: query?.mailbox_id,
    });
    attachments.push({
      blob_id: uploaded.data.blob_id,
      content_type: uploaded.data.content_type,
      filename: uploaded.data.filename,
    });
  }

  const response = await mailboxSendMessage({
    client,
    body: {
      ...body,
      attachments: [...(body.attachments ?? []), ...attachments],
    },
    ...(headers ? { headers } : {}),
    ...(query ? { query } : {}),
    throwOnError: true,
  });
  return response.data;
}

interface ReadAttachmentFileResult {
  bytes: Buffer;
  contentType: string;
  filename: string;
  path: string;
  sizeBytes: number;
}

async function readAttachmentFile(input: NodeFileAttachmentInput): Promise<ReadAttachmentFileResult> {
  const file = typeof input === "string" ? { path: input } : input;
  const info = await stat(file.path);
  if (!info.isFile()) {
    throw new Error(`Attachment path is not a regular file: ${file.path}`);
  }
  if (info.size === 0) {
    throw new Error(`Attachment file is empty: ${file.path}`);
  }

  const bytes = await readFile(file.path);
  return {
    bytes,
    contentType: file.contentType ?? inferContentType(file.path),
    filename: file.filename ?? basename(file.path),
    path: file.path,
    sizeBytes: bytes.byteLength,
  };
}

function fileInput({ contentType, filename, path }: { contentType?: string; filename?: string; path: string }): NodeFileAttachment {
  return {
    path,
    ...(contentType ? { contentType } : {}),
    ...(filename ? { filename } : {}),
  };
}

function mailboxUploadQuery({ filename, mailboxId }: { filename: string; mailboxId?: string }): { filename: string; mailbox_id?: string } {
  return mailboxId ? { filename, mailbox_id: mailboxId } : { filename };
}

function blobFor(file: ReadAttachmentFileResult): Blob {
  return new Blob([arrayBufferFor(file.bytes)], { type: file.contentType });
}

function arrayBufferFor(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function parseUploadResultResponse(body: string): MailboxAttachmentUploadResultResponse {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Presigned attachment upload succeeded but did not return attachment metadata.");
  }
  try {
    return JSON.parse(trimmed) as MailboxAttachmentUploadResultResponse;
  } catch (error) {
    throw new Error("Presigned attachment upload returned invalid JSON metadata.", { cause: error });
  }
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
