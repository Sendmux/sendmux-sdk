from __future__ import annotations

import asyncio
import base64
from binascii import Error as Base64DecodeError
from datetime import datetime, timezone
from typing import Annotated, Any
from urllib.parse import quote

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth import AuthProvider
from fastmcp.server.middleware import AuthMiddleware
from mcp.types import ToolAnnotations
from pydantic import Field
from starlette.requests import Request
from starlette.responses import JSONResponse

from sendmux_mcp.config import ServerConfig, Surface
from sendmux_mcp.curation import customise_component, mcp_names_for_surface, route_maps_for_surface
from sendmux_mcp.hosted_proxy import HostedProxyConfig, HostedProxyTransport, build_hosted_operation_manifest
from sendmux_mcp.permissions import tool_permission_auth_check
from sendmux_mcp.retry import RetryingAsyncTransport
from sendmux_mcp.security import middleware_for_config
from sendmux_mcp.specs import load_spec, prepare_for_fastmcp

MCP_ATTACHMENT_UPLOAD_MAX_BYTES = 5_000_000
MCP_ATTACHMENT_UPLOAD_MAX_BASE64_CHARS = ((MCP_ATTACHMENT_UPLOAD_MAX_BYTES + 2) // 3) * 4 + 16
MCP_WAIT_FOR_MESSAGE_MAX_TIMEOUT_SECONDS = 25
MCP_WAIT_FOR_MESSAGE_DEFAULT_TIMEOUT_SECONDS = 20
MCP_WAIT_FOR_MESSAGE_POLL_INTERVAL_SECONDS = 2

ANY_OBJECT_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": True,
}


def create_server(
    config: ServerConfig,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    auth_provider: AuthProvider | None = None,
    hosted_proxy_config: HostedProxyConfig | None = None,
) -> FastMCP:
    config.validate(require_api_key=hosted_proxy_config is None)
    if hosted_proxy_config is not None and len(config.selected_surfaces) != 1:
        raise ValueError("Hosted proxy config is single-surface; mount one hosted child per surface.")
    if len(config.selected_surfaces) > 1:
        server = FastMCP(
            name="Sendmux MCP",
            auth=auth_provider,
            middleware=[AuthMiddleware(auth=tool_permission_auth_check)] if auth_provider else None,
        )
        for surface in config.selected_surfaces:
            server.mount(
                create_surface_server(
                    config,
                    surface,
                    transport=transport,
                    auth_provider=auth_provider,
                    hosted_proxy_config=hosted_proxy_config,
                    include_health=False,
                )
            )

        @server.custom_route("/health", methods=["GET"], include_in_schema=False)
        async def health(_request: Request) -> JSONResponse:
            return JSONResponse({"status": "ok", "surfaces": list(config.selected_surfaces)})

        return server

    return create_surface_server(
        config,
        config.only_surface(),
        transport=transport,
        auth_provider=auth_provider,
        hosted_proxy_config=hosted_proxy_config,
        include_health=True,
    )


def create_surface_server(
    config: ServerConfig,
    surface: Surface,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    auth_provider: AuthProvider | None = None,
    hosted_proxy_config: HostedProxyConfig | None = None,
    include_health: bool,
) -> FastMCP:
    raw_spec = load_spec(config, surface)
    api_base_url = config.api_base_url_for(surface)
    spec = prepare_for_fastmcp(raw_spec, base_url=api_base_url)
    upstream_transport = transport
    if hosted_proxy_config is not None:
        upstream_transport = HostedProxyTransport(
            hosted_proxy_config,
            manifest=build_hosted_operation_manifest(spec, surface),
            inner=transport,
        )
    retrying_transport = RetryingAsyncTransport(retry=config.retry, inner=upstream_transport)
    api_key = config.api_key_for(surface)
    headers = {"Authorization": f"Bearer {api_key}"} if api_key and hosted_proxy_config is None else {}
    client = httpx.AsyncClient(
        base_url=api_base_url,
        headers=headers,
        timeout=config.timeout_seconds,
        transport=retrying_transport,
    )

    middleware = [AuthMiddleware(auth=tool_permission_auth_check)] if auth_provider else None

    server = FastMCP.from_openapi(
        openapi_spec=spec,
        client=client,
        name=f"Sendmux {surface} MCP",
        route_maps=route_maps_for_surface(spec, surface),
        mcp_names=mcp_names_for_surface(surface),
        mcp_component_fn=customise_component,
        tags={"sendmux", surface},
        validate_output=False,
        auth=auth_provider,
        middleware=middleware,
    )

    if surface == "mailbox":
        add_mailbox_custom_tools(server, client)

    if include_health:
        @server.custom_route("/health", methods=["GET"], include_in_schema=False)
        async def health(_request: Request) -> JSONResponse:
            return JSONResponse({"status": "ok", "surfaces": [surface]})

    return server


