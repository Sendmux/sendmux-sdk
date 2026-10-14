from __future__ import annotations

import asyncio
import copy
from typing import Any

import httpx
import pytest
from fastmcp.server.auth.providers.jwt import StaticTokenVerifier

from sendmux_mcp.config import ServerConfig
from sendmux_mcp.server import create_server

CHOICES: dict[str, Any] = {
    "origin_address": "origin@example.com",
    "from": {"addresses": ["sender@example.com"], "domains": ["example.com"]},
    "reply_to": {"addresses": ["reply@example.com"], "domains": ["example.org"]},
}


async def request_mcp(payload: dict[str, Any], *, permissions: tuple[str, ...] = ("email.send",), method: str = "tools/call", groups: list[str] | None = None) -> tuple[dict[str, Any], list[httpx.Request]]:
    captured: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json=payload, request=request)

    verifier = StaticTokenVerifier(tokens={"s12_access_token": {"client_id": "s12-test", "permissions": list(permissions), "surface": ["mailbox"]}})
    server = create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_discovery_test"), transport=httpx.MockTransport(respond), auth_provider=verifier)
    app = server.http_app(path="/mcp", stateless_http=True, json_response=True)
    arguments = {"delivery_group_id": groups} if groups is not None else {}
    params: dict[str, Any] = {"name": "mailbox_get_sender_choices", "arguments": arguments} if method == "tools/call" else {}
    params["_meta"] = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://mcp.sendmux.ai") as client:
            response = await client.post("/mcp", headers={"Authorization": "Bearer s12_access_token", "Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, "Mcp-Name": "mailbox_get_sender_choices"}, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    assert response.status_code == 200
    return response.json(), captured


def test_sender_choices_tool_discovery_exposes_bounded_query_and_strict_output() -> None:
    response, requests = asyncio.run(request_mcp({"ok": True, "meta": {"request_id": "req_sender_choices_test"}, "data": CHOICES}, method="tools/list"))
    tools = [tool for tool in response["result"]["tools"] if tool["name"] == "mailbox_get_sender_choices"]
    assert len(tools) == 1
    tool = tools[0]
    assert tool["inputSchema"]["properties"]["delivery_group_id"]["maxItems"] == 50
    assert tool["inputSchema"]["properties"]["delivery_group_id"]["description"]
    assert tool["outputSchema"]
    assert tool["annotations"]["readOnlyHint"] is True
    assert tool["annotations"]["destructiveHint"] is False
    assert requests == []


@pytest.mark.parametrize("populated", [True, False])
def test_sender_choices_call_preserves_choices_and_repeated_group_query(populated: bool) -> None:
    choices = copy.deepcopy(CHOICES)
    groups = ["group-one", "group-two"] if populated else None
    if not populated:
        choices["from"] = {"addresses": [], "domains": []}
        choices["reply_to"] = {"addresses": [], "domains": []}
    response, requests = asyncio.run(request_mcp({"ok": True, "meta": {"request_id": "req_sender_choices_test"}, "data": choices}, groups=groups))
    result = response["result"]
    assert result.get("isError", False) is False, result
    content = result["structuredContent"]
    assert content.get("result", content)["data"] == choices
    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert requests[0].url.path == "/api/v1/mailbox/sender-choices"
    assert requests[0].url.params.get_list("delivery_group_id") == (groups or [])


@pytest.mark.parametrize("invalid", ["missing", "wrong", "undeclared"])
def test_sender_choices_call_rejects_invalid_structured_output(invalid: str) -> None:
    choices = copy.deepcopy(CHOICES)
    if invalid == "missing":
        del choices["reply_to"]
    elif invalid == "wrong":
        choices["from"]["domains"] = "example.com"
    else:
        choices["from"]["unexpected"] = True
    response, _ = asyncio.run(request_mcp({"ok": True, "meta": {"request_id": "req_sender_choices_test"}, "data": choices}))
    result = response["result"]
    assert result.get("isError", False) is True
    assert "does not match its declared output schema" in result["content"][0]["text"]


def test_sender_choices_requires_send_permission_for_discovery_and_call() -> None:
    response, requests = asyncio.run(request_mcp({"ok": True, "meta": {"request_id": "req_sender_choices_test"}, "data": CHOICES}, permissions=("mailbox.read",), method="tools/list"))
    assert "mailbox_get_sender_choices" not in {tool["name"] for tool in response["result"]["tools"]}
    assert requests == []
    response, requests = asyncio.run(request_mcp({"ok": True, "meta": {"request_id": "req_sender_choices_test"}, "data": CHOICES}, permissions=("mailbox.read",)))
    assert response.get("error") is not None or response["result"].get("isError", False) is True
    assert requests == []
