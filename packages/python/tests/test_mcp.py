from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

import httpx
import httpx2
import pytest
from fastmcp import Client
from jsonschema import Draft202012Validator

from sendmux_mcp.cli import parser, surfaces_from_args
from sendmux_mcp.config import RetryConfig, ServerConfig, Surface
from sendmux_mcp.curation import TOOLS_BY_SURFACE
from sendmux_mcp.hosted_proxy import (
    HostedOperationManifest,
    HostedOperationRoute,
    HostedProxyConfig,
    HostedProxyTransport,
    build_hosted_operation_manifest,
    path_template_pattern,
)
from sendmux_mcp.live_e2e import expected_api_error_exception
from sendmux_mcp.security import middleware_for_config
from sendmux_mcp.server import MCPHTTPTransport, create_server
from sendmux_mcp.specs import load_spec, prepare_for_fastmcp
from sendmux_mcp.verification import structured_result

EXPECTED_TOOL_NAMES_BY_SURFACE = {
    "mailbox": {
        "mailbox_get_connection",
        "mailbox_batch_delete_messages",
        "mailbox_batch_get_messages",
        "mailbox_batch_update_messages",
        "mailbox_count_messages",
        "mailbox_get_changes",
        "mailbox_get_attachment",
        "mailbox_get_identity",
        "mailbox_get_me",
        "mailbox_get_message",
        "mailbox_get_session",
        "mailbox_get_thread",
        "mailbox_list_body",
        "mailbox_list_content",
        "mailbox_list_folders",
        "mailbox_list_granted_mailboxes",
        "mailbox_list_identities",
        "mailbox_list_messages",
        "mailbox_list_thread_messages",
        "mailbox_list_threads",
        "mailbox_read_attachment",
        "mailbox_search_message_snippets",
        "mailbox_send_message",
        "mailbox_upload_attachment",
        "mailbox_update_identity",
        "mailbox_wait_for_message",
    },
    "management": {
        "management_get_connection",
        "management_check_mailbox_availability",
        "management_create_domain",
        "management_create_mailbox",
        "management_create_mailbox_key",
        "management_create_webhook",
        "management_delete_mailbox_key",
        "management_get_domain",
        "management_get_domain_zone_file",
        "management_get_email_log",
        "management_get_email_metrics",
        "management_get_mailbox",
        "management_get_spend_summary",
        "management_list_domains",
        "management_list_email_logs",
        "management_list_mailboxes",
        "management_list_webhooks",
        "management_resume_mailbox",
        "management_suspend_mailbox",
        "management_test_webhook",
        "management_update_mailbox",
        "management_verify_domain",
    },
    "sending": {
        "sending_get_connection",
        "sending_create_attachment_upload",
        "sending_get_attachment",
        "sending_send_email",
        "sending_send_email_batch",
        "sending_upload_attachment",
    },
}

READ_ONLY_TOOL_NAMES = {
    "mailbox_get_connection",
    "management_get_connection",
    "sending_get_connection",
    "mailbox_batch_get_messages",
    "mailbox_count_messages",
    "mailbox_get_changes",
    "mailbox_get_attachment",
    "mailbox_get_identity",
    "mailbox_get_me",
    "mailbox_get_message",
    "mailbox_get_session",
    "mailbox_get_thread",
    "mailbox_list_body",
    "mailbox_list_content",
    "mailbox_list_folders",
    "mailbox_list_granted_mailboxes",
    "mailbox_list_identities",
    "mailbox_list_messages",
    "mailbox_list_thread_messages",
    "mailbox_list_threads",
    "mailbox_read_attachment",
    "mailbox_wait_for_message",
    "mailbox_search_message_snippets",
    "management_get_domain",
    "management_get_domain_zone_file",
    "management_get_email_log",
    "management_get_email_metrics",
    "management_get_mailbox",
    "management_get_spend_summary",
    "management_check_mailbox_availability",
    "management_list_domains",
    "management_list_email_logs",
    "management_list_mailboxes",
    "management_list_webhooks",
    "sending_get_attachment",
}

