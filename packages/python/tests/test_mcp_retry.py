from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastmcp import Client

import sendmux_mcp.retry as retry_module
from sendmux_mcp.cli import config_from_args, parser
from sendmux_mcp.config import RetryConfig, ServerConfig, Surface
from sendmux_mcp.retry import RetryingAsyncTransport
from sendmux_mcp.server import create_server
from sendmux_mcp.verification import structured_result


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
            "ok": True, "data": {"id": "sub_test", "status": "queued"},
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
        assert result.isError is True
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
        assert result.isError is True
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