def run(config: ServerConfig) -> None:
    server = create_server(config)
    if config.transport == "stdio":
        server.run(transport="stdio", show_banner=False)
        return

    server.run(
        transport="http",
        host=config.host,
        port=config.port,
        path=config.path,
        middleware=middleware_for_config(config),
        stateless_http=config.stateless_http,
        show_banner=False,
    )


def add_mailbox_custom_tools(server: FastMCP, client: httpx.AsyncClient) -> None:
    @server.tool(
        name="mailbox_get_attachment",
        title="Get Attachment Metadata",
        description=(
            "Use this after finding a message attachment. It returns metadata plus a fresh short-lived "
            "download_url for that exact attachment; fetch the URL promptly, and call this tool again if it expires."
        ),
        tags={"sendmux", "mailbox"},
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=True,
        ),
        output_schema=ANY_OBJECT_OUTPUT_SCHEMA,
    )
    async def mailbox_get_attachment(
        message_id: Annotated[str, Field(description="Message ID containing the attachment.")],
        attachment_id: Annotated[str, Field(description="Attachment ID from message metadata.")],
        mailbox_id: Annotated[
            str | None,
            Field(description="Mailbox public ID when the credential can access more than one mailbox."),
        ] = None,
    ) -> dict[str, Any]:
        params = optional_params(mailbox_id=mailbox_id)
        response = await client.get(f"mailbox/messages/{quote(message_id, safe='')}", params=params)
        payload = json_payload(response)
        if payload.get("ok") is not True:
            return payload

        message = payload.get("data")
        if not isinstance(message, dict):
            return local_tool_error("invalid_response", "Message response did not contain an object.")

        for attachment in attachments_from_message(message):
            if attachment.get("id") == attachment_id or attachment.get("blob_id") == attachment_id:
                return {
                    "ok": True,
                    "data": attachment,
                    "meta": payload.get("meta", {}),
                }

        return {
            "ok": False,
            "error": {
                "code": "not_found",
                "message": "Attachment not found on this message.",
                "param": "attachment_id",
            },
            "meta": payload.get("meta", {}),
        }

    @server.tool(
        name="mailbox_upload_attachment",
        title="Upload Attachment",
        description=(
            "Use this before sending a larger mailbox attachment. Provide base64 content up to "
            "5,000,000 decoded bytes; the result returns a blob_id to pass into mailbox_send_message attachments."
        ),
        tags={"sendmux", "mailbox"},
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
        output_schema=ANY_OBJECT_OUTPUT_SCHEMA,
    )
    async def mailbox_upload_attachment(
        filename: Annotated[str, Field(description="Filename to use when sending the uploaded attachment.")],
        content_base64: Annotated[
            str,
            Field(
                description=(
                    "Base64-encoded attachment bytes. Decoded content must be at most 5,000,000 bytes for MCP."
                ),
                min_length=1,
            ),
        ],
        content_type: Annotated[
            str,
            Field(description="MIME type to store with the upload, for example application/pdf."),
        ] = "application/octet-stream",
        mailbox_id: Annotated[
            str | None,
            Field(description="Mailbox public ID when the credential can access more than one mailbox."),
        ] = None,
    ) -> dict[str, Any]:
        content = decode_base64_attachment(content_base64)
        if isinstance(content, dict):
            return content

        params = optional_params(filename=filename, mailbox_id=mailbox_id)
        response = await client.post(
            "mailbox/attachments:upload",
            params=params,
            headers={"content-type": content_type[:255] or "application/octet-stream"},
            content=content,
        )
        return json_payload(response)

    @server.tool(
        name="mailbox_wait_for_message",
        title="Wait For Message",
        description=(
            "Use this to wait briefly for new mail instead of manual polling. It polls for up to 25 seconds, "
            "returns a matching message with attachment metadata when found, or a clean no_message result so you can call again."
        ),
        tags={"sendmux", "mailbox"},
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=True,
        ),
        output_schema=ANY_OBJECT_OUTPUT_SCHEMA,
    )
    async def mailbox_wait_for_message(
        timeout_seconds: Annotated[
            int,
            Field(
                description="Maximum seconds to wait. Capped at 25 seconds so MCP clients do not hold a tool call open indefinitely.",
                ge=1,
                le=MCP_WAIT_FOR_MESSAGE_MAX_TIMEOUT_SECONDS,
            ),
        ] = MCP_WAIT_FOR_MESSAGE_DEFAULT_TIMEOUT_SECONDS,
        mailbox_id: Annotated[
            str | None,
            Field(description="Mailbox public ID when the credential can access more than one mailbox."),
        ] = None,
        after: Annotated[
            str | None,
            Field(description="ISO 8601 lower bound for received_at. Omit to wait for messages received after this call starts."),
        ] = None,
        q: Annotated[
            str | None,
            Field(description="Optional full-text query to match."),
        ] = None,
        from_email: Annotated[
            str | None,
            Field(description="Optional sender email address or display-name filter."),
        ] = None,
        subject: Annotated[
            str | None,
            Field(description="Optional subject text filter."),
        ] = None,
        folder_id: Annotated[
            str | None,
            Field(description="Optional folder ID filter."),
        ] = None,
        keyword: Annotated[
            str | None,
            Field(description="Optional keyword/label that the message must have, such as $seen."),
        ] = None,
        has_attachment: Annotated[
            bool | None,
            Field(description="When true, wait only for messages with attachments."),
        ] = None,
    ) -> dict[str, Any]:
        deadline = asyncio.get_running_loop().time() + min(
            max(timeout_seconds, 1),
            MCP_WAIT_FOR_MESSAGE_MAX_TIMEOUT_SECONDS,
        )
        checkpoint = after or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        last_meta: dict[str, Any] = {}

        while True:
            params = optional_params(
                after=checkpoint,
                folder_id=folder_id,
                has_attachment=has_attachment,
                keyword=keyword,
                limit=1,
                mailbox_id=mailbox_id,
                q=q,
                sort_by="received_at",
                sort_direction="desc",
                subject=subject,
            )
            if from_email:
                params["from"] = from_email

            response = await client.get("mailbox/messages", params=params)
            payload = json_payload(response)
            if payload.get("ok") is not True:
                return payload

            meta = payload.get("meta")
            if isinstance(meta, dict):
                last_meta = meta
            messages = payload.get("data")
            if isinstance(messages, list) and messages:
                message = messages[0]
                return {
                    "ok": True,
                    "data": {
                        "matched": True,
                        "message": message,
                        "next_after": message.get("received_at") if isinstance(message, dict) else checkpoint,
                    },
                    "meta": last_meta,
                }

            if asyncio.get_running_loop().time() >= deadline:
                return {
                    "ok": True,
                    "data": {
                        "matched": False,
                        "message": None,
                        "next_after": checkpoint,
                    },
                    "meta": last_meta,
                }

            await asyncio.sleep(MCP_WAIT_FOR_MESSAGE_POLL_INTERVAL_SECONDS)


