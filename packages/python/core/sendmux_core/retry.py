from __future__ import annotations

import random
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Mapping


@dataclass(frozen=True)
class RetryOptions:
    max_attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 4.0
    sleep: Callable[[float], None] = time.sleep


class RetryingRestClient:
    def __init__(self, inner: Any, *, retry_options: RetryOptions | None = None) -> None:
        self._inner = inner
        self._options = retry_options or RetryOptions()

    def request(self, method: str, url: str, **kwargs: Any) -> Any:
        attempt = 1
        while True:
            response = self._inner.request(method, url, **kwargs)
            if not self._should_retry(method, kwargs.get("headers") or {}, response, attempt):
                return response

            delay = self._delay_seconds(response.headers, attempt)
            _release_response(response)
            self._options.sleep(delay)
            attempt += 1

    def _should_retry(self, method: str, headers: Mapping[str, str], response: Any, attempt: int) -> bool:
        if attempt >= self._options.max_attempts:
            return False
        if response.status not in {408, 409, 425, 429, 500, 502, 503, 504}:
            return False
        method = method.upper()
        if method in {"GET", "HEAD", "OPTIONS"}:
            return True
        return method == "POST" and _header(headers, "idempotency-key") is not None

    def _delay_seconds(self, headers: Mapping[str, str], attempt: int) -> float:
        retry_after = _retry_after_seconds(_header(headers, "retry-after"))
        if retry_after is not None:
            return min(retry_after, self._options.max_delay_seconds)

        rate_limit_reset = _rate_limit_reset_seconds(_header(headers, "x-ratelimit-reset"))
        if rate_limit_reset is not None:
            return min(rate_limit_reset, self._options.max_delay_seconds)

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
