from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import anyio
import httpx
import httpx2
import pytest
from fastmcp import Client

import sendmux_mcp.retry as retry_module
from sendmux_mcp.cli import config_from_args, parser
from sendmux_mcp.config import RetryConfig, ServerConfig, Surface
from sendmux_mcp.retry import RetryingAsyncTransport
from sendmux_mcp.server import MCPHTTPTransport, create_server
from sendmux_mcp.verification import structured_result


class CancellingRetryBodyStream(httpx.AsyncByteStream):
    def __init__(self, cancel_scope: anyio.CancelScope) -> None:
        self.cancel_scope = cancel_scope
        self.close_started = False
        self.close_finished = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        self.cancel_scope.cancel()
        await anyio.sleep(0)
        yield b'{"ok":false,"error":{"retryable":true}}'

    async def aclose(self) -> None:
        self.close_started = True
        await anyio.sleep(0)
        self.close_finished = True


class FailingRetryBodyStream(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.close_started = False
        self.close_finished = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        raise RuntimeError("retry body failed")
        yield b""

    async def aclose(self) -> None:
        self.close_started = True
        await anyio.sleep(0)
        self.close_finished = True


class HangingRetryBodyStream(httpx.AsyncByteStream):
    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield b'{"ok":false,"error":{"retryable":true}}'

    async def aclose(self) -> None:
        await anyio.sleep_forever()


def retry_chain(inner: httpx.AsyncBaseTransport) -> MCPHTTPTransport:
    retrying = RetryingAsyncTransport(
        retry=RetryConfig(max_attempts=2, base_delay_seconds=0, max_delay_seconds=0),
        inner=inner,
    )
    return MCPHTTPTransport(httpx.AsyncClient(transport=retrying))


def test_retry_chain_finishes_503_body_close_during_cancellation() -> None:
    async def check() -> None:
        attempts = 0
        with anyio.CancelScope() as cancel_scope:
            stream = CancellingRetryBodyStream(cancel_scope)

            def handler(request: httpx.Request) -> httpx.Response:
                nonlocal attempts
                attempts += 1
                return httpx.Response(
                    503,
                    headers={"Content-Type": "application/json"},
                    stream=stream,
                    request=request,
                )

            transport = retry_chain(httpx.MockTransport(handler))
            await transport.handle_async_request(httpx2.Request("GET", "https://app.sendmux.ai/api/v1/me"))

        close_finished_during_request = stream.close_finished
        await transport.aclose()
        assert attempts == 1
        assert stream.close_started
        assert close_finished_during_request

    anyio.run(check)


def test_retry_chain_closes_503_response_when_body_read_fails() -> None:
    async def check() -> None:
        stream = FailingRetryBodyStream()
        transport = retry_chain(
            httpx.MockTransport(
                lambda request: httpx.Response(
                    503,
                    headers={"Content-Type": "application/json"},
                    stream=stream,
                    request=request,
                )
            )
        )

        with pytest.raises(RuntimeError, match="retry body failed"):
            await transport.handle_async_request(httpx2.Request("GET", "https://app.sendmux.ai/api/v1/me"))

        await transport.aclose()
        assert stream.close_started
        assert stream.close_finished

    anyio.run(check)


def test_retry_chain_reports_bounded_503_response_close_timeout(monkeypatch: Any) -> None:
    async def check() -> None:
        monkeypatch.setattr("sendmux_mcp.response_ownership.RESPONSE_CLOSE_TIMEOUT_SECONDS", 0.01)
        transport = retry_chain(
            httpx.MockTransport(
                lambda request: httpx.Response(
                    503,
                    headers={"Content-Type": "application/json"},
                    stream=HangingRetryBodyStream(),
                    request=request,
                )
            )
        )

        with anyio.fail_after(0.2):
            with pytest.raises(TimeoutError, match="Timed out while closing"):
                await transport.handle_async_request(httpx2.Request("GET", "https://app.sendmux.ai/api/v1/me"))

        await transport.aclose()

    anyio.run(check)


@pytest.mark.parametrize("headers", [
    {"Retry-After": "120"},
    {"Retry-After": "Wed, 09 Sep 2026 00:02:00 GMT"},
    {"X-RateLimit-Reset": "1788912120"},
])
def test_mcp_send_waits_for_server_delay_without_capping(
    headers: dict[str, str], monkeypatch: Any,
) -> None:
    requests: list[httpx.Request] = []
    delays: list[float] = []

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> FrozenDatetime:
            return cls(2026, 9, 9, tzinfo=timezone.utc)

    async def sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr(retry_module, "asyncio", SimpleNamespace(sleep=sleep))
    monkeypatch.setattr(retry_module, "datetime", FrozenDatetime)

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(429, headers=headers, json={
                "ok": False,
                "error": {"code": "rate_limited", "message": "Retry later.", "retryable": True},
                "meta": {"request_id": "req_test"},
            })
        return httpx.Response(200, json={
            "ok": True, "data": {"message_id": "sub_test", "status": "queued"},
            "meta": {"request_id": "req_test"},
        })

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test", retry=RetryConfig(max_attempts=2)),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(await client.call_tool("mailbox_send_message", {
                "Idempotency-Key": "mcp-retry-test", "subject": "Retry test",
                "text_body": "Retry test.", "to": [{"email": "agent@example.com", "name": None}],
            }))
        assert result["ok"] is True

    asyncio.run(check())
    assert delays == [120.0]
    assert len(requests) == 2
    assert all(request.headers["Idempotency-Key"] == "mcp-retry-test" for request in requests)
    assert requests[0].content == requests[1].content


