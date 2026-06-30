from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass
from urllib.parse import urlparse

from fastmcp import FastMCP
from fastmcp.server.middleware import AuthMiddleware
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from sendmux_mcp.config import DEFAULT_APP_BASE_URL, ServerConfig, Surface, config_from_env, parse_csv
from sendmux_mcp.hosted_auth import HostedAuthConfig, create_remote_auth_provider
from sendmux_mcp.hosted_proxy import HostedProxyConfig
from sendmux_mcp.observability import init_posthog_from_env, posthog_exception_middleware
from sendmux_mcp.permissions import tool_permission_auth_check
from sendmux_mcp.security import OriginGuardMiddleware
from sendmux_mcp.server import create_server

HOSTED_SURFACES: tuple[Surface, ...] = ("mailbox", "management", "sending")
DEFAULT_MCP_RESOURCE_BASE_URL = "https://mcp.sendmux.ai"
DEFAULT_MCP_APP_ORIGIN = "https://app.sendmux.ai"
DEFAULT_MCP_PATH = "/mcp"
HOSTED_CORS_ALLOWED_HEADERS = (
    "Accept",
    "Authorization",
    "Content-Type",
    "Last-Event-ID",
    "Mcp-Session-Id",
    "MCP-Protocol-Version",
)
HOSTED_CORS_EXPOSE_HEADERS = ("Mcp-Session-Id", "MCP-Protocol-Version")
HOSTED_CORS_ALLOWED_METHODS = ("GET", "POST", "DELETE", "OPTIONS")


@dataclass(frozen=True)
class HostedServerRuntimeConfig:
    issuer: str
    authorization_servers: tuple[str, ...]
    jwks_uri: str
    resource_base_url: str
    proxy_url: str
    internal_bearer_token: str | None
    mcp_path: str
    host: str
    port: int
    stateless_http: bool
    scopes_supported: tuple[str, ...]
    allowed_origins: tuple[str, ...]


def hosted_runtime_config_from_env() -> HostedServerRuntimeConfig:
    app_origin = os.environ.get("SENDMUX_MCP_APP_ORIGIN") or origin_from_url(
        os.environ.get("SENDMUX_APP_BASE_URL", DEFAULT_APP_BASE_URL)
    )
    resource_base_url = os.environ.get("SENDMUX_MCP_RESOURCE_BASE_URL", DEFAULT_MCP_RESOURCE_BASE_URL)
    mcp_path = os.environ.get("SENDMUX_MCP_PATH", DEFAULT_MCP_PATH)
    issuer = os.environ.get("SENDMUX_MCP_OAUTH_ISSUER", app_origin)
    authorization_servers = parse_csv(os.environ.get("SENDMUX_MCP_AUTHORIZATION_SERVERS")) or (issuer,)
    jwks_uri = os.environ.get("SENDMUX_MCP_JWKS_URI", f"{app_origin}/.well-known/jwks.json")
    proxy_url = os.environ.get("SENDMUX_MCP_PROXY_URL", f"{app_origin}/api/internal/mcp/proxy")
    allowed_origins = normalise_hosted_allowed_origins(
        parse_csv(os.environ.get("SENDMUX_MCP_ALLOWED_ORIGINS")) or default_hosted_allowed_origins(app_origin)
    )

    return HostedServerRuntimeConfig(
        issuer=issuer,
        authorization_servers=authorization_servers,
        jwks_uri=jwks_uri,
        resource_base_url=resource_base_url,
        proxy_url=proxy_url,
        internal_bearer_token=os.environ.get("INTERNAL_API_SECRET"),
        mcp_path=mcp_path,
        host=os.environ.get("SENDMUX_MCP_HOST", "0.0.0.0"),
        port=int(os.environ.get("SENDMUX_MCP_PORT", "8765")),
        stateless_http=True,
        scopes_supported=parse_csv(os.environ.get("SENDMUX_MCP_SCOPES_SUPPORTED")),
        allowed_origins=allowed_origins,
    )