DESTRUCTIVE_TOOL_NAMES = {
    "mailbox_batch_delete_messages",
    "management_delete_mailbox_key",
}

IDEMPOTENT_WRITE_TOOL_NAMES = {
    "mailbox_batch_update_messages",
    "mailbox_update_identity",
    "management_delete_mailbox_key",
    "management_resume_mailbox",
    "management_suspend_mailbox",
    "management_update_mailbox",
    "management_verify_domain",
}

NO_OUTPUT_SCHEMA_TOOL_NAMES = {
    "management_get_domain_zone_file",
}


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

        assert mailbox_names == {tool.name for tool in TOOLS_BY_SURFACE["mailbox"]}
        assert management_names == {tool.name for tool in TOOLS_BY_SURFACE["management"]}
        assert sending_names == {tool.name for tool in TOOLS_BY_SURFACE["sending"]}
        assert mailbox_names == EXPECTED_TOOL_NAMES_BY_SURFACE["mailbox"]
        assert management_names == EXPECTED_TOOL_NAMES_BY_SURFACE["management"]
        assert sending_names == EXPECTED_TOOL_NAMES_BY_SURFACE["sending"]

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


def test_curated_tools_have_complete_mcp_quality_metadata() -> None:
    async def check() -> None:
        servers = (
            create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"), transport=ok_transport()),
            create_server(ServerConfig(surfaces=("management",), api_key="smx_root_test"), transport=ok_transport()),
            create_server(ServerConfig(surfaces=("sending",), api_key="smx_mbx_test"), transport=ok_transport()),
        )
        tools = []
        for server in servers:
            async with Client(server) as client:
                tools.extend(await client.list_tools())

        assert len(tools) == 54
        assert {tool.name for tool in tools if tool.output_schema is None} == NO_OUTPUT_SCHEMA_TOOL_NAMES

        for tool in tools:
            annotations = tool.annotations
            assert annotations is not None, tool.name
            assert annotations.read_only_hint is (tool.name in READ_ONLY_TOOL_NAMES)
            assert annotations.destructive_hint is (tool.name in DESTRUCTIVE_TOOL_NAMES)
            assert annotations.idempotent_hint is (
                tool.name in READ_ONLY_TOOL_NAMES or tool.name in IDEMPOTENT_WRITE_TOOL_NAMES
            )
            assert annotations.open_world_hint is True
            if tool.output_schema is not None:
                assert tool.output_schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
                assert tool.output_schema != {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "additionalProperties": True,
                }

            properties = (tool.input_schema or {}).get("properties") or {}
            for property_name, schema in properties.items():
                assert isinstance(schema, dict), f"{tool.name}.{property_name}"
                assert str(schema.get("description") or "").strip(), f"{tool.name}.{property_name}"

    asyncio.run(check())


def test_prepare_for_fastmcp_preserves_json_schema_2020_12_constraints() -> None:
    document = {
        "openapi": "3.1.0",
        "paths": {},
        "components": {"schemas": {"Strict": {"type": "object", "unevaluatedProperties": False}}},
    }

    prepared = prepare_for_fastmcp(document, base_url="https://app.sendmux.ai/api/v1")

    assert prepared["components"]["schemas"]["Strict"]["unevaluatedProperties"] == {"not": {}}
    schema = prepared["components"]["schemas"]["Strict"]
    assert not list(Draft202012Validator(schema).iter_errors({}))
    assert list(Draft202012Validator(schema).iter_errors({"unexpected": True}))
    assert "servers" not in document


def test_prepare_for_fastmcp_preserves_nested_true_boolean_schema() -> None:
    document = {
        "openapi": "3.1.0",
        "paths": {},
        "components": {"schemas": {"Open": {"items": {"unevaluatedProperties": True}, "type": "array"}}},
    }

    prepared = prepare_for_fastmcp(document, base_url="https://app.sendmux.ai/api/v1")

    assert prepared["components"]["schemas"]["Open"]["items"]["unevaluatedProperties"] == {}
    schema = prepared["components"]["schemas"]["Open"]
    assert not list(Draft202012Validator(schema).iter_errors([{"unexpected": True}]))


