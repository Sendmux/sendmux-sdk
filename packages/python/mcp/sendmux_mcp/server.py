from __future__ import annotations

import asyncio
import base64
import copy
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from binascii import Error as Base64DecodeError
from datetime import datetime, timezone
from importlib.metadata import version
from typing import Annotated, Any
from urllib.parse import quote

import httpx
import httpx2
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.auth import AuthProvider
from fastmcp.server.middleware import AuthMiddleware, CallNext, Middleware, MiddlewareContext
from fastmcp.tools.base import ToolResult
from jsonschema.exceptions import best_match
from jsonschema.protocols import Validator
from jsonschema.validators import validator_for
from mcp.types import CallToolRequestParams
from mcp.types import ToolAnnotations
from pydantic import Field
from starlette.requests import Request
from starlette.responses import JSONResponse

from sendmux_mcp.config import ServerConfig, Surface
from sendmux_mcp.curation import customise_component, mcp_names_for_surface, route_maps_for_surface
from sendmux_mcp.hosted_proxy import (
    HostedProxyConfig,
    HostedProxyTransport,
    build_hosted_operation_manifest,
    close_response,
    decoded_response_headers,
    shield_response_stream,
)
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
CONTENT_RANGE_RE = re.compile(r"^bytes (\d+)-(\d+)/(\d+|\*)$")

JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema"
SENDMUX_MCP_VERSION = version("sendmux-mcp")


class StructuredOutputValidationMiddleware(Middleware):
    def __init__(self) -> None:
        self.validators: dict[str, Validator] = {}

    async def on_call_tool(
        self,
        context: MiddlewareContext[CallToolRequestParams],
        call_next: CallNext[CallToolRequestParams, ToolResult],
    ) -> ToolResult:
        result = await call_next(context)
        if not isinstance(result, ToolResult) or result.is_error:
            return result
        fastmcp_context = context.fastmcp_context
        tool = await fastmcp_context.fastmcp.get_tool(context.message.name) if fastmcp_context is not None else None
        schema = tool.output_schema if tool is not None else None
        if schema is None:
            return result
        if result.structured_content is None:
            raise ToolError("Tool returned no structured data for its declared output schema.")
        validator = self.validators.get(context.message.name)
        if validator is None:
            validator_class = validator_for(schema)
            validator_class.check_schema(schema)
            validator = validator_class(schema)
            self.validators[context.message.name] = validator
        error = best_match(validator.iter_errors(result.structured_content))
        if error is not None:
            raise ToolError("Tool returned data that does not match its declared output schema.")
        return result


class MCPHTTPTransport(httpx2.AsyncBaseTransport):
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        upstream_request = self.client.build_request(
            request.method,
            str(request.url),
            headers=dict(request.headers),
            content=await request.aread(),
        )
        response = await self.client.send(upstream_request, stream=True)
        shield_response_stream(response)
        try:
            if response.is_stream_consumed:
                response_body = response.content
                response_headers = decoded_response_headers(response.headers)
            else:
                response_body = b"".join([chunk async for chunk in response.aiter_raw()])
                response_headers = response.headers
            return httpx2.Response(
                response.status_code,
                headers=response_headers,
                content=response_body,
                request=request,
            )
        finally:
            await close_response(response)

    async def aclose(self) -> None:
        await self.client.aclose()


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
            version=SENDMUX_MCP_VERSION,
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


def content_range_truncated(value: str | None) -> bool | None:
    if not value:
        return None
    match = CONTENT_RANGE_RE.match(value.strip())
    if not match or match.group(3) == "*":
        return None
    end = int(match.group(2))
    total = int(match.group(3))
    return end + 1 < total


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

    middleware = server_middleware(auth_provider)

    mcp_client = httpx2.AsyncClient(base_url=api_base_url, transport=MCPHTTPTransport(client))

    @asynccontextmanager
    async def client_lifespan(_server: FastMCP) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await mcp_client.aclose()

    server = FastMCP.from_openapi(
        openapi_spec=spec,
        client=mcp_client,
        name=f"Sendmux {surface} MCP",
        version=SENDMUX_MCP_VERSION,
        route_maps=route_maps_for_surface(spec, surface),
        mcp_names=mcp_names_for_surface(surface),
        mcp_component_fn=customise_component,
        tags={"sendmux", surface},
        validate_output=True,
        auth=auth_provider,
        middleware=middleware,
        lifespan=client_lifespan,
    )

    if surface == "mailbox":
        add_mailbox_custom_tools(
            server,
            client,
            spec=spec,
            hosted=hosted_proxy_config is not None,
            transport=config.transport,
        )

    if surface == "sending":
        add_sending_custom_tools(
            server,
            client,
            spec=spec,
            hosted=hosted_proxy_config is not None,
            transport=config.transport,
        )

    if include_health:
        @server.custom_route("/health", methods=["GET"], include_in_schema=False)
        async def health(_request: Request) -> JSONResponse:
            return JSONResponse({"status": "ok", "surfaces": [surface]})

    return server


