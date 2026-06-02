from __future__ import annotations

import httpx
from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from sendmux_mcp.config import ServerConfig
from sendmux_mcp.curation import customise_component, mcp_names_for_surface, route_maps_for_surface
from sendmux_mcp.retry import RetryingAsyncTransport
from sendmux_mcp.security import middleware_for_config
from sendmux_mcp.specs import load_spec, prepare_for_fastmcp


def create_server(config: ServerConfig, *, transport: httpx.AsyncBaseTransport | None = None) -> FastMCP:
    config.validate()
    raw_spec = load_spec(config)
    spec = prepare_for_fastmcp(raw_spec, base_url=config.api_base_url)
    retrying_transport = RetryingAsyncTransport(retry=config.retry, inner=transport)
    client = httpx.AsyncClient(
        base_url=config.api_base_url,
        headers={"Authorization": f"Bearer {config.api_key}"},
        timeout=config.timeout_seconds,
        transport=retrying_transport,
    )

    server = FastMCP.from_openapi(
        openapi_spec=spec,
        client=client,
        name=f"Sendmux {config.surface} MCP",
        route_maps=route_maps_for_surface(spec, config.surface),
        mcp_names=mcp_names_for_surface(config.surface),
        mcp_component_fn=customise_component,
        tags={"sendmux", config.surface},
        validate_output=False,
    )

    @server.custom_route("/health", methods=["GET"], include_in_schema=False)
    async def health(_request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "surface": config.surface})

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