def test_mcp_http_transport_closes_owned_httpx_client() -> None:
    async def check() -> None:
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, request=request)))
        transport = MCPHTTPTransport(client)

        await transport.aclose()

        assert client.is_closed

    asyncio.run(check())


def test_mcp_http_transport_propagates_upstream_errors() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("upstream unavailable")

    async def check() -> None:
        transport = MCPHTTPTransport(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        request = httpx2.Request("GET", "https://app.sendmux.ai/api/v1/me")
        with pytest.raises(httpx.ConnectError, match="upstream unavailable"):
            await transport.handle_async_request(request)
        await transport.aclose()

    asyncio.run(check())


def test_mcp_http_transport_propagates_cancellation() -> None:
    started = asyncio.Event()

    async def handler(_request: httpx.Request) -> httpx.Response:
        started.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    async def check() -> None:
        transport = MCPHTTPTransport(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        task = asyncio.create_task(
            transport.handle_async_request(httpx2.Request("GET", "https://app.sendmux.ai/api/v1/me"))
        )
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await transport.aclose()

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


def test_http_server_negotiates_modern_discovery_and_legacy_initialise() -> None:
    async def check() -> None:
        server = create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"), transport=ok_transport())
        app = server.http_app(path="/mcp", stateless_http=True, json_response=True)
        transport = httpx.ASGITransport(app=app)

        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
                modern = await client.post(
                    "/mcp",
                    headers={"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover"},
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "server/discover",
                        "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}},
                    },
                )
                modern_tools = await client.post(
                    "/mcp",
                    headers={"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/list"},
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/list",
                        "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}},
                    },
                )
                legacy = await client.post(
                    "/mcp",
                    headers={"Content-Type": "application/json", "MCP-Protocol-Version": "2025-11-25"},
                    json={"jsonrpc": "2.0", "id": 2, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}}},
                )

        assert modern.status_code == 200
        assert modern.json()["result"]["supportedVersions"] == ["2026-07-28"]
        assert modern.json()["result"]["ttlMs"] == 0
        assert modern.json()["result"]["cacheScope"] == "private"
        assert "mcp-session-id" not in modern.headers
        assert modern_tools.status_code == 200
        assert modern_tools.json()["result"]["ttlMs"] == 0
        assert modern_tools.json()["result"]["cacheScope"] == "private"
        assert "mcp-session-id" not in modern_tools.headers
        assert legacy.status_code == 200
        assert legacy.json()["result"]["protocolVersion"] == "2025-11-25"

    asyncio.run(check())


def test_wrong_key_prefix_rejected_before_server_start() -> None:
    with pytest.raises(ValueError):
        create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_root_test"), transport=ok_transport())

    create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_agent_test"), transport=ok_transport())

    with pytest.raises(ValueError):
        create_server(ServerConfig(surfaces=("management",), api_key="smx_mbx_test"), transport=ok_transport())

    with pytest.raises(ValueError):
        create_server(ServerConfig(surfaces=("sending",), api_key="smx_root_test"), transport=ok_transport())

    create_server(ServerConfig(surfaces=("sending",), api_key="smx_agent_test"), transport=ok_transport())

    with pytest.raises(ValueError):
        create_server(
            ServerConfig(
                surfaces=("management", "sending"),
                api_key="smx_root_test",
            ),
            transport=ok_transport(),
        )


def test_live_e2e_expected_error_parser_handles_literal_eval_type_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_type_error(_value: str) -> object:
        raise TypeError("malformed node or string")

    monkeypatch.setattr("sendmux_mcp.live_e2e.ast.literal_eval", raise_type_error)

    assert not expected_api_error_exception(
        Exception("upstream - {'ok': False, 'error': {'code': 'not_found'}, 'meta': {'request_id': 'req_test'}}"),
        ["not_found"],
    )


