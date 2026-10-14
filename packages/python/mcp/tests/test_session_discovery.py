from __future__ import annotations

import asyncio
import copy
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastmcp import Client

from sendmux_mcp.config import ServerConfig
from sendmux_mcp.server import create_server

FIXTURE = json.loads((Path(__file__).parents[4] / "scripts/fixtures/mailbox-session-discovery.json").read_text())


async def call_session(payload: dict[str, Any]) -> dict[str, Any]:
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/api/v1/mailbox/session"
        return httpx.Response(200, json=payload, request=request)

    server = create_server(
        ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_discovery_test"),
        transport=httpx.MockTransport(respond),
    )
    app = server.http_app(path="/mcp", stateless_http=True, json_response=True)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://mcp.sendmux.ai") as client:
            response = await client.post(
                "/mcp",
                headers={"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "mailbox_get_session"},
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "mailbox_get_session", "arguments": {}, "_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}}},
            )
    assert response.status_code == 200
    return response.json()["result"]


def test_session_call_preserves_advertised_30_day_horizon() -> None:
    result = asyncio.run(call_session(copy.deepcopy(FIXTURE)))
    assert result.get("isError", False) is False, result
    content = result["structuredContent"]
    assert content.get("result", content)["data"]["limits"]["draft_schedule_days_max"] == 30


def test_session_tool_discovery_declares_horizon() -> None:
    async def inspect() -> None:
        server = create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_discovery_test"), transport=httpx.MockTransport(lambda request: httpx.Response(500)))
        async with Client(server) as client:
            tools = await client.list_tools()
        tool = next(tool for tool in tools if tool.name == "mailbox_get_session")
        assert tool.output_schema is not None
        data = next(part["properties"]["data"] for part in tool.output_schema["properties"]["result"]["allOf"] if "data" in part.get("properties", {}))
        limits = data["properties"]["limits"]
        assert "draft_schedule_days_max" in limits["properties"]
        assert limits["properties"]["draft_schedule_days_max"]["enum"] == [30]
        assert limits["properties"]["draft_schedule_days_max"]["type"] == "integer"
        assert "draft_schedule_days_max" in limits["required"]

    asyncio.run(inspect())


@pytest.mark.parametrize("invalid", ["missing", "wrong", "undeclared"])
def test_session_call_keeps_strict_limit_validation(invalid: str) -> None:
    payload = copy.deepcopy(FIXTURE)
    if invalid == "missing":
        del payload["data"]["limits"]["draft_schedule_days_max"]
    elif invalid == "wrong":
        payload["data"]["limits"]["draft_schedule_days_max"] = 31
    else:
        payload["data"]["limits"]["unexpected"] = True
    result = asyncio.run(call_session(payload))
    assert result.get("isError", False) is True
    assert "does not match its declared output schema" in result["content"][0]["text"]
