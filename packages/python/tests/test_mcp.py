from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from fastmcp import Client

from sendmux_mcp.cli import parser, surfaces_from_args
from sendmux_mcp.config import RetryConfig, ServerConfig
from sendmux_mcp.security import middleware_for_config
from sendmux_mcp.server import create_server
from sendmux_mcp.verification import structured_result


def test_toolsets_are_curated_and_key_split() -> None:
    async def check() -> None:
        mailbox = create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"), transport=ok_transport())
        management = create_server(
            ServerConfig(surfaces=("management",), api_key="smx_root_test"), transport=ok_transport()
        )
        sending = create_server(ServerConfig(surfaces=("sending",), api_key="smx_mbx_test"), transport=ok_transport())

        async with Client(mailbox) as client:
            mailbox_tools = await client.list_tools()
        async with Client(management) as client:
            management_tools = await client.list_tools()
        async with Client(sending) as client:
            sending_tools = await client.list_tools()

        mailbox_names = {tool.name for tool in mailbox_tools}
        management_names = {tool.name for tool in management_tools}
        sending_names = {tool.name for tool in sending_tools}

        assert 10 <= len(mailbox_names) <= 20
        assert 10 <= len(management_names) <= 20
        assert sending_names == {"sending_send_email", "sending_send_email_batch"}

        assert "mailbox_send_message" in mailbox_names
        assert "mailbox_list_messages" in mailbox_names
        assert "management_create_mailbox_key" in management_names
        assert "management_list_domains" in management_names
        assert "sending_get_open_api_spec" not in sending_names

        assert not any(name.startswith("management_") or name.startswith("sending_") for name in mailbox_names)
        assert not any(name.startswith("mailbox_") or name.startswith("sending_") for name in management_names)
        assert not any(name.startswith("mailbox_") or name.startswith("management_") for name in sending_names)

        for tool in [*mailbox_tools, *management_tools, *sending_tools]:
            assert tool.description
            assert not tool.description.startswith("Executes ")

    asyncio.run(check())


def test_selected_surface_composition_exposes_exact_curated_tools() -> None:
    async def check() -> None:
        mailbox_sending = create_server(
            ServerConfig(
                surfaces=("mailbox", "sending"),
                api_keys={
                    "mailbox": "smx_mbx_mailbox",
                    "sending": "smx_mbx_sending",
                },
            ),
            transport=ok_transport(),
        )
        all_surfaces = create_server(
            ServerConfig(
                surfaces=("mailbox", "management", "sending"),
                api_keys={
                    "mailbox": "smx_mbx_mailbox",
                    "management": "smx_root_management",
                    "sending": "smx_mbx_sending",
                },
            ),
            transport=ok_transport(),
        )
        management = create_server(
            ServerConfig(surfaces=("management",), api_key="smx_root_test"), transport=ok_transport()
        )

        async with Client(mailbox_sending) as client:
            mailbox_sending_names = {tool.name for tool in await client.list_tools()}
        async with Client(all_surfaces) as client:
            all_names = {tool.name for tool in await client.list_tools()}
        async with Client(management) as client:
            management_names = {tool.name for tool in await client.list_tools()}

        assert "mailbox_list_messages" in mailbox_sending_names
        assert "sending_send_email" in mailbox_sending_names
        assert not any(name.startswith("management_") for name in mailbox_sending_names)

        assert "mailbox_list_messages" in all_names
        assert "management_list_domains" in all_names
        assert "sending_send_email" in all_names
        assert len(all_names) == len(mailbox_sending_names) + len(management_names)

    asyncio.run(check())


def test_wrong_key_prefix_rejected_before_server_start() -> None:
    with pytest.raises(ValueError):
        create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_root_test"), transport=ok_transport())

    with pytest.raises(ValueError):
        create_server(ServerConfig(surfaces=("management",), api_key="smx_mbx_test"), transport=ok_transport())

    with pytest.raises(ValueError):
        create_server(ServerConfig(surfaces=("sending",), api_key="smx_root_test"), transport=ok_transport())

    with pytest.raises(ValueError):
        create_server(
            ServerConfig(
                surfaces=("management", "sending"),
                api_key="smx_root_test",
            ),
            transport=ok_transport(),
        )


def test_umbrella_cli_reads_surfaces_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENDMUX_MCP_SURFACES", "mailbox,sending")

    args = parser(prog="sendmux-mcp").parse_args([])

    assert surfaces_from_args(args) == ("mailbox", "sending")


def test_mailbox_tool_call_injects_bearer_auth() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": [],
                "pagination": {"has_more": False, "next_cursor": None},
                "meta": {"request_id": "req_test"},
            },
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(await client.call_tool("mailbox_list_messages", {"limit": 1}))

        assert result["ok"] is True

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert requests[0].url.path == "/api/v1/mailbox/messages"
    assert requests[0].headers["Authorization"] == "Bearer smx_mbx_test"


def test_retry_honours_retry_after_for_idempotent_mailbox_send() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(
                429,
                headers={"Retry-After": "0"},
                json={"ok": False, "error": {"code": "rate_limited", "message": "Retry later."}},
            )
        return httpx.Response(
            200,
            json={"ok": True, "data": {"id": "sub_test", "status": "queued"}, "meta": {"request_id": "req_test"}},
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(
                surfaces=("mailbox",),
                api_key="smx_mbx_test",
                retry=RetryConfig(max_attempts=2, base_delay_seconds=0, max_delay_seconds=0),
            ),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_send_message",
                    {
                        "Idempotency-Key": "mcp-test-idem",
                        "subject": "MCP retry test",
                        "text_body": "MCP retry test.",
                        "to": [{"email": "agent@example.com", "name": None}],
                    },
                )
            )

        assert result["ok"] is True

    asyncio.run(check())

    assert len(requests) == 2
    assert all(request.headers["Idempotency-Key"] == "mcp-test-idem" for request in requests)


def test_http_security_middleware_blocks_unauthorised_mcp_requests() -> None:
    config = ServerConfig(
        surfaces=("mailbox",),
        api_key="smx_mbx_test",
        transport="http",
        http_bearer_token="mcp-token",
        allowed_origins=("https://agent.example.com",),
    )
    server = create_server(config, transport=ok_transport())
    app = server.http_app(path="/mcp", middleware=middleware_for_config(config), stateless_http=True)

    async def check() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
            health = await client.get("/health")
            assert health.json() == {"status": "ok", "surfaces": ["mailbox"]}

            response = await client.post("/mcp", headers={"Origin": "https://agent.example.com"})
            assert response.status_code == 401
            assert response.json()["error"]["code"] == "unauthorised"

            response = await client.post(
                "/mcp",
                headers={"Authorization": "Bearer mcp-token", "Origin": "https://evil.example.com"},
            )
            assert response.status_code == 403
            assert response.json()["error"]["code"] == "origin_forbidden"

    asyncio.run(check())


def ok_transport() -> httpx.MockTransport:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True, "data": {}, "meta": {"request_id": "req_test"}})

    return httpx.MockTransport(handler)
