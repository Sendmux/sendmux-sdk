from __future__ import annotations

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth import AuthProvider
from fastmcp.server.middleware import AuthMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from sendmux_mcp.config import ServerConfig, Surface
from sendmux_mcp.curation import customise_component, mcp_names_for_surface, route_maps_for_surface
from sendmux_mcp.hosted_proxy import HostedProxyConfig, HostedProxyTransport, build_hosted_operation_manifest
from sendmux_mcp.permissions import tool_permission_auth_check
from sendmux_mcp.retry import RetryingAsyncTransport
from sendmux_mcp.security import middleware_for_config
from sendmux_mcp.specs import load_spec, prepare_for_fastmcp


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
