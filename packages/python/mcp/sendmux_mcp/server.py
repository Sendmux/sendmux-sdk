from __future__ import annotations

import asyncio
import base64
from binascii import Error as Base64DecodeError
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import quote, unquote, urlparse

import httpx
from fastmcp import Context, FastMCP
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

MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BYTES = 32 * 1024
MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BASE64_CHARS = ((MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BYTES + 2) // 3) * 4 + 16
MCP_ATTACHMENT_FILE_UPLOAD_MAX_BYTES = 7_500_000
MCP_SENDING_ATTACHMENT_FILE_UPLOAD_MAX_BYTES = 18 * 1024 * 1024
MCP_ATTACHMENT_TEXT_DEFAULT_MAX_BYTES = 256 * 1024
MCP_ATTACHMENT_TEXT_MAX_BYTES = 1024 * 1024
MCP_WAIT_FOR_MESSAGE_MAX_TIMEOUT_SECONDS = 25
MCP_WAIT_FOR_MESSAGE_DEFAULT_TIMEOUT_SECONDS = 20
MCP_WAIT_FOR_MESSAGE_POLL_INTERVAL_SECONDS = 2
MCP_ATTACHMENT_READ_MODES = {"auto", "metadata", "text", "resource_link"}
MCP_ATTACHMENT_TEXT_CONTENT_TYPES = {
    "application/csv",
    "application/json",
    "application/ld+json",
    "application/markdown",
    "application/toml",
    "application/xml",
    "application/yaml",
    "text/csv",
    "text/markdown",
}

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
        add_mailbox_custom_tools(
            server,
            client,
            hosted=hosted_proxy_config is not None,
            transport=config.transport,
        )

    if surface == "sending":
        add_sending_custom_tools(
            server,
            client,
            hosted=hosted_proxy_config is not None,
            transport=config.transport,
        )

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


def add_mailbox_custom_tools(
    server: FastMCP,
    client: httpx.AsyncClient,
    *,
    hosted: bool,
    transport: str,
) -> None:
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
        return await fetch_mailbox_attachment_metadata(
            client=client,
            message_id=message_id,
            attachment_id=attachment_id,
            mailbox_id=mailbox_id,
        )

    @server.tool(
        name="mailbox_read_attachment",
        title="Read Attachment",
        description=(
            "Use this after finding a message attachment when you need the attachment contents. Text-like "
            "attachments are downloaded server-side and returned as text, so agents do not need a generic web_fetch "
            "tool. Binary or oversized attachments return metadata plus a fresh download link."
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
    async def mailbox_read_attachment(
        message_id: Annotated[str, Field(description="Message ID containing the attachment.")],
        attachment_id: Annotated[str, Field(description="Attachment ID from message metadata.")],
        mailbox_id: Annotated[
            str | None,
            Field(description="Mailbox public ID when the credential can access more than one mailbox."),
        ] = None,
        mode: Annotated[
            str,
            Field(description="Read mode: auto, metadata, text, or resource_link. auto inlines small text attachments."),
        ] = "auto",
        max_text_bytes: Annotated[
            int,
            Field(
                description="Maximum text bytes to return inline. Defaults to 262144 and is capped at 1048576.",
                ge=1,
                le=MCP_ATTACHMENT_TEXT_MAX_BYTES,
            ),
        ] = MCP_ATTACHMENT_TEXT_DEFAULT_MAX_BYTES,
    ) -> dict[str, Any]:
        if mode not in MCP_ATTACHMENT_READ_MODES:
            return local_tool_error("invalid_parameter", "mode must be auto, metadata, text, or resource_link.", param="mode")

        metadata_payload = await fetch_mailbox_attachment_metadata(
            client=client,
            message_id=message_id,
            attachment_id=attachment_id,
            mailbox_id=mailbox_id,
        )
        if metadata_payload.get("ok") is not True:
            return metadata_payload

        attachment = metadata_payload.get("data")
        if not isinstance(attachment, dict):
            return local_tool_error("invalid_response", "Attachment metadata response did not contain an object.")

        if mode == "metadata":
            return metadata_payload

        content_type = attachment_content_type(attachment)
        size_bytes = attachment_size_bytes(attachment)
        if mode == "resource_link" or not is_text_attachment(content_type):
            if mode == "text":
                return local_tool_error(
                    "invalid_parameter",
                    "Attachment is not text-like. Use mode=resource_link to return metadata and a download link.",
                    param="mode",
                )
            return attachment_resource_link_payload(attachment, meta=metadata_payload.get("meta", {}))

        effective_max = min(max(max_text_bytes, 1), MCP_ATTACHMENT_TEXT_MAX_BYTES)
        if mode == "auto" and size_bytes is not None and size_bytes > effective_max:
            return attachment_resource_link_payload(attachment, meta=metadata_payload.get("meta", {}))

        response = await client.get(
            f"mailbox/messages/{quote(message_id, safe='')}/attachments/{quote(attachment_id, safe='')}",
            params=optional_params(mailbox_id=mailbox_id),
            headers={"Range": f"bytes=0-{effective_max}"},
        )
        if response.status_code >= 400:
            return json_payload(response)

        content = response.content
        truncated = response.status_code == 206
        if len(content) > effective_max:
            content = content[:effective_max]
            truncated = True

        return {
            "ok": True,
            "data": {
                **attachment,
                "read_mode": "text",
                "text": content.decode("utf-8", errors="replace"),
                "truncated": truncated,
                "bytes_read": len(content),
            },
            "meta": metadata_payload.get("meta", {}),
        }

    @server.tool(
        name="mailbox_upload_attachment",
        title="Upload Attachment",
        description=(
            "Use this before sending a mailbox attachment. Cheapest mode: file_path on local stdio MCP reads the "
            "user-approved local file without putting bytes in model context. Hosted or shell-capable agents should "
            "set presign_upload_url=true with filename, content_type, and size_bytes, then PUT the file to the returned "
            "short-lived URL promptly and send the returned blob_id. Inline content_base64 is a last resort for tiny "
            "agent-authored files only and is capped at 32 KiB decoded."
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
        ctx: Context,
        content_base64: Annotated[
            str | None,
            Field(
                description=(
                    "Last-resort inline base64 for tiny agent-authored files only. Decoded content must be at most 32 KiB; use file_path or presign_upload_url for real files."
                ),
            ),
        ] = None,
        file_path: Annotated[
            str | None,
            Field(
                description=(
                    "Local file path for stdio MCP only. The path must be inside a client-declared MCP root; hosted MCP rejects it."
                ),
            ),
        ] = None,
        presign_upload_url: Annotated[
            bool,
            Field(
                description=(
                    "When true, return a short-lived signed PUT URL instead of reading bytes. Provide size_bytes and upload with a shell/client promptly."
                ),
            ),
        ] = False,
        size_bytes: Annotated[
            int | None,
            Field(
                description="Exact byte size required when presign_upload_url=true.",
                ge=1,
                le=MCP_ATTACHMENT_FILE_UPLOAD_MAX_BYTES,
            ),
        ] = None,
        content_type: Annotated[
            str,
            Field(description="MIME type to store with the upload, for example application/pdf."),
        ] = "application/octet-stream",
        mailbox_id: Annotated[
            str | None,
            Field(description="Mailbox public ID when the credential can access more than one mailbox."),
        ] = None,
    ) -> dict[str, Any]:
        mode_count = sum(1 for enabled in (bool(content_base64), bool(file_path), presign_upload_url) if enabled)
        if mode_count != 1:
            return local_tool_error(
                "invalid_parameter",
                "Provide exactly one attachment input mode: file_path, presign_upload_url, or content_base64.",
            )

        if presign_upload_url:
            if size_bytes is None:
                return local_tool_error(
                    "missing_parameter",
                    "size_bytes is required when presign_upload_url is true.",
                    param="size_bytes",
                )
            if size_bytes < 1 or size_bytes > MCP_ATTACHMENT_FILE_UPLOAD_MAX_BYTES:
                return local_tool_error(
                    "invalid_parameter",
                    "Attachment size exceeds the mailbox upload cap of 7,500,000 bytes.",
                    param="size_bytes",
                )
            response = await client.post(
                "mailbox/attachment-uploads",
                params=optional_params(mailbox_id=mailbox_id),
                json={
                    "filename": filename,
                    "content_type": content_type[:255] or "application/octet-stream",
                    "size_bytes": size_bytes,
                },
            )
            return json_payload(response)

        if file_path:
            content = await read_local_attachment_file(
                file_path=file_path,
                ctx=ctx,
                hosted=hosted,
                transport=transport,
            )
            if isinstance(content, dict):
                return content
        else:
            content = decode_base64_attachment(content_base64 or "")
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
                include_attachments="metadata",
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


def add_sending_custom_tools(
    server: FastMCP,
    client: httpx.AsyncClient,
    *,
    hosted: bool,
    transport: str,
) -> None:
    @server.tool(
        name="sending_upload_attachment",
        title="Upload Attachment",
        description=(
            "Use this before sending a Sending API attachment. Cheapest mode: file_path on local stdio MCP reads the "
            "user-approved local file without putting bytes in model context. Hosted agents should use "
            "sending_create_attachment_upload and PUT the file outside model context. Inline content_base64 is a last "
            "resort for tiny agent-authored files only and is capped at 32 KiB decoded."
        ),
        tags={"sendmux", "sending"},
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
        output_schema=ANY_OBJECT_OUTPUT_SCHEMA,
    )
    async def sending_upload_attachment(
        filename: Annotated[str, Field(description="Filename to use when sending the uploaded attachment.")],
        ctx: Context,
        content_base64: Annotated[
            str | None,
            Field(
                description=(
                    "Last-resort inline base64 for tiny agent-authored files only. Decoded content must be at most 32 KiB; use file_path for real local files."
                ),
            ),
        ] = None,
        file_path: Annotated[
            str | None,
            Field(
                description=(
                    "Local file path for stdio MCP only. The path must be inside a client-declared MCP root; hosted MCP rejects it."
                ),
            ),
        ] = None,
        content_type: Annotated[
            str,
            Field(description="MIME type to store with the upload, for example application/pdf."),
        ] = "application/octet-stream",
        idempotency_key: Annotated[
            str | None,
            Field(description="Optional Idempotency-Key for safely retrying the upload."),
        ] = None,
    ) -> dict[str, Any]:
        mode_count = sum(1 for enabled in (bool(content_base64), bool(file_path)) if enabled)
        if mode_count != 1:
            return local_tool_error(
                "invalid_parameter",
                "Provide exactly one attachment input mode: file_path or content_base64.",
            )

        if file_path:
            content = await read_local_attachment_file(
                file_path=file_path,
                ctx=ctx,
                hosted=hosted,
                transport=transport,
                max_bytes=MCP_SENDING_ATTACHMENT_FILE_UPLOAD_MAX_BYTES,
                max_bytes_message="Attachment file exceeds the Sending upload cap of 18 MiB.",
                unavailable_message=(
                    "file_path is available only for local stdio MCP. Use sending_create_attachment_upload and PUT the file outside model context."
                ),
            )
            if isinstance(content, dict):
                return content
        else:
            content = decode_base64_attachment(content_base64 or "")
            if isinstance(content, dict):
                return content

        headers = {"content-type": content_type[:255] or "application/octet-stream"}
        if idempotency_key:
            headers["idempotency-key"] = idempotency_key
        response = await client.post(
            "emails/attachments",
            params={"filename": filename, "content_type": content_type[:255] or "application/octet-stream"},
            headers=headers,
            content=content,
        )
        return json_payload(response)


def optional_params(**values: Any) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def attachments_from_message(message: dict[str, Any]) -> list[dict[str, Any]]:
    attachments = message.get("attachments")
    if not isinstance(attachments, list):
        return []
    return [attachment for attachment in attachments if isinstance(attachment, dict)]


async def fetch_mailbox_attachment_metadata(
    *,
    client: httpx.AsyncClient,
    message_id: str,
    attachment_id: str,
    mailbox_id: str | None,
) -> dict[str, Any]:
    response = await client.get(f"mailbox/messages/{quote(message_id, safe='')}", params=optional_params(mailbox_id=mailbox_id))
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


def attachment_content_type(attachment: dict[str, Any]) -> str:
    value = attachment.get("content_type")
    if not isinstance(value, str) or not value.strip():
        return "application/octet-stream"
    return value.split(";", 1)[0].strip().lower() or "application/octet-stream"


def attachment_size_bytes(attachment: dict[str, Any]) -> int | None:
    value = attachment.get("size_bytes")
    return value if isinstance(value, int) and value >= 0 else None


def is_text_attachment(content_type: str) -> bool:
    return content_type.startswith("text/") or content_type in MCP_ATTACHMENT_TEXT_CONTENT_TYPES


def attachment_resource_link_payload(attachment: dict[str, Any], *, meta: Any) -> dict[str, Any]:
    download_url = attachment.get("download_url")
    filename = attachment.get("filename")
    content_type = attachment_content_type(attachment)
    size_bytes = attachment_size_bytes(attachment)
    resource_link = {
        "uri": download_url if isinstance(download_url, str) else "",
        "name": filename if isinstance(filename, str) and filename else str(attachment.get("id") or "attachment"),
        "mime_type": content_type,
        "size_bytes": size_bytes,
    }
    return {
        "ok": True,
        "data": {
            **attachment,
            "read_mode": "resource_link",
            "text": None,
            "resource_link": resource_link,
        },
        "meta": meta if isinstance(meta, dict) else {},
    }


def decode_base64_attachment(content_base64: str) -> bytes | dict[str, Any]:
    if len(content_base64) > MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BASE64_CHARS:
        return local_tool_error(
            "invalid_parameter",
            "Inline base64 exceeds the MCP cap of 32 KiB decoded bytes. Use file_path on local stdio MCP, or presign_upload_url and PUT the file outside model context.",
            param="content_base64",
        )
    try:
        content = base64.b64decode(content_base64, validate=True)
    except (Base64DecodeError, ValueError):
        return local_tool_error("invalid_parameter", "content_base64 must be valid base64.", param="content_base64")
    if len(content) == 0:
        return local_tool_error("invalid_parameter", "Attachment content is required.", param="content_base64")
    if len(content) > MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BYTES:
        return local_tool_error(
            "invalid_parameter",
            "Inline base64 exceeds the MCP cap of 32 KiB decoded bytes. Use file_path on local stdio MCP, or presign_upload_url and PUT the file outside model context.",
            param="content_base64",
        )
    return content


async def read_local_attachment_file(
    *,
    file_path: str,
    ctx: Context,
    hosted: bool,
    transport: str,
    max_bytes: int = MCP_ATTACHMENT_FILE_UPLOAD_MAX_BYTES,
    max_bytes_message: str = "Attachment file exceeds the mailbox upload cap of 7,500,000 bytes.",
    unavailable_message: str = "file_path is available only for local stdio MCP. Use presign_upload_url and PUT the file outside model context.",
) -> bytes | dict[str, Any]:
    if hosted or transport != "stdio":
        return local_tool_error(
            "invalid_parameter",
            unavailable_message,
            param="file_path",
        )

    try:
        roots = await ctx.list_roots()
    except Exception:
        return local_tool_error(
            "invalid_parameter",
            "file_path requires client-declared MCP roots. Use presign_upload_url if your client does not expose roots.",
            param="file_path",
        )

    allowed_roots = [root for root in (root_uri_to_path(str(root.uri)) for root in roots) if root is not None]
    if not allowed_roots:
        return local_tool_error(
            "invalid_parameter",
            "file_path requires at least one file:// MCP root. Use presign_upload_url instead.",
            param="file_path",
        )

    resolved = resolve_requested_file_path(file_path, allowed_roots)
    if resolved is None:
        return local_tool_error(
            "invalid_parameter",
            "file_path must point to a file inside a client-declared MCP root.",
            param="file_path",
        )
    if not resolved.is_file():
        return local_tool_error("invalid_parameter", "file_path must point to a regular file.", param="file_path")

    size = resolved.stat().st_size
    if size < 1:
        return local_tool_error("invalid_parameter", "Attachment file is empty.", param="file_path")
    if size > max_bytes:
        return local_tool_error(
            "invalid_parameter",
            max_bytes_message,
            param="file_path",
        )

    return await asyncio.to_thread(resolved.read_bytes)


def root_uri_to_path(uri: str) -> Path | None:
    parsed = urlparse(uri)
    if parsed.scheme != "file" or not parsed.path:
        return None
    try:
        return Path(unquote(parsed.path)).expanduser().resolve(strict=True)
    except OSError:
        return None


def resolve_requested_file_path(file_path: str, allowed_roots: list[Path]) -> Path | None:
    candidate = Path(file_path).expanduser()
    candidates = [candidate] if candidate.is_absolute() else [root / candidate for root in allowed_roots]
    for possible in candidates:
        try:
            resolved = possible.resolve(strict=True)
        except OSError:
            continue
        if any(is_relative_to(resolved, root) for root in allowed_roots):
            return resolved
    return None


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


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
