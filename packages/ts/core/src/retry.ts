import type { RetryConfig } from "./types.js";

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export function createRetryingFetch(
  config: RetryConfig = {},
  baseFetch: typeof fetch = globalThis.fetch,
  replayBodies?: WeakMap<Request, string>,
): typeof fetch {
  const maxAttempts = Math.max(1, config.maxAttempts ?? 3);
  const baseDelayMs = config.baseDelayMs ?? 250;
  const maxDelayMs = config.maxDelayMs ?? 5_000;
  const maxReplayBodyBytes = config.maxReplayBodyBytes ?? 1_048_576;
  const jitter = config.jitter ?? true;

  return async (input, init) => {
    const deadline = config.maxElapsedMs === undefined ? Infinity : Date.now() + Math.max(0, config.maxElapsedMs);
    const request = new Request(input, init);
    const retryPlan = await createRetryPlan(request, maxReplayBodyBytes, replayBodies);
    return executeRetryLoop({
      baseDelayMs,
      baseFetch,
      deadline,
      jitter,
      maxAttempts,
      maxDelayMs,
      request,
      retryPlan,
    });
  };
}

export function isRetryableStatus(status?: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || (typeof status === "number" && status >= 500);
}

async function shouldRetryResponse(response: Response, request: Request): Promise<boolean> {
  if (!isRetryableRequest(request) || !isRetryableStatus(response.status)) return false;
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    try {
      const body: unknown = await response.clone().json();
      if (
        body && typeof body === "object" && "ok" in body && body.ok === false &&
        "error" in body && body.error && typeof body.error === "object" &&
        "retryable" in body.error && body.error.retryable === false
      ) {
        return false;
      }
    } catch {
      // An unreadable error envelope leaves the HTTP status as the retry signal.
    }
  }
  return true;
}

function isRetryableRequest(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  return method === "POST" && request.headers.has("Idempotency-Key") && hasReplayableRequestBody(request);
}

function hasReplayableRequestBody(request: Request): boolean {
  if (!request.body) {
    return true;
  }

  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.startsWith("text/");
}

function retryDelay({
  attempt,
  baseDelayMs,
  headers,
  jitter,
  maxDelayMs,
}: {
  attempt: number;
  baseDelayMs: number;
  headers?: Headers;
  jitter: boolean;
  maxDelayMs: number;
}): number {
  const retryAfter = headers?.get("Retry-After");
  if (retryAfter) {
    const parsed = Number(retryAfter);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed * 1_000);
    }

    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }

  const reset = headers?.get("X-RateLimit-Reset");
  if (reset) {
    const resetSeconds = Number(reset);
    if (Number.isFinite(resetSeconds)) {
      return Math.max(0, resetSeconds * 1_000 - Date.now());
    }
  }

  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return jitter ? Math.floor(exponential * (0.5 + Math.random())) : exponential;
}

interface RetryPlan {
  canRetry: boolean;
  createRequest: () => Request;
}

interface RetryLoopOptions {
  baseDelayMs: number;
  baseFetch: typeof fetch;
  deadline: number;
  jitter: boolean;
  maxAttempts: number;
  maxDelayMs: number;
  request: Request;
  retryPlan: RetryPlan;
}

async function executeRetryLoop({
  baseDelayMs,
  baseFetch,
  deadline,
  jitter,
  maxAttempts,
  maxDelayMs,
  request,
  retryPlan,
}: RetryLoopOptions): Promise<Response> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    const current = retryPlan.createRequest();

    try {
      const response = await baseFetch(current);
      if (!retryPlan.canRetry || attempt === maxAttempts - 1 || !(await shouldRetryResponse(response, request))) {
        return response;
      }

      const delay = retryDelay({ attempt, baseDelayMs, headers: response.headers, jitter, maxDelayMs });
      if (delay > MAX_TIMER_DELAY_MS || Date.now() + delay >= deadline) return response;
      try {
        await sleep({ ms: delay, signal: request.signal });
      } catch (error) {
        await discardResponseBody(response);
        throw error;
      }
      if (Date.now() >= deadline) return response;
      await discardResponseBody(response);
    } catch (error) {
      lastError = error;
      if (isAbortError(error, request) || !retryPlan.canRetry || attempt === maxAttempts - 1) {
        throw error;
      }

      const delay = retryDelay({ attempt, baseDelayMs, jitter, maxDelayMs });
      if (delay > MAX_TIMER_DELAY_MS || Date.now() + delay >= deadline) throw error;
      await sleep({ ms: delay, signal: request.signal });
      if (Date.now() >= deadline) throw error;
    }

    attempt += 1;
  }

  throw lastError;
}

async function createRetryPlan(
  request: Request,
  maxReplayBodyBytes: number,
  replayBodies?: WeakMap<Request, string>,
): Promise<RetryPlan> {
  if (!isRetryableRequest(request)) {
    return singleUseRetryPlan(request, "A non-retryable request cannot be replayed");
  }

  if (request.method.toUpperCase() === "POST" && request.body) {
    const body = replayBodies?.get(request) ?? (await readBoundedTextBody(request, maxReplayBodyBytes));
    if (body === undefined) {
      return singleUseRetryPlan(request, "A request body above the retry replay limit cannot be replayed");
    }

    return {
      canRetry: true,
      createRequest: () => new Request(request, { body }),
    };
  }

  return {
    canRetry: true,
    createRequest: () => request.clone(),
  };
}

function singleUseRetryPlan(request: Request, replayErrorMessage: string): RetryPlan {
  let used = false;
  return {
    canRetry: false,
    createRequest: () => {
      if (used) {
        throw new TypeError(replayErrorMessage);
      }

      used = true;
      return request;
    },
  };
}

async function readBoundedTextBody(request: Request, maxBytes: number): Promise<string | undefined> {
  const reader = request.clone().body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel();
        return undefined;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort cleanup before retrying; a locked or already-read body can be ignored.
  }
}

function isAbortError(error: unknown, request: Request): boolean {
  return request.signal.aborted || (error instanceof Error && error.name === "AbortError");
}

function sleep({ ms, signal }: { ms: number; signal: AbortSignal }): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
