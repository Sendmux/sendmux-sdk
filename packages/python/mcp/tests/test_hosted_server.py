from __future__ import annotations

import asyncio

import httpx
import pytest

from sendmux_mcp.curation import MAILBOX_TOOLS
from sendmux_mcp.hosted import (
    HOSTED_SURFACES,
    HostedServerRuntimeConfig,
    create_hosted_server,
    hosted_http_middleware,
    hosted_runtime_config_from_env,
    hosted_surface_config,
    origin_from_url,
)
from sendmux_mcp.hosted_auth import HostedAuthConfig, create_remote_auth_provider
from sendmux_mcp.hosted_proxy import HostedProxyConfig
from sendmux_mcp.server import create_server


def runtime_config() -> HostedServerRuntimeConfig:
    return HostedServerRuntimeConfig(
        issuer="https://app.sendmux.ai",
        authorization_servers=("https://app.sendmux.ai",),
        jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
        resource_base_url="https://mcp.sendmux.ai",
        proxy_url="http://sendmux-app.sendmux.svc.cluster.local/api/internal/mcp/proxy",
        internal_bearer_token="internal-service-token",
        mcp_path="/mcp",
        host="127.0.0.1",
        port=8765,
        stateless_http=True,
        scopes_supported=("mailbox.read", "email.send"),
        allowed_origins=("https://app.sendmux.ai",),
    )


def test_hosted_server_mounts_all_surfaces_without_process_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run() -> None:
        monkeypatch.delenv("SENDMUX_API_KEY", raising=False)

        server = create_hosted_server(runtime_config())
        unauthenticated_tools = await server.list_tools()

        assert server.auth is not None
        assert unauthenticated_tools == []

    asyncio.run(run())


def test_hosted_server_rejects_localhost_browser_preflight_by_default() -> None:
    async def run() -> None:
        server = create_hosted_server(runtime_config())
        app = server.http_app(path="/mcp", middleware=hosted_http_middleware(), stateless_http=True)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
            response = await client.options(
                "/mcp",
                headers={
                    "Origin": "http://localhost:6274",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type,mcp-protocol-version",
                },
            )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "origin_forbidden"

    asyncio.run(run())


def test_hosted_server_allows_browser_preflight_from_app_origin() -> None:
    async def run() -> None:
        server = create_hosted_server(runtime_config())
        app = server.http_app(path="/mcp", middleware=hosted_http_middleware(), stateless_http=True)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
            response = await client.options(
                "/mcp",
                headers={
                    "Origin": "https://app.sendmux.ai",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type,mcp-protocol-version",
                },
            )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "https://app.sendmux.ai"
        assert "authorization" in response.headers["access-control-allow-headers"].lower()
        assert "mcp-protocol-version" in response.headers["access-control-allow-headers"].lower()
        assert "post" in response.headers["access-control-allow-methods"].lower()
        assert "access-control-allow-credentials" not in response.headers

    asyncio.run(run())


def test_hosted_server_rejects_unknown_browser_origin_before_auth() -> None:
    async def run() -> None:
        server = create_hosted_server(runtime_config())
        app = server.http_app(path="/mcp", middleware=hosted_http_middleware(), stateless_http=True)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
            response = await client.post(
                "/mcp",
                headers={
                    "Origin": "https://evil.example",
                    "Content-Type": "application/json",
                    "MCP-Protocol-Version": "2025-11-25",
                },
                json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "origin_forbidden"
        assert "www-authenticate" not in response.headers

    asyncio.run(run())


def test_hosted_server_rejects_unknown_browser_preflight() -> None:
    async def run() -> None:
        server = create_hosted_server(runtime_config())
        app = server.http_app(path="/mcp", middleware=hosted_http_middleware(), stateless_http=True)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
            response = await client.options(
                "/mcp",
                headers={
                    "Origin": "https://evil.example",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type,mcp-protocol-version",
                },
            )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "origin_forbidden"

    asyncio.run(run())


def test_hosted_server_exposes_mcp_headers_to_browser_requests() -> None:
    async def run() -> None:
        server = create_hosted_server(runtime_config())
        app = server.http_app(path="/mcp", middleware=hosted_http_middleware(), stateless_http=True)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
            response = await client.post(
                "/mcp",
                headers={
                    "Origin": "https://app.sendmux.ai",
                    "Content-Type": "application/json",
                    "MCP-Protocol-Version": "2025-11-25",
                },
                json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            )

        assert response.headers["access-control-allow-origin"] == "https://app.sendmux.ai"
        assert "mcp-protocol-version" in response.headers["access-control-expose-headers"].lower()
        assert "mcp-session-id" in response.headers["access-control-expose-headers"].lower()
        assert "access-control-allow-credentials" not in response.headers

    asyncio.run(run())


def test_hosted_server_protected_resource_metadata_preserves_authorization_server_origin() -> None:
    async def run() -> None:
        server = create_hosted_server(runtime_config())
        app = server.http_app(path="/mcp", middleware=hosted_http_middleware(), stateless_http=True)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="https://mcp.sendmux.ai") as client:
            response = await client.get("/.well-known/oauth-protected-resource/mcp")

        assert response.status_code == 200
        assert response.json()["authorization_servers"] == ["https://app.sendmux.ai"]

    asyncio.run(run())