def test_live_e2e_expected_error_parser_accepts_matching_api_error() -> None:
    assert expected_api_error_exception(
        Exception("upstream - {'ok': False, 'error': {'code': 'not_found'}, 'meta': {'request_id': 'req_test'}}"),
        ["not_found"],
    )


def test_umbrella_cli_reads_surfaces_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENDMUX_MCP_SURFACES", "mailbox,sending")

    args = parser(prog="sendmux-mcp").parse_args([])

    assert surfaces_from_args(args) == ("mailbox", "sending")


@pytest.mark.parametrize("surface,api_key,endpoint", [
    ("management", "smx_root_test", "/api/v1/me"),
    ("mailbox", "smx_mbx_test", "/api/v1/mailbox/connection"),
    ("sending", "smx_mbx_test", "/api/v1/me"),
])
def test_connection_tool_lists_schema_and_calls_without_mailbox_selection(surface: Surface, api_key: str, endpoint: str) -> None:
    requests: list[httpx.Request] = []
    payload = {
        "ok": True,
        "data": {
            "team": {"id": "team_test", "name": "Fixture team"},
            "credential": {"id": "key_test", "type": "api_key", "name": None},
            "label": "Fixture team", "permissions": [], "mailboxes": [],
        },
        "meta": {"request_id": "req_test"},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=payload)

    async def check() -> None:
        server = create_server(ServerConfig(surfaces=(surface,), api_key=api_key), transport=httpx.MockTransport(handler))
        async with Client(server) as client:
            tools = {tool.name: tool for tool in await client.list_tools()}
            tool_name = f"{surface}_get_connection"
            assert tool_name in tools
            tool = tools[tool_name]
            assert tool.output_schema is not None
            assert "mailbox_id" not in tool.input_schema.get("properties", {})
            assert not tool.input_schema.get("required")
            assert tool.annotations is not None
            assert tool.annotations.read_only_hint is True
            assert tool.annotations.destructive_hint is False
            assert tool.annotations.idempotent_hint is True
            assert tool.annotations.open_world_hint is True
            assert structured_result(await client.call_tool(tool_name, {})) == payload

    asyncio.run(check())
    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert requests[0].url.path == endpoint
    assert not requests[0].url.query
    assert not requests[0].content
    assert requests[0].headers["Authorization"] == f"Bearer {api_key}"


def test_mailbox_tool_call_injects_bearer_auth() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": [],
                    "pagination": {"has_more": False},
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


