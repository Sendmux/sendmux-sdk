from __future__ import annotations

import asyncio
import random
import time
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import anyio
import httpx

from sendmux_mcp.config import RetryConfig
from sendmux_mcp.response_ownership import close_response, own_response

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
        deadline = (
            float("inf") if self.retry.max_elapsed_seconds is None
            else time.monotonic() + max(0.0, self.retry.max_elapsed_seconds)
        )
        body = await request.aread()
        attempts = max(1, self.retry.max_attempts)
        last_error: httpx.TransportError | None = None

        for attempt in range(attempts):
            await anyio.lowlevel.checkpoint_if_cancelled()
            next_request = clone_request(request, body)
            try:
                response = await self.inner.handle_async_request(next_request)
            except httpx.TransportError as exc:
                last_error = exc
                if attempt + 1 >= attempts or not can_retry_request(request):
                    raise
                if not await self._wait_for_retry(delay_for_attempt(attempt, self.retry), deadline):
                    raise
                continue

            own_response(response)
            try:
                if attempt + 1 >= attempts or not await should_retry_response(request, response):
                    return response

                delay = retry_delay(response, attempt, self.retry)
                await response.aread()
                await close_response(response)
            except BaseException:
                with suppress(TimeoutError):
                    await close_response(response)
                raise
            if not await self._wait_for_retry(delay, deadline):
                return response

        if last_error is not None:
            raise last_error
        raise RuntimeError("retry loop exited without response")

    async def aclose(self) -> None:
        await self.inner.aclose()

    async def _wait_for_retry(self, delay: float, deadline: float) -> bool:
        if time.monotonic() + delay >= deadline:
            return False
        await self.sleep(delay)
        return time.monotonic() < deadline

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


async def should_retry_response(request: httpx.Request, response: httpx.Response) -> bool:
    if response.status_code not in RETRY_STATUSES or not can_retry_request(request):
        return False
    if "application/json" not in response.headers.get("Content-Type", "").lower():
        return True
    await response.aread()
    try:
        payload = response.json()
    except (ValueError, UnicodeDecodeError):
        return True
    return not (
        isinstance(payload, dict) and payload.get("ok") is False
        and isinstance(payload.get("error"), dict) and payload["error"].get("retryable") is False
    )


def can_retry_request(request: httpx.Request) -> bool:
    if request.method.upper() in IDEMPOTENT_METHODS:
        return True
    return request.method.upper() == "POST" and "Idempotency-Key" in request.headers


def retry_delay(response: httpx.Response, attempt: int, retry: RetryConfig) -> float:
    retry_after = parse_retry_after(response.headers.get("Retry-After"))
    if retry_after is not None:
        return retry_after

    reset = parse_rate_limit_reset(response.headers.get("X-RateLimit-Reset"))
    if reset is not None:
        return reset

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