def test_hosted_surface_config_does_not_require_upstream_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SENDMUX_API_KEY", raising=False)

    config = hosted_surface_config("management", runtime_config())

    assert config.api_key is None
    assert config.allow_unauthenticated_http
    assert config.transport == "http"


def test_hosted_surface_children_keep_curated_tool_sets_without_process_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run() -> None:
        monkeypatch.delenv("SENDMUX_API_KEY", raising=False)
        runtime = runtime_config()
        auth_provider = create_remote_auth_provider(
            HostedAuthConfig(
                issuer=runtime.issuer,
                authorization_servers=runtime.authorization_servers,
                jwks_uri=runtime.jwks_uri,
                resource_base_url=runtime.resource_base_url,
                mcp_path=runtime.mcp_path,
            )
        )
        tool_names: set[str] = set()

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
            tool_names.update(tool.name for tool in await child.list_tools(run_middleware=False))

        assert "mailbox_get_me" in tool_names
        assert "management_list_domains" in tool_names
        assert "sending_send_email" in tool_names

    asyncio.run(run())


def test_hosted_mailbox_action_tools_expose_mailbox_target(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run() -> None:
        monkeypatch.delenv("SENDMUX_API_KEY", raising=False)

        runtime = runtime_config()
        auth_provider = create_remote_auth_provider(
            HostedAuthConfig(
                issuer=runtime.issuer,
                authorization_servers=runtime.authorization_servers,
                jwks_uri=runtime.jwks_uri,
                resource_base_url=runtime.resource_base_url,
                mcp_path=runtime.mcp_path,
            )
        )
        surface_config = hosted_surface_config("mailbox", runtime)
        child = create_server(
            surface_config,
            auth_provider=auth_provider,
            hosted_proxy_config=HostedProxyConfig(
                proxy_url=runtime.proxy_url,
                upstream_base_url=surface_config.api_base_url,
                internal_bearer_token=runtime.internal_bearer_token,
            ),
        )

        tools = await child.list_tools(run_middleware=False)
        tool_names = {tool.name for tool in tools}
        expected_tool_names = {tool.name for tool in MAILBOX_TOOLS}
        missing_target: list[str] = []

        assert tool_names == expected_tool_names

        for tool in tools:
            properties = (tool.parameters or {}).get("properties", {})
            if tool.name == "mailbox_list_granted_mailboxes":
                assert "mailbox_id" not in properties
                continue
            if tool.name.startswith("mailbox_") and "mailbox_id" not in properties:
                missing_target.append(tool.name)

        assert missing_target == []

    asyncio.run(run())


def test_hosted_runtime_config_uses_public_resource_and_internal_proxy_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SENDMUX_MCP_APP_ORIGIN", "https://app.sendmux.ai")
    monkeypatch.setenv("SENDMUX_MCP_RESOURCE_BASE_URL", "https://mcp.sendmux.ai")
    monkeypatch.setenv("SENDMUX_MCP_PROXY_URL", "http://sendmux-app.sendmux.svc.cluster.local/api/internal/mcp/proxy")
    monkeypatch.setenv("INTERNAL_API_SECRET", "internal-service-token")
    monkeypatch.setenv("SENDMUX_MCP_SCOPES_SUPPORTED", "mailbox.read,email.send")
    monkeypatch.setenv("SENDMUX_MCP_ALLOWED_ORIGINS", "https://app.sendmux.ai,http://localhost:6274")

    config = hosted_runtime_config_from_env()

    assert config.issuer == "https://app.sendmux.ai"
    assert config.jwks_uri == "https://app.sendmux.ai/.well-known/jwks.json"
    assert config.resource_base_url == "https://mcp.sendmux.ai"
    assert config.proxy_url == "http://sendmux-app.sendmux.svc.cluster.local/api/internal/mcp/proxy"
    assert config.internal_bearer_token == "internal-service-token"
    assert config.scopes_supported == ("mailbox.read", "email.send")
    assert config.allowed_origins == ("https://app.sendmux.ai", "http://localhost:6274")


def test_hosted_runtime_config_defaults_to_app_origin_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENDMUX_MCP_APP_ORIGIN", "https://app.sendmux.ai")
    monkeypatch.delenv("SENDMUX_MCP_ALLOWED_ORIGINS", raising=False)

    config = hosted_runtime_config_from_env()

    assert config.allowed_origins == ("https://app.sendmux.ai",)


def test_hosted_runtime_config_rejects_wildcard_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENDMUX_MCP_ALLOWED_ORIGINS", "*")

    with pytest.raises(ValueError, match="wildcard"):
        hosted_runtime_config_from_env()


def test_origin_from_url_strips_api_path() -> None:
    assert origin_from_url("https://app.sendmux.ai/api/v1") == "https://app.sendmux.ai"