def test_mailbox_get_attachment_returns_fresh_metadata_from_message() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "id": "msg_test",
                    "attachments": [
                        {
                            "id": "att_other",
                            "filename": "other.txt",
                            "content_type": "text/plain",
                            "size_bytes": 5,
                            "disposition": "attachment",
                            "content_id": None,
                            "download_url": "https://app.sendmux.ai/other",
                        },
                        {
                            "id": "att_test",
                            "filename": "research.md",
                            "content_type": "text/markdown",
                            "size_bytes": 25_000,
                            "disposition": "attachment",
                            "content_id": None,
                            "download_url": "https://app.sendmux.ai/download?download_token=token",
                        },
                    ],
                },
                "meta": {"request_id": "req_test"},
            },
            request=request,
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_get_attachment",
                    {
                        "attachment_id": "att_test",
                        "mailbox_id": "mbx_test",
                        "message_id": "msg_test",
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["id"] == "att_test"
        assert result["data"]["download_url"].endswith("download_token=token")
        assert result["meta"]["request_id"] == "req_test"

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert requests[0].url.path == "/api/v1/mailbox/messages/msg_test"
    assert requests[0].url.params["mailbox_id"] == "mbx_test"
    assert requests[0].headers["Authorization"] == "Bearer smx_mbx_test"


def test_mailbox_read_attachment_downloads_text_server_side() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/api/v1/mailbox/messages/msg_test":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "data": {
                        "id": "msg_test",
                        "attachments": [
                            {
                                "id": "att_test",
                                "filename": "recipe.md",
                                "content_type": "text/markdown",
                                "size_bytes": 21,
                                "disposition": "attachment",
                                "content_id": None,
                                "download_url": "https://app.sendmux.ai/api/v1/mailbox/messages/msg_test/attachment-downloads/attref_test?download_token=token",
                            }
                        ],
                    },
                    "meta": {"request_id": "req_meta"},
                },
                request=request,
            )
        if request.url.path == "/api/v1/mailbox/messages/msg_test/attachments/att_test":
            return httpx.Response(
                200,
                content=b"# Recipe\n\nUse flour.\n",
                headers={"Content-Type": "text/markdown", "Content-Length": "21"},
                request=request,
            )
        return httpx.Response(404, json={"ok": False, "error": {"code": "not_found"}}, request=request)

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_read_attachment",
                    {
                        "attachment_id": "att_test",
                        "mailbox_id": "mbx_test",
                        "message_id": "msg_test",
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["id"] == "att_test"
        assert result["data"]["read_mode"] == "text"
        assert result["data"]["text"] == "# Recipe\n\nUse flour.\n"
        assert result["data"]["truncated"] is False
        assert result["meta"]["request_id"] == "req_meta"

    asyncio.run(check())

    assert [request.url.path for request in requests] == [
        "/api/v1/mailbox/messages/msg_test",
        "/api/v1/mailbox/messages/msg_test/attachments/att_test",
    ]
    assert requests[1].headers["Authorization"] == "Bearer smx_mbx_test"
    assert requests[1].headers["Range"] == "bytes=0-262143"


def test_mailbox_read_attachment_uses_content_range_to_report_truncation() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/api/v1/mailbox/messages/msg_test":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "data": {
                        "id": "msg_test",
                        "attachments": [
                            {
                                "id": "att_test",
                                "filename": "note.txt",
                                "content_type": "text/plain",
                                "size_bytes": 11,
                                "disposition": "attachment",
                                "content_id": None,
                                "download_url": "https://app.sendmux.ai/api/v1/mailbox/messages/msg_test/attachment-downloads/attref_test?download_token=token",
                            }
                        ],
                    },
                    "meta": {"request_id": "req_meta"},
                },
                request=request,
            )
        if request.url.path == "/api/v1/mailbox/messages/msg_test/attachments/att_test":
            return httpx.Response(
                206,
                content=b"hello world",
                headers={
                    "Content-Range": "bytes 0-10/11",
                    "Content-Type": "text/plain",
                    "Content-Length": "11",
                },
                request=request,
            )
        return httpx.Response(404, json={"ok": False, "error": {"code": "not_found"}}, request=request)

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_read_attachment",
                    {
                        "attachment_id": "att_test",
                        "mailbox_id": "mbx_test",
                        "message_id": "msg_test",
                        "max_text_bytes": 11,
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["text"] == "hello world"
        assert result["data"]["truncated"] is False
        assert result["data"]["bytes_read"] == 11

    asyncio.run(check())

    assert requests[1].headers["Range"] == "bytes=0-10"


def test_mailbox_read_attachment_returns_resource_link_for_binary_without_downloading_bytes() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "id": "msg_test",
                    "attachments": [
                        {
                            "id": "att_pdf",
                            "filename": "invoice.pdf",
                            "content_type": "application/pdf",
                            "size_bytes": 2048,
                            "disposition": "attachment",
                            "content_id": None,
                            "download_url": "https://app.sendmux.ai/api/v1/mailbox/messages/msg_test/attachment-downloads/attref_pdf?download_token=token",
                        }
                    ],
                },
                "meta": {"request_id": "req_meta"},
            },
            request=request,
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_read_attachment",
                    {
                        "attachment_id": "att_pdf",
                        "mailbox_id": "mbx_test",
                        "message_id": "msg_test",
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["read_mode"] == "resource_link"
        assert result["data"]["text"] is None
        assert result["data"]["resource_link"] == {
            "uri": "https://app.sendmux.ai/api/v1/mailbox/messages/msg_test/attachment-downloads/attref_pdf?download_token=token",
            "name": "invoice.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 2048,
        }

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].url.path == "/api/v1/mailbox/messages/msg_test"


