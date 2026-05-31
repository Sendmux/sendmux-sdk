from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, cast

import pytest

from sendmux_core import RetryOptions, SendmuxApiError, iter_cursor_pages, validate_api_key
from sendmux_core.errors import map_api_exception
from sendmux_core.headers import conditional_headers, idempotency_headers
from sendmux_core.pagination import CursorResponse
from sendmux_core.retry import RetryingRestClient


def test_api_key_prefix_validation() -> None:
    validate_api_key("smx_root_123", surface="root")
    validate_api_key("smx_mbx_123", surface="mailbox")

    with pytest.raises(ValueError):
        validate_api_key("smx_mbx_123", surface="root")


def test_headers() -> None:
    assert idempotency_headers("idem_123") == {"Idempotency-Key": "idem_123"}
    assert conditional_headers(if_match='"v1"', if_none_match='"v0"') == {
        "If-Match": '"v1"',
        "If-None-Match": '"v0"',
    }


def test_cursor_iteration() -> None:
    @dataclass(frozen=True)
    class Pagination:
        has_more: bool
        next_cursor: str | None

    @dataclass(frozen=True)
    class Response:
        data: list[int]
        pagination: Pagination

    pages: dict[str | None, CursorResponse[int]] = {
        None: cast(CursorResponse[int], Response([1, 2], Pagination(True, "next"))),
        "next": cast(CursorResponse[int], Response([3], Pagination(False, None))),
    }

    assert list(iter_cursor_pages(lambda cursor: pages[cursor])) == [1, 2, 3]


def test_cursor_iteration_rejects_missing_next_cursor() -> None:
    @dataclass(frozen=True)
    class Pagination:
        has_more: bool
        next_cursor: str | None

    @dataclass(frozen=True)
    class Response:
        data: list[int]
        pagination: Pagination

    with pytest.raises(RuntimeError):
        list(iter_cursor_pages(lambda _cursor: cast(CursorResponse[int], Response([], Pagination(True, None)))))


def test_cursor_iteration_rejects_repeated_next_cursor() -> None:
    @dataclass(frozen=True)
    class Pagination:
        has_more: bool
        next_cursor: str | None

    @dataclass(frozen=True)
    class Response:
        data: list[int]
        pagination: Pagination

    pages: dict[str | None, CursorResponse[int]] = {
        None: cast(CursorResponse[int], Response([], Pagination(True, "same"))),
        "same": cast(CursorResponse[int], Response([], Pagination(True, "same"))),
    }

    with pytest.raises(RuntimeError):
        list(iter_cursor_pages(lambda cursor: pages[cursor]))


def test_error_mapping_from_json_body() -> None:
    class GeneratedException(Exception):
        status = 429
        reason = "Too Many Requests"
        body = json.dumps(
            {
                "ok": False,
                "error": {
                    "code": "rate_limited",
                    "message": "Slow down.",
                    "retryable": True,
                },
                "meta": {"request_id": "req_body"},
            }
        )
        data = None
        headers = {"X-Request-Id": "req_123"}

    mapped = map_api_exception(GeneratedException())

    assert isinstance(mapped, SendmuxApiError)
    assert mapped.status_code == 429
    assert mapped.code == "rate_limited"
    assert mapped.message == "Slow down."
    assert mapped.retryable is True
    assert mapped.request_id == "req_body"


def test_retry_honours_retry_after_for_idempotent_post() -> None:
    sleeps: list[float] = []

    class Response:
        def __init__(self, status: int) -> None:
            self.status = status
            self.headers = {"Retry-After": "1"}
            self.response = self

        def release_conn(self) -> None:
            return None

    class Inner:
        def __init__(self) -> None:
            self.calls = 0

        def request(self, _method: str, _url: str, **_kwargs: Any) -> Response:
            self.calls += 1
            return Response(429 if self.calls == 1 else 200)

    inner = Inner()
    client = RetryingRestClient(
        inner,
        retry_options=RetryOptions(max_attempts=2, sleep=sleeps.append),
    )

    response = client.request("POST", "https://example.test", headers={"Idempotency-Key": "idem"})

    assert response.status == 200
    assert inner.calls == 2
    assert sleeps == [1.0]


def test_retry_does_not_retry_non_idempotent_post() -> None:
    class Response:
        status = 429
        headers: dict[str, str] = {}

    class Inner:
        calls = 0

        def request(self, _method: str, _url: str, **_kwargs: Any) -> Response:
            self.calls += 1
            return Response()

    inner = Inner()
    client = RetryingRestClient(inner, retry_options=RetryOptions(max_attempts=2, sleep=lambda _: None))

    assert client.request("POST", "https://example.test").status == 429
    assert inner.calls == 1


def test_retry_does_not_retry_delete_by_default() -> None:
    class Response:
        status = 429
        headers: dict[str, str] = {}

    class Inner:
        calls = 0

        def request(self, _method: str, _url: str, **_kwargs: Any) -> Response:
            self.calls += 1
            return Response()

    inner = Inner()
    client = RetryingRestClient(inner, retry_options=RetryOptions(max_attempts=2, sleep=lambda _: None))

    assert client.request("DELETE", "https://example.test").status == 429
    assert inner.calls == 1