def create_hosted_server(runtime: HostedServerRuntimeConfig | None = None) -> FastMCP:
    runtime = runtime or hosted_runtime_config_from_env()
    auth_provider = create_remote_auth_provider(
        HostedAuthConfig(
            issuer=runtime.issuer,
            authorization_servers=runtime.authorization_servers,
            jwks_uri=runtime.jwks_uri,
            resource_base_url=runtime.resource_base_url,
            mcp_path=runtime.mcp_path,
            scopes_supported=runtime.scopes_supported,
        )
    )
    parent = FastMCP(
        "Sendmux MCP",
        auth=auth_provider,
        middleware=[AuthMiddleware(auth=tool_permission_auth_check)],
    )

    for surface in HOSTED_SURFACES:
        surface_config = hosted_surface_config(surface, runtime)
        child = create_server(
            surface_config,
            auth_provider=auth_provider,
            hosted_proxy_config=HostedProxyConfig(
                proxy_url=runtime.proxy_url,
                upstream_base_url=surface_config.api_base_url,
                internal_bearer_token=runtime.internal_bearer_token,
            ),
        )
        parent.mount(child)

    @parent.custom_route("/health", methods=["GET"], include_in_schema=False)
    async def health(_request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "surfaces": list(HOSTED_SURFACES)})

    return parent


def run_hosted() -> None:
    observability = init_posthog_from_env()
    runtime = hosted_runtime_config_from_env()
    server = create_hosted_server(runtime)
    try:
        server.run(
            transport="http",
            host=runtime.host,
            port=runtime.port,
            path=runtime.mcp_path,
            middleware=hosted_http_middleware(runtime.allowed_origins),
            stateless_http=runtime.stateless_http,
            show_banner=False,
        )
    finally:
        if observability is not None:
            observability.shutdown()


def hosted_http_middleware(allowed_origins: Sequence[str] | None = None) -> list[Middleware]:
    origins = normalise_hosted_allowed_origins(
        allowed_origins or default_hosted_allowed_origins(DEFAULT_MCP_APP_ORIGIN)
    )
    return [
        posthog_exception_middleware(),
        Middleware(OriginGuardMiddleware, allowed_origins=origins),
        Middleware(
            CORSMiddleware,
            allow_origins=list(origins),
            allow_methods=HOSTED_CORS_ALLOWED_METHODS,
            allow_headers=HOSTED_CORS_ALLOWED_HEADERS,
            expose_headers=HOSTED_CORS_EXPOSE_HEADERS,
            allow_credentials=False,
        )
    ]


def hosted_surface_config(surface: Surface, runtime: HostedServerRuntimeConfig) -> ServerConfig:
    base = config_from_env((surface,), api_key=None, require_api_key=False)
    return ServerConfig(
        surfaces=(surface,),
        api_key=None,
        api_keys={},
        app_base_url=base.app_base_url,
        sending_base_url=base.sending_base_url,
        transport="http",
        host=runtime.host,
        port=runtime.port,
        path=runtime.mcp_path,
        openapi_input_dir=base.openapi_input_dir,
        app_openapi=base.app_openapi,
        sending_openapi=base.sending_openapi,
        allowed_origins=base.allowed_origins,
        http_bearer_token=None,
        allow_unauthenticated_http=True,
        timeout_seconds=base.timeout_seconds,
        stateless_http=runtime.stateless_http,
        retry=base.retry,
    )


def default_hosted_allowed_origins(app_origin: str) -> tuple[str, ...]:
    return (app_origin,)


def normalise_hosted_allowed_origins(origins: Sequence[str]) -> tuple[str, ...]:
    normalised = tuple(dict.fromkeys(origin for origin in origins if origin))
    if "*" in normalised:
        raise ValueError("Hosted MCP requires explicit allowed origins; wildcard '*' is not allowed.")
    return normalised


def origin_from_url(value: str) -> str:
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return DEFAULT_MCP_APP_ORIGIN
    return f"{parsed.scheme}://{parsed.netloc}"
