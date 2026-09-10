from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from io import BytesIO
from typing import Any, Callable, Mapping

from urllib3 import HTTPResponse
from urllib3.exceptions import NewConnectionError, ProtocolError, TimeoutError as HTTPTimeoutError


@dataclass(frozen=True)
class RetryOptions:
    max_attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 4.0
    sleep: Callable[[float], None] = time.sleep
    max_elapsed_seconds: float | None = None


class RetryingRestClient:
    def __init__(self, inner: Any, *, retry_options: RetryOptions | None = None) -> None:
        self._inner = inner
        self._options = retry_options or RetryOptions()

    def request(self, method: str, url: str, **kwargs: Any) -> Any:
        attempt = 1
        deadline = (
            float("inf") if self._options.max_elapsed_seconds is None
            else time.monotonic() + max(0.0, self._options.max_elapsed_seconds)
        )
        while True:
            try:
                response = self._inner.request(method, url, **kwargs)
            except (NewConnectionError, ProtocolError, HTTPTimeoutError):
                if (
                    attempt >= self._options.max_attempts
                    or not _retryable_request(method, kwargs.get("headers") or {})
                    or not self._wait_for_retry({}, attempt, deadline)
                ):
                    raise
                attempt += 1
                continue
            if not self._should_retry(method, kwargs.get("headers") or {}, response, attempt):
                return response

            if not self._wait_for_retry(response.headers, attempt, deadline):
                return response
            _release_response(response)
            attempt += 1

    def _wait_for_retry(self, headers: Mapping[str, str], attempt: int, deadline: float) -> bool:
        delay = self._delay_seconds(headers, attempt)
        if time.monotonic() + delay >= deadline:
            return False
        self._options.sleep(delay)
        return time.monotonic() < deadline

    def _should_retry(self, method: str, headers: Mapping[str, str], response: Any, attempt: int) -> bool:
        if attempt >= self._options.max_attempts or not _retryable_request(method, headers):
            return False
        if response.status not in {408, 409, 425, 429, 500, 502, 503, 504}:
            return False
        return not _nonretryable_error(response)

    def _delay_seconds(self, headers: Mapping[str, str], attempt: int) -> float:
        retry_after = _retry_after_seconds(_header(headers, "retry-after"))
        if retry_after is not None:
            return retry_after

        rate_limit_reset = _rate_limit_reset_seconds(_header(headers, "x-ratelimit-reset"))
        if rate_limit_reset is not None:
            return rate_limit_reset

        exponential = min(
            self._options.base_delay_seconds * (2 ** (attempt - 1)),
            self._options.max_delay_seconds,
        )
        return random.uniform(0, exponential)


def _header(headers: Mapping[str, str], name: str) -> str | None:
    name = name.lower()
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def _retryable_request(method: str, headers: Mapping[str, str]) -> bool:
    method = method.upper()
    return method in {"GET", "HEAD", "OPTIONS"} or (
        method == "POST" and _header(headers, "idempotency-key") is not None
    )


def _nonretryable_error(response: Any) -> bool:
    if "application/json" not in (_header(response.headers, "content-type") or "").lower():
        return False
    raw = response.response
    body = raw.read(decode_content=False)
    raw.release_conn()
    response.response = _buffered_response(raw, body)
    try:
        with _buffered_response(raw, body) as buffered:
            payload = json.loads(buffered.data)
    except (ValueError, TypeError):
        return False
    return (
        isinstance(payload, dict) and payload.get("ok") is False
        and isinstance(payload.get("error"), dict) and payload["error"].get("retryable") is False
    )


def _buffered_response(raw: HTTPResponse, body: bytes) -> HTTPResponse:
    return HTTPResponse(
        body=BytesIO(body), headers=raw.headers, status=raw.status,
        reason=raw.reason, version=raw.version, request_url=raw.url,
        retries=raw.retries, preload_content=False,
    )


def _retry_after_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(float(value), 0.0)
    except ValueError:
        try:
            return max(parsedate_to_datetime(value).timestamp() - time.time(), 0.0)
        except (TypeError, ValueError):
            return None


def _rate_limit_reset_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(float(value) - time.time(), 0.0)
    except ValueError:
        return None


def _release_response(response: Any) -> None:
    raw = getattr(response, "response", None)
    release_conn = getattr(raw, "release_conn", None)
    if callable(release_conn):
        release_conn()