def test_mailbox_upload_attachment_decodes_base64_and_posts_binary() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = await request.aread()
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "blob_id": "blob_test",
                    "filename": request.url.params["filename"],
                    "content_type": request.headers["content-type"],
                    "size_bytes": len(body),
                },
                "meta": {"request_id": "req_test"},
            },
            request=request,
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_upload_attachment",
                    {
                        "content_base64": base64.b64encode(b"attachment bytes").decode("ascii"),
                        "content_type": "text/plain",
                        "filename": "research.md",
                        "mailbox_id": "mbx_test",
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["blob_id"] == "blob_test"
        assert result["data"]["size_bytes"] == len(b"attachment bytes")

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].method == "POST"
    assert requests[0].url.path == "/api/v1/mailbox/attachments:upload"
    assert requests[0].url.params["filename"] == "research.md"
    assert requests[0].url.params["mailbox_id"] == "mbx_test"
    assert requests[0].headers["content-type"] == "text/plain"
    assert requests[0].content == b"attachment bytes"


def test_mailbox_upload_attachment_mints_presigned_url() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        payload = json.loads((await request.aread()).decode("utf8"))
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "upload_id": "upl_test",
                    "upload_url": "https://app.sendmux.ai/api/v1/mailbox/attachment-uploads/upl_test?upload_token=tok",
                    "method": "PUT",
                    "expires_at": "2026-07-02T06:10:00.000Z",
                    "headers": {"Content-Type": payload["content_type"], "Content-Length": str(payload["size_bytes"])},
                    "max_size_bytes": 7_500_000,
                },
                "meta": {"request_id": "req_test"},
            },
            request=request,
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_upload_attachment",
                    {
                        "content_type": "application/pdf",
                        "filename": "report.pdf",
                        "mailbox_id": "mbx_test",
                        "presign_upload_url": True,
                        "size_bytes": 5_242_880,
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["upload_id"] == "upl_test"
        assert result["data"]["upload_url"].endswith("upload_token=tok")

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].method == "POST"
    assert requests[0].url.path == "/api/v1/mailbox/attachment-uploads"
    assert requests[0].url.params["mailbox_id"] == "mbx_test"
    assert json.loads(requests[0].content) == {
        "content_type": "application/pdf",
        "filename": "report.pdf",
        "size_bytes": 5_242_880,
    }


def test_mailbox_upload_attachment_omits_file_path_from_public_schema() -> None:
    async def schema_check() -> None:
        server = create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"), transport=ok_transport())
        async with Client(server) as client:
            tool = next(tool for tool in await client.list_tools() if tool.name == "mailbox_upload_attachment")
        assert "file_path" not in tool.input_schema["properties"]

    asyncio.run(schema_check())


def test_hosted_mailbox_upload_attachment_omits_file_path_from_public_schema() -> None:
    async def schema_check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",)),
            transport=ok_transport(),
            hosted_proxy_config=HostedProxyConfig(
                proxy_url="https://mcp.sendmux.ai/internal/proxy",
                upstream_base_url="https://app.sendmux.ai/api/v1",
            ),
        )
        async with Client(server) as client:
            tool = next(tool for tool in await client.list_tools() if tool.name == "mailbox_upload_attachment")
        assert "file_path" not in tool.input_schema["properties"]

    asyncio.run(schema_check())


