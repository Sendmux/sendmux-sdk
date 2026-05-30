import type { ApiError, GeneratedErrorInterceptor } from "./types.js";
import { isRetryableStatus } from "./retry.js";

export class SendmuxApiError extends Error {
  readonly body: ApiError | undefined;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly response: Response | undefined;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor({
    body,
    cause,
    response,
  }: {
    body?: ApiError | undefined;
    cause?: unknown;
    response?: Response | undefined;
  }) {
    super(body?.error.message ?? response?.statusText ?? "Sendmux API request failed", { cause });
    this.name = "SendmuxApiError";
    this.body = body;
    this.code = body?.error.code ?? "request_failed";
    this.requestId = body?.meta.request_id;
    this.response = response;
    this.retryable = body?.error.retryable ?? isRetryableStatus(response?.status);
    this.status = response?.status;
  }
}

export function mapApiError(error: unknown, response?: Response): SendmuxApiError {
  if (error instanceof SendmuxApiError) {
    return error;
  }

  if (isApiError(error)) {
    return new SendmuxApiError({ body: error, cause: error, response });
  }

  return new SendmuxApiError({ cause: error, response });
}

export function createErrorInterceptor(): GeneratedErrorInterceptor {
  return (error: unknown, response?: Response) => mapApiError(error, response);
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ApiError;
  return (
    candidate.ok === false &&
    typeof candidate.error?.code === "string" &&
    typeof candidate.error.message === "string" &&
    typeof candidate.error.retryable === "boolean" &&
    typeof candidate.meta?.request_id === "string"
  );
}