def server_middleware(auth_provider: AuthProvider | None) -> list[Middleware]:
    middleware: list[Middleware] = [StructuredOutputValidationMiddleware()]
    if auth_provider is not None:
        middleware.insert(0, AuthMiddleware(auth=tool_permission_auth_check))
    return middleware


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
    spec: dict[str, Any],
    hosted: bool,
    transport: str,
) -> None:
    attachment_schema = component_schema(spec, "MailboxAttachment")
    text_attachment_schema = extend_object_schema(
        attachment_schema,
        properties={
            "read_mode": {"const": "text"},
            "text": {"type": "string"},
            "truncated": {"type": "boolean"},
            "bytes_read": {"minimum": 0, "type": "integer"},
        },
        required=("read_mode", "text", "truncated", "bytes_read"),
    )
    link_attachment_schema = extend_object_schema(
        attachment_schema,
        properties={
            "read_mode": {"const": "resource_link"},
            "text": {"type": "null"},
            "resource_link": {
                "additionalProperties": False,
                "properties": {
                    "uri": {"type": "string"},
                    "name": {"type": "string"},
                    "mime_type": {"type": "string"},
                    "size_bytes": {"type": ["integer", "null"]},
                },
                "required": ["uri", "name", "mime_type", "size_bytes"],
                "type": "object",
            },
        },
        required=("read_mode", "text", "resource_link"),
    )
    read_attachment_schema = {"oneOf": [attachment_schema, text_attachment_schema, link_attachment_schema]}
    upload_schema = {
        "oneOf": [component_schema(spec, "MailboxAttachmentUploadResult"), component_schema(spec, "MailboxAttachmentUploadIntentResult")]
    }
    wait_schema = {
        "additionalProperties": False,
        "properties": {
            "matched": {"type": "boolean"},
            "message": {
                "oneOf": [
                    {
                        "additionalProperties": False,
                        "properties": {
                            "attachments": {"items": attachment_schema, "type": "array"},
                            "id": {"type": "string"},
                            "received_at": {"type": ["string", "null"]},
                        },
                        "required": ["id", "received_at", "attachments"],
                        "type": "object",
                    },
                    {"type": "null"},
                ]
            },
            "next_after": {"type": "string"},
        },
        "required": ["matched", "message", "next_after"],
        "type": "object",
    }
    @server.tool(
        name="mailbox_get_attachment",
        title="Get Attachment Metadata",
        description=(
            "Use this after finding a message attachment. It returns metadata plus a fresh short-lived "
            "download_url for that exact attachment; fetch the URL promptly, and call this tool again if it expires."
        ),
        tags={"sendmux", "mailbox"},
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=True,
        ),
        output_schema=tool_envelope_schema(attachment_schema),
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
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=True,
        ),
        output_schema=tool_envelope_schema(read_attachment_schema),
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
            headers={"Range": f"bytes=0-{effective_max - 1}"},
        )
        if response.status_code >= 400:
            return json_payload(response)

        content = response.content
        content_range_result = content_range_truncated(response.headers.get("Content-Range"))
        truncated = content_range_result if content_range_result is not None else response.status_code == 206
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
            "Use this before sending a mailbox attachment. For real files set presign_upload_url=true with filename, "
            "content_type, and size_bytes, then PUT the file to the returned "
            "short-lived URL promptly and send the returned blob_id. Inline content_base64 is a last resort for tiny "
            "agent-authored files only and is capped at 32 KiB decoded."
        ),
        tags={"sendmux", "mailbox"},
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=False,
            open_world_hint=True,
        ),
        output_schema=tool_envelope_schema(upload_schema),
    )
    async def mailbox_upload_attachment(
        filename: Annotated[str, Field(description="Filename to use when sending the uploaded attachment.")],
        content_base64: Annotated[
            str | None,
            Field(
                description=(
                    "Last-resort inline base64 for tiny agent-authored files only. Decoded content must be at most 32 KiB; use presign_upload_url for real files."
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
        mode_count = sum(1 for enabled in (bool(content_base64), presign_upload_url) if enabled)
        if mode_count != 1:
            return local_tool_error(
                "invalid_parameter",
                "Provide exactly one attachment input mode: presign_upload_url or content_base64.",
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
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=True,
        ),
        output_schema=tool_envelope_schema(wait_schema),
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
                matched_message = (
                    {
                        "attachments": attachments_from_message(message),
                        "id": message.get("id", ""),
                        "received_at": message.get("received_at"),
                    }
                    if isinstance(message, dict)
                    else {"attachments": [], "id": "", "received_at": None}
                )
                return {
                    "ok": True,
                    "data": {
                        "matched": True,
                        "message": matched_message,
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
    spec: dict[str, Any],
    hosted: bool,
    transport: str,
) -> None:
    @server.tool(
        name="sending_upload_attachment",
        title="Upload Attachment",
        description=(
            "Use this before sending a Sending API attachment. For real files use "
            "sending_create_attachment_upload and PUT the file outside model context. Inline content_base64 is a last "
            "resort for tiny agent-authored files only and is capped at 32 KiB decoded."
        ),
        tags={"sendmux", "sending"},
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=False,
            open_world_hint=True,
        ),
        output_schema=tool_envelope_schema(component_schema(spec, "AttachmentUploadData")),
    )
    async def sending_upload_attachment(
        filename: Annotated[str, Field(description="Filename to use when sending the uploaded attachment.")],
        content_base64: Annotated[
            str | None,
            Field(
                description=(
                    "Last-resort inline base64 for tiny agent-authored files only. Decoded content must be at most 32 KiB; use a presigned upload for real files."
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
        if not content_base64:
            return local_tool_error(
                "invalid_parameter",
                "content_base64 is required.",
                param="content_base64",
            )

        content = decode_base64_attachment(content_base64)
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


def component_schema(spec: dict[str, Any], name: str) -> dict[str, Any]:
    schema = copy.deepcopy(spec["components"]["schemas"][name])
    return rewrite_component_refs(schema, spec)


def extend_object_schema(
    schema: dict[str, Any],
    *,
    properties: dict[str, Any],
    required: tuple[str, ...],
) -> dict[str, Any]:
    extended = copy.deepcopy(schema)
    extended["properties"].update(properties)
    extended["required"] = [*extended.get("required", []), *required]
    return extended


def rewrite_component_refs(value: Any, spec: dict[str, Any]) -> Any:
    if isinstance(value, list):
        return [rewrite_component_refs(item, spec) for item in value]
    if not isinstance(value, dict):
        return value
    reference = value.get("$ref")
    prefix = "#/components/schemas/"
    if isinstance(reference, str) and reference.startswith(prefix):
        return component_schema(spec, reference.removeprefix(prefix))
    return {key: rewrite_component_refs(child, spec) for key, child in value.items()}


def tool_envelope_schema(data_schema: dict[str, Any]) -> dict[str, Any]:
    meta_schema = {
        "additionalProperties": False,
        "properties": {"request_id": {"type": "string"}},
        "type": "object",
    }
    success = {
        "additionalProperties": False,
        "properties": {"ok": {"const": True}, "data": data_schema, "meta": meta_schema},
        "required": ["ok", "data"],
        "type": "object",
    }
    error = {
        "additionalProperties": False,
        "properties": {
            "ok": {"const": False},
            "error": {
                "additionalProperties": False,
                "properties": {
                    "code": {"type": "string"},
                    "doc_url": {"type": "string"},
                    "errors": {
                        "items": {
                            "additionalProperties": False,
                            "properties": {
                                "code": {"type": "string"},
                                "field": {"type": "string"},
                                "message": {"type": "string"},
                            },
                            "required": ["field", "code", "message"],
                            "type": "object",
                        },
                        "type": "array",
                    },
                    "message": {"type": "string"},
                    "param": {"type": "string"},
                    "retryable": {"type": "boolean"},
                },
                "required": ["code", "message"],
                "type": "object",
            },
            "meta": meta_schema,
        },
        "required": ["ok", "error"],
        "type": "object",
    }
    return {"$schema": JSON_SCHEMA_2020_12, "oneOf": [success, error], "type": "object"}


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
            "Inline base64 exceeds the MCP cap of 32 KiB decoded bytes. Use presign_upload_url and PUT the file outside model context.",
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
            "Inline base64 exceeds the MCP cap of 32 KiB decoded bytes. Use presign_upload_url and PUT the file outside model context.",
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