def test_mailbox_upload_attachment_rejects_inline_base64_over_mcp_cap() -> None:
    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=ok_transport(),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_upload_attachment",
                    {
                        "content_base64": base64.b64encode(b"x" * 32_769).decode("ascii"),
                        "content_type": "application/octet-stream",
                        "filename": "large.bin",
                    },
                )
            )

        assert result["ok"] is False
        assert result["error"]["code"] == "invalid_parameter"
        assert result["error"]["param"] == "content_base64"
        assert "presign_upload_url" in result["error"]["message"]

    asyncio.run(check())


def test_mailbox_upload_attachment_public_schema_has_only_safe_input_modes() -> None:
    async def schema_check() -> None:
        server = create_server(ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"), transport=ok_transport())
        async with Client(server) as client:
            tool = next(tool for tool in await client.list_tools() if tool.name == "mailbox_upload_attachment")
        properties = tool.input_schema["properties"]
        assert "file_path" not in properties
        assert {"content_base64", "presign_upload_url"} <= properties.keys()

    asyncio.run(schema_check())


def test_sending_upload_attachment_accepts_tiny_inline_content() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = await request.aread()
        return httpx.Response(
            201,
            json={
                "ok": True,
                "data": {
                    "attachment_id": "att_1234567890abcdefghijklmn",
                    "filename": request.url.params["filename"],
                    "content_type": request.headers["content-type"],
                    "size_bytes": len(body),
                    "expires_at": "2026-07-07T10:00:00.000Z",
                },
                "meta": {"request_id": "req_test"},
            },
            request=request,
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("sending",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "sending_upload_attachment",
                    {
                        "content_base64": base64.b64encode(b"attachment bytes").decode("ascii"),
                        "content_type": "text/plain",
                        "filename": "research.md",
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["attachment_id"] == "att_1234567890abcdefghijklmn"
        assert result["data"]["size_bytes"] == len(b"attachment bytes")

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].method == "POST"
    assert requests[0].url.path == "/api/v1/emails/attachments"
    assert requests[0].url.params["filename"] == "research.md"
    assert requests[0].url.params["content_type"] == "text/plain"
    assert requests[0].headers["content-type"] == "text/plain"
    assert requests[0].content == b"attachment bytes"


def test_sending_upload_attachment_omits_file_path_from_public_schema() -> None:
    async def schema_check() -> None:
        server = create_server(ServerConfig(surfaces=("sending",), api_key="smx_mbx_test"), transport=ok_transport())
        async with Client(server) as client:
            tool = next(tool for tool in await client.list_tools() if tool.name == "sending_upload_attachment")
        assert "file_path" not in tool.input_schema["properties"]

    asyncio.run(schema_check())


def test_hosted_sending_upload_attachment_omits_file_path_from_public_schema() -> None:
    async def schema_check() -> None:
        server = create_server(
            ServerConfig(surfaces=("sending",)),
            transport=ok_transport(),
            hosted_proxy_config=HostedProxyConfig(
                proxy_url="https://mcp.sendmux.ai/internal/proxy",
                upstream_base_url="https://smtp.sendmux.ai/api/v1",
            ),
        )
        async with Client(server) as client:
            tool = next(tool for tool in await client.list_tools() if tool.name == "sending_upload_attachment")
        assert "file_path" not in tool.input_schema["properties"]

    asyncio.run(schema_check())


def test_mailbox_wait_for_message_returns_matching_message() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": [
                    {
                        "id": "msg_new",
                        "received_at": "2026-07-02T16:00:00Z",
                        "attachments": [
                            {
                                "id": "att_test",
                                "filename": "research.md",
                                "content_type": "text/markdown",
                                "size_bytes": 25_000,
                                "disposition": "attachment",
                                "content_id": None,
                                "download_url": "https://app.sendmux.ai/download?download_token=token",
                            }
                        ],
                    }
                ],
                "meta": {"request_id": "req_test"},
            },
            request=request,
        )

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=httpx.MockTransport(handler),
        )
        async with Client(server) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_wait_for_message",
                    {
                        "after": "2026-07-02T15:59:00Z",
                        "from_email": "sender@example.com",
                        "has_attachment": True,
                        "mailbox_id": "mbx_test",
                        "timeout_seconds": 1,
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["matched"] is True
        assert result["data"]["message"]["attachments"][0]["download_url"].endswith("download_token=token")

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].url.path == "/api/v1/mailbox/messages"
    assert requests[0].url.params["after"] == "2026-07-02T15:59:00Z"
    assert requests[0].url.params["from"] == "sender@example.com"
    assert requests[0].url.params["has_attachment"] == "true"
    assert requests[0].url.params["include_attachments"] == "metadata"
    assert requests[0].url.params["mailbox_id"] == "mbx_test"
    assert requests[0].url.params["limit"] == "1"


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
            json={
                "ok": True,
                "data": {"message_id": "sub_test", "status": "queued"},
                "meta": {"request_id": "req_test"},
            },
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


