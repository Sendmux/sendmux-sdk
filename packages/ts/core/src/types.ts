export type ApiKeyKind = "root" | "mailbox";

export interface ResponseMeta {
  request_id: string;
  [key: string]: unknown;
}

export interface CursorPagination {
  has_more: boolean;
  next_cursor?: string;
}

export interface SuccessEnvelope<TData = unknown, TMeta = ResponseMeta> {
  ok: true;
  data: TData;
  meta: TMeta;
  pagination?: CursorPagination;
}

export interface ApiErrorDetail {
  code: string;
  field: string;
  message: string;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    doc_url?: string;
    errors?: ApiErrorDetail[];
    message: string;
    param?: string;
    retryable: boolean;
  };
  meta: ResponseMeta;
}

export interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxReplayBodyBytes?: number;
  jitter?: boolean;
}

export interface SendmuxClientConfig {
  apiKey: string | (() => string | Promise<string>);
  apiKeyKind?: ApiKeyKind;
  baseUrl?: string;
  fetch?: typeof fetch;
  retry?: RetryConfig;
}

export type SurfaceClientConfig = Omit<SendmuxClientConfig, "apiKeyKind">;

export interface GeneratedSendmuxClientConfig {
  auth: () => string | Promise<string>;
  baseUrl?: string;
  fetch: typeof fetch;
  throwOnError: true;
}

export type GeneratedErrorInterceptor = (error: unknown, response?: Response) => unknown;

export interface GeneratedRequestOptions {
  serializedBody?: string;
}

export type GeneratedRequestInterceptor = (
  request: Request,
  options: GeneratedRequestOptions,
) => Request | Promise<Request>;

export interface GeneratedSendmuxClient<TConfig extends GeneratedSendmuxClientConfig = GeneratedSendmuxClientConfig> {
  interceptors: {
    error: {
      use(fn: GeneratedErrorInterceptor): unknown;
    };
    request: {
      use(fn: GeneratedRequestInterceptor): unknown;
    };
  };
  setConfig(config: TConfig): unknown;
}

export interface ConditionalRequestHeaders {
  "If-Match"?: string;
  "If-None-Match"?: string;
}

export interface ConditionalHeadersInput {
  etag?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
}

export interface IdempotencyHeaders {
  "Idempotency-Key": string;
}
