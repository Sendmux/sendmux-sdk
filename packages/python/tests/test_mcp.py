from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastmcp import Client

from sendmux_mcp.cli import parser, surfaces_from_args
from sendmux_mcp.config import RetryConfig, ServerConfig, Surface
from sendmux_mcp.curation import TOOLS_BY_SURFACE
from sendmux_mcp.hosted_proxy import (
    HostedOperationManifest,
    HostedOperationRoute,
    HostedProxyConfig,
    HostedProxyTransport,
    path_template_pattern,
)
from sendmux_mcp.live_e2e import expected_api_error_exception
from sendmux_mcp.security import middleware_for_config
from sendmux_mcp.server import create_server
from sendmux_mcp.verification import structured_result

EXPECTED_TOOL_NAMES_BY_SURFACE = {
    "mailbox": {
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
        "mailbox_search_message_snippets",
        "mailbox_send_message",
        "mailbox_upload_attachment",
        "mailbox_update_identity",
        "mailbox_wait_for_message",
    },
    "management": {
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
        "sending_send_email",
        "sending_send_email_batch",
    },
}

READ_ONLY_TOOL_NAMES = {
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

        assert len(tools) == 47
        assert {tool.name for tool in tools if tool.outputSchema is None} == NO_OUTPUT_SCHEMA_TOOL_NAMES

        for tool in tools:
            annotations = tool.annotations
            assert annotations is not None, tool.name
            assert annotations.readOnlyHint is (tool.name in READ_ONLY_TOOL_NAMES)
            assert annotations.destructiveHint is (tool.name in DESTRUCTIVE_TOOL_NAMES)
            assert annotations.idempotentHint is (
                tool.name in READ_ONLY_TOOL_NAMES or tool.name in IDEMPOTENT_WRITE_TOOL_NAMES
            )
            assert annotations.openWorldHint is True

            properties = (tool.inputSchema or {}).get("properties") or {}
            for property_name, schema in properties.items():
                assert isinstance(schema, dict), f"{tool.name}.{property_name}"
                assert str(schema.get("description") or "").strip(), f"{tool.name}.{property_name}"

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


def test_mailbox_upload_attachment_reads_file_path_from_client_roots(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []
    attachment = tmp_path / "report.pdf"
    attachment.write_bytes(b"pdf bytes")

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = await request.aread()
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "blob_id": "blob_file",
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
        async with Client(server, roots=[tmp_path.as_uri()]) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_upload_attachment",
                    {
                        "content_type": "application/pdf",
                        "file_path": str(attachment),
                        "filename": "report.pdf",
                        "mailbox_id": "mbx_test",
                    },
                )
            )

        assert result["ok"] is True
        assert result["data"]["blob_id"] == "blob_file"

    asyncio.run(check())

    assert len(requests) == 1
    assert requests[0].url.path == "/api/v1/mailbox/attachments:upload"
    assert requests[0].content == b"pdf bytes"


def test_mailbox_upload_attachment_rejects_hosted_file_path(tmp_path: Path) -> None:
    attachment = tmp_path / "report.pdf"
    attachment.write_bytes(b"pdf bytes")

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",)),
            transport=ok_transport(),
            hosted_proxy_config=HostedProxyConfig(
                proxy_url="https://mcp.sendmux.ai/internal/proxy",
                upstream_base_url="https://app.sendmux.ai/api/v1",
            ),
        )
        async with Client(server, roots=[tmp_path.as_uri()]) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_upload_attachment",
                    {
                        "content_type": "application/pdf",
                        "file_path": str(attachment),
                        "filename": "report.pdf",
                    },
                )
            )

        assert result["ok"] is False
        assert result["error"]["code"] == "invalid_parameter"
        assert result["error"]["param"] == "file_path"
        assert "presign_upload_url" in result["error"]["message"]

    asyncio.run(check())


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
        assert "file_path" in result["error"]["message"]
        assert "presign_upload_url" in result["error"]["message"]

    asyncio.run(check())


def test_mailbox_upload_attachment_requires_exactly_one_input_mode(tmp_path: Path) -> None:
    attachment = tmp_path / "report.pdf"
    attachment.write_bytes(b"pdf bytes")

    async def check() -> None:
        server = create_server(
            ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test"),
            transport=ok_transport(),
        )
        async with Client(server, roots=[tmp_path.as_uri()]) as client:
            result = structured_result(
                await client.call_tool(
                    "mailbox_upload_attachment",
                    {
                        "content_base64": base64.b64encode(b"inline").decode("ascii"),
                        "content_type": "application/pdf",
                        "file_path": str(attachment),
                        "filename": "report.pdf",
                    },
                )
            )

        assert result["ok"] is False
        assert result["error"]["code"] == "invalid_parameter"
        assert result["error"]["message"].startswith("Provide exactly one")

    asyncio.run(check())


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
