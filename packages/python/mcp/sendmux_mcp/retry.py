from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from sendmux_mcp.config import RetryConfig

RETRY_STATUSES = {408, 425, 429, 500, 502, 503, 504}
IDEMPOTENT_METHODS = {"GET", "HEAD", "OPTIONS", "PUT", "DELETE"}
SleepHook = Callable[[float], Awaitable[None] | None]


class RetryingAsyncTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        *,
        retry: RetryConfig,
        inner: httpx.AsyncBaseTransport | None = None,
        sleep: SleepHook | None = None,
    ) -> None:
        self.retry = retry
        self.inner = inner or httpx.AsyncHTTPTransport()
        self._sleep = sleep

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = await request.aread()
        attempts = max(1, self.retry.max_attempts)
        last_error: httpx.TransportError | None = None

        for attempt in range(attempts):
            next_request = clone_request(request, body)
            try:
                response = await self.inner.handle_async_request(next_request)
            except httpx.TransportError as exc:
                last_error = exc
                if attempt + 1 >= attempts or not can_retry_request(request):
                    raise
                await self.sleep(delay_for_attempt(attempt, self.retry))
                continue

            if attempt + 1 >= attempts or not should_retry_response(request, response):
                return response

            delay = retry_delay(response, attempt, self.retry)
            await response.aclose()
            await self.sleep(delay)

        if last_error is not None:
            raise last_error
        raise RuntimeError("retry loop exited without response")

    async def aclose(self) -> None:
        await self.inner.aclose()

    async def sleep(self, seconds: float) -> None:
        if seconds <= 0:
            return
        if self._sleep is not None:
            result = self._sleep(seconds)
            if result is not None:
                await result
            return
        await asyncio.sleep(seconds)


def clone_request(request: httpx.Request, body: bytes) -> httpx.Request:
    return httpx.Request(
        method=request.method,
        url=request.url,
        headers=request.headers,
        content=body,
        extensions=request.extensions,
    )


def should_retry_response(request: httpx.Request, response: httpx.Response) -> bool:
    return response.status_code in RETRY_STATUSES and can_retry_request(request)


def can_retry_request(request: httpx.Request) -> bool:
    if request.method.upper() in IDEMPOTENT_METHODS:
        return True
    return request.method.upper() == "POST" and "Idempotency-Key" in request.headers


def retry_delay(response: httpx.Response, attempt: int, retry: RetryConfig) -> float:
    retry_after = parse_retry_after(response.headers.get("Retry-After"))
    if retry_after is not None:
        return min(retry_after, retry.max_delay_seconds)

    reset = parse_rate_limit_reset(response.headers.get("X-RateLimit-Reset"))
    if reset is not None:
        return min(reset, retry.max_delay_seconds)

    return delay_for_attempt(attempt, retry)


def delay_for_attempt(attempt: int, retry: RetryConfig) -> float:
    cap = min(retry.max_delay_seconds, retry.base_delay_seconds * (2**attempt))
    return random.uniform(0, cap)


def parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            target = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return max(0.0, (target - datetime.now(timezone.utc)).total_seconds())


def parse_rate_limit_reset(value: str | None) -> float | None:
    if not value:
        return None
    try:
        target = float(value)
    except ValueError:
        return None
    return max(0.0, target - datetime.now(timezone.utc).timestamp())
