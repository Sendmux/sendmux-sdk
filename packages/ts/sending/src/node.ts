import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import { sendingSendEmail } from "./generated/sdk.gen.js";
import type { Client } from "./generated/client/index.js";
import type {
  Attachment,
  EmailSendRequest,
  SendSuccessResponse,
} from "./generated/types.gen.js";

export interface NodeFileAttachment {
  contentType?: string;
  filename?: string;
  path: string;
}

export type NodeFileAttachmentInput = string | NodeFileAttachment;

export interface AttachmentFromFileOptions {
  contentType?: string;
  filePath: string;
  filename?: string;
}

export interface SendEmailWithFilesOptions {
  body: EmailSendRequest;
  client: Client;
  files: NodeFileAttachmentInput[];
  headers?: {
    "Idempotency-Key"?: string;
  };
}

export async function attachmentFromFile(input: AttachmentFromFileOptions | string): Promise<Attachment> {
  const file = await readAttachmentFile(
    typeof input === "string"
      ? input
      : fileInput({ contentType: input.contentType, filename: input.filename, path: input.filePath }),
  );
  return {
    content: file.bytes.toString("base64"),
    encoding: "base64",
    filename: file.filename,
    type: file.contentType,
  };
}

export async function sendEmailWithFiles({
  body,
  client,
  files,
  headers,
}: SendEmailWithFilesOptions): Promise<SendSuccessResponse> {
  const attachments = [];
  for (const file of files) {
    attachments.push(await attachmentFromFile(
      typeof file === "string"
        ? file
        : attachmentOptions({ contentType: file.contentType, filePath: file.path, filename: file.filename }),
    ));
  }

  const response = await sendingSendEmail({
    client,
    body: {
      ...body,
      attachments: [...(body.attachments ?? []), ...attachments],
    },
    ...(headers ? { headers } : {}),
    throwOnError: true,
  });
  return response.data;
}

interface ReadAttachmentFileResult {
  bytes: Buffer;
  contentType: string;
  filename: string;
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

  return {
    bytes: await readFile(file.path),
    contentType: file.contentType ?? inferContentType(file.path),
    filename: file.filename ?? basename(file.path),
  };
}

function fileInput({ contentType, filename, path }: { contentType?: string; filename?: string; path: string }): NodeFileAttachment {
  return {
    path,
    ...(contentType ? { contentType } : {}),
    ...(filename ? { filename } : {}),
  };
}

function attachmentOptions({
  contentType,
  filePath,
  filename,
}: {
  contentType?: string;
  filePath: string;
  filename?: string;
}): AttachmentFromFileOptions {
  return {
    filePath,
    ...(contentType ? { contentType } : {}),
    ...(filename ? { filename } : {}),
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