def test_hosted_proxy_only_targets_mailbox_for_mailbox_surface() -> None:
    transport = HostedProxyTransport(
        HostedProxyConfig(
            proxy_url="https://mcp.sendmux.ai/internal/proxy",
            upstream_base_url="https://app.sendmux.ai/api/v1",
        ),
        manifest=HostedOperationManifest(()),
    )
    management_route = hosted_route("managementListMailboxes", "management_list_mailboxes", "management", "/mailboxes")
    sending_route = hosted_route("sendingSendEmail", "sending_send_email", "sending", "/emails/send", method="POST")
    mailbox_route = hosted_route("mailboxGetIdentity", "mailbox_get_identity", "mailbox", "/mailbox/identities/{public_id}")

    management = proxy_envelope(
        transport,
        httpx.Request("GET", "https://app.sendmux.ai/api/v1/mailboxes?mailbox_id=mbx_one"),
        management_route,
    )
    sending = proxy_envelope(
        transport,
        httpx.Request("POST", "https://smtp.sendmux.ai/api/v1/emails/send?mailbox_id=mbx_one"),
        sending_route,
    )
    mailbox = proxy_envelope(
        transport,
        httpx.Request("GET", "https://app.sendmux.ai/api/v1/mailbox/identities/ident_1?mailbox_id=mbx_one"),
        mailbox_route,
    )

    assert management["surface"] == "management"
    assert "mailbox_id" not in management
    assert sending["surface"] == "sending"
    assert "mailbox_id" not in sending
    assert mailbox["surface"] == "mailbox"
    assert mailbox["mailbox_id"] == "mbx_one"


def test_hosted_mailbox_manifest_allows_attachment_download_backing_operation() -> None:
    config = ServerConfig(surfaces=("mailbox",))
    document = prepare_for_fastmcp(load_spec(config, "mailbox"), base_url=config.api_base_url_for("mailbox"))
    manifest = build_hosted_operation_manifest(document, "mailbox")

    route = manifest.resolve("GET", "/mailbox/messages/msg_test/attachments/att_test")

    assert route is not None
    assert route.operation_id == "mailboxGetMessageAttachment"
    assert route.tool_name == "mailbox_get_attachment"
    assert route.permissions == ("mailbox.read",)


def ok_transport() -> httpx.MockTransport:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True, "data": {}, "meta": {"request_id": "req_test"}})

    return httpx.MockTransport(handler)


def hosted_route(
    operation_id: str,
    tool_name: str,
    surface: Surface,
    path_template: str,
    *,
    method: str = "GET",
) -> HostedOperationRoute:
    return HostedOperationRoute(
        operation_id=operation_id,
        tool_name=tool_name,
        surface=surface,
        method=method,
        path_template=path_template,
        permissions=(),
        path_pattern=path_template_pattern(path_template),
    )


def proxy_envelope(
    transport: HostedProxyTransport,
    request: httpx.Request,
    route: HostedOperationRoute,
) -> dict[str, Any]:
    proxy_request = transport._proxy_request(
        request,
        route,
        "mcp_grant_public",
        request.url.path.removeprefix("/api/v1"),
        b"",
    )
    return json.loads(proxy_request.content)
