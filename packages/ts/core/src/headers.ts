import type {
  ConditionalHeadersInput,
  ConditionalRequestHeaders,
  IdempotencyHeaders,
} from "./types.js";

export function conditionalHeaders(input: ConditionalHeadersInput): ConditionalRequestHeaders {
  const headers: ConditionalRequestHeaders = {};
  const ifMatch = input.ifMatch ?? input.etag;
  if (ifMatch) {
    headers["If-Match"] = ifMatch;
  }

  if (input.ifNoneMatch) {
    headers["If-None-Match"] = input.ifNoneMatch;
  }

  return headers;
}

export function idempotencyHeaders(key: string = crypto.randomUUID()): IdempotencyHeaders {
  return { "Idempotency-Key": key };
}

export function responseEtag(response: Response | undefined): string | undefined {
  return response?.headers.get("ETag") ?? undefined;
}