def optional_params(**values: Any) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def attachments_from_message(message: dict[str, Any]) -> list[dict[str, Any]]:
    attachments = message.get("attachments")
    if not isinstance(attachments, list):
        return []
    return [attachment for attachment in attachments if isinstance(attachment, dict)]


def decode_base64_attachment(content_base64: str) -> bytes | dict[str, Any]:
    if len(content_base64) > MCP_ATTACHMENT_UPLOAD_MAX_BASE64_CHARS:
        return local_tool_error(
            "invalid_parameter",
            "Attachment exceeds the MCP upload cap of 5,000,000 decoded bytes.",
            param="content_base64",
        )
    try:
        content = base64.b64decode(content_base64, validate=True)
    except (Base64DecodeError, ValueError):
        return local_tool_error("invalid_parameter", "content_base64 must be valid base64.", param="content_base64")
    if len(content) == 0:
        return local_tool_error("invalid_parameter", "Attachment content is required.", param="content_base64")
    if len(content) > MCP_ATTACHMENT_UPLOAD_MAX_BYTES:
        return local_tool_error(
            "invalid_parameter",
            "Attachment exceeds the MCP upload cap of 5,000,000 decoded bytes.",
            param="content_base64",
        )
    return content


def json_payload(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        response.raise_for_status()
        return local_tool_error("invalid_response", "Upstream response was not JSON.")
    if isinstance(payload, dict):
        return payload
    return local_tool_error("invalid_response", "Upstream response JSON was not an object.")


def local_tool_error(code: str, message: str, *, param: str | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {
        "code": code,
        "message": message,
    }
    if param:
        error["param"] = param
    return {
        "ok": False,
        "error": error,
    }