@pytest.mark.parametrize("configuration", ["python", "environment", "cli"])
def test_mcp_deadline_returns_original_error_without_early_retry(
    configuration: str, monkeypatch: Any,
) -> None:
    requests: list[httpx.Request] = []
    delays: list[float] = []

    async def sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr(retry_module, "asyncio", SimpleNamespace(sleep=sleep))
    monkeypatch.setattr(retry_module, "time", SimpleNamespace(monotonic=lambda: 1000.0), raising=False)
    if configuration == "python":
        config = ServerConfig(
            surfaces=("management",), api_key="smx_root_test", retry=RetryConfig(max_elapsed_seconds=30),
        )
    else:
        arguments = ["--api-key", "smx_root_test"]
        if configuration == "environment":
            monkeypatch.setenv("SENDMUX_MCP_RETRY_MAX_ELAPSED_SECONDS", "30")
        else:
            arguments.extend(["--retry-max-elapsed-seconds", "30"])
        config = config_from_args(("management",), parser(prog="sendmux-mcp").parse_args(arguments))

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(429, headers={"Retry-After": "120"}, json={
            "ok": False,
            "error": {"code": "rate_limited", "message": "Retry later.", "retryable": True},
            "meta": {"request_id": "req_deadline"},
        })

    async def check() -> None:
        server = create_server(config, transport=httpx.MockTransport(handler))
        async with Client(server) as client:
            result = await client.call_tool_mcp("management_get_connection", {})
        assert len(requests) == 1
        assert delays == []
        assert result.is_error is True
        assert "rate_limited" in str(result.content)
        assert "req_deadline" in str(result.content)

    asyncio.run(check())


@pytest.mark.parametrize("surface", ["mailbox", "management", "sending"])
def test_mcp_connection_does_not_retry_explicit_terminal_error(surface: Surface) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(429, headers={"Retry-After": "0"}, json={
            "ok": False,
            "error": {"code": "rate_limited", "message": "Retry later.", "retryable": False},
            "meta": {"request_id": "req_original"},
        })

    async def check() -> None:
        server = create_server(
            ServerConfig(
                surfaces=(surface,), api_key="smx_root_test" if surface == "management" else "smx_mbx_test",
                retry=RetryConfig(max_attempts=3, base_delay_seconds=0, max_delay_seconds=0),
            ),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = await client.call_tool_mcp(f"{surface}_get_connection", {})
        assert len(requests) == 1
        assert result.is_error is True
        assert "rate_limited" in str(result.content)
        assert "req_original" in str(result.content)

    asyncio.run(check())


@pytest.mark.parametrize("content_type,payload", [
    ("application/json", b'{"ok":false,"error":{"code":"unavailable","retryable":true}}'),
    ("text/plain", b"Temporarily unavailable."),
])
def test_expired_retry_budget_preserves_original_response(
    content_type: str, payload: bytes, monkeypatch: Any,
) -> None:
    now = [1000.0]
    requests: list[httpx.Request] = []
    delays: list[float] = []
    monkeypatch.setattr(retry_module, "time", SimpleNamespace(monotonic=lambda: now[0]))

    async def sleep(seconds: float) -> None:
        delays.append(seconds)
        now[0] += 30

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) > 1:
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(503, content=payload, headers={
            "Content-Type": content_type, "Retry-After": "10", "X-Request-Id": "req_expired",
        })

    async def check() -> None:
        transport = RetryingAsyncTransport(
            retry=RetryConfig(max_attempts=2, max_elapsed_seconds=20),
            inner=httpx.MockTransport(handler), sleep=sleep,
        )
        async with httpx.AsyncClient(transport=transport) as client:
            response = await client.get("https://smtp.sendmux.ai/api/v1/me")
        assert response.status_code == 503
        assert response.content == payload
        assert response.headers["Retry-After"] == "10"
        assert response.headers["X-Request-Id"] == "req_expired"

    asyncio.run(check())
    assert len(requests) == 1
    assert delays == [10.0]


def test_exhausted_retry_budget_preserves_transport_error(monkeypatch: Any) -> None:
    requests: list[httpx.Request] = []
    delays: list[float] = []
    failure = httpx.ConnectError("Fixture transport failure.")
    monkeypatch.setattr(retry_module, "time", SimpleNamespace(monotonic=lambda: 1000.0), raising=False)

    async def sleep(seconds: float) -> None:
        delays.append(seconds)

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            raise failure
        return httpx.Response(200, json={"ok": True})

    async def check() -> None:
        transport = RetryingAsyncTransport(
            retry=RetryConfig(max_attempts=2, max_elapsed_seconds=0),
            inner=httpx.MockTransport(handler), sleep=sleep,
        )
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(httpx.ConnectError, match="Fixture transport failure") as raised:
                await client.get("https://smtp.sendmux.ai/api/v1/me")
        assert raised.value is failure

    asyncio.run(check())
    assert len(requests) == 1
    assert delays == []
