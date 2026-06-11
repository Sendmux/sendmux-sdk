from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastmcp.server.auth import AccessToken

from sendmux_mcp.config import ServerConfig
from sendmux_mcp.hosted_proxy import (
    HostedProxyConfig,
    HostedProxyTransport,
    build_hosted_operation_manifest,
)
from sendmux_mcp.hosted_auth import HostedAuthConfig, create_remote_auth_provider
from sendmux_mcp.server import create_server
from sendmux_mcp.specs import load_spec, prepare_for_fastmcp


def test_operation_manifest_resolves_curated_route_to_operation_id() -> None:
    config = ServerConfig(surfaces=("management",), api_key="smx_root_test")
    spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
    manifest = build_hosted_operation_manifest(spec, "management")

    route = manifest.resolve("GET", "/domains")

    assert route is not None
    assert route.operation_id == "managementListDomains"
    assert route.tool_name == "management_list_domains"
    assert route.permissions == ("domain.read",)


def test_proxy_transport_sends_operation_envelope_without_token_passthrough(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run() -> None:
        captured: list[httpx.Request] = []

        async def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(
                202,
                json={"ok": True},
                headers={"X-RateLimit-Remaining": "9"},
                request=request,
            )

        monkeypatch.setattr(
            "sendmux_mcp.hosted_proxy.get_access_token",
            lambda: AccessToken(
                token="inbound-mcp-token",
                client_id="mcp_client_public",
                scopes=[],
                claims={"grant_id": "mcp_grant_public"},
            ),
        )

        config = ServerConfig(surfaces=("management",), api_key="smx_root_test")
        spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
        manifest = build_hosted_operation_manifest(spec, "management")
        transport = HostedProxyTransport(
            HostedProxyConfig(
                proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy",
                upstream_base_url=config.api_base_url,
                internal_bearer_token="internal-service-token",
            ),
            manifest=manifest,
            inner=httpx.MockTransport(handler),
        )

        request = httpx.Request(
            "GET",
            "https://app.sendmux.ai/api/v1/domains?limit=10",
            headers={
                "Authorization": "Bearer inbound-mcp-token",
                "Cookie": "session=secret",
                "Idempotency-Key": "idem_123",
            },
        )

        response = await transport.handle_async_request(request)

        assert response.status_code == 202
        assert response.request is request
        assert len(captured) == 1
        proxy_request = captured[0]
        assert proxy_request.method == "POST"
        assert str(proxy_request.url) == "https://app.sendmux.ai/api/internal/mcp/proxy"
        assert proxy_request.headers["authorization"] == "Bearer internal-service-token"

        envelope = json.loads((await proxy_request.aread()).decode())
        assert envelope == {
            "grant_id": "mcp_grant_public",
            "operation_id": "managementListDomains",
            "tool_name": "management_list_domains",
            "surface": "management",
            "method": "GET",
            "path": "/domains",
            "query": "limit=10",
            "headers": {"idempotency-key": "idem_123"},
            "body_base64": None,
        }

    asyncio.run(run())


def test_proxy_transport_sends_mailbox_id_for_mailbox_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run() -> None:
        captured: list[httpx.Request] = []

        async def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(202, json={"ok": True}, request=request)

        monkeypatch.setattr(
            "sendmux_mcp.hosted_proxy.get_access_token",
            lambda: AccessToken(
                token="inbound-mcp-token",
                client_id="mcp_client_public",
                scopes=[],
                claims={"grant_id": "mcp_grant_public"},
            ),
        )

        config = ServerConfig(surfaces=("mailbox",), api_key="smx_mbx_test")
        spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
        manifest = build_hosted_operation_manifest(spec, "mailbox")
        transport = HostedProxyTransport(
            HostedProxyConfig(
                proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy",
                upstream_base_url=config.api_base_url,
            ),
            manifest=manifest,
            inner=httpx.MockTransport(handler),
        )

        response = await transport.handle_async_request(
            httpx.Request(
                "GET",
                "https://app.sendmux.ai/api/v1/mailbox/messages?mailbox_id=mbx_granted&limit=1",
            )
        )

        assert response.status_code == 202
        envelope = json.loads((await captured[0].aread()).decode())
        assert envelope["operation_id"] == "mailboxListMessages"
        assert envelope["tool_name"] == "mailbox_list_messages"
        assert envelope["mailbox_id"] == "mbx_granted"
        assert envelope["query"] == "mailbox_id=mbx_granted&limit=1"

    asyncio.run(run())


def test_hosted_proxy_server_does_not_require_process_upstream_api_key() -> None:
    auth_provider = create_remote_auth_provider(
        HostedAuthConfig(
            issuer="https://app.sendmux.ai",
            authorization_servers=("https://app.sendmux.ai",),
            jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
            resource_base_url="https://mcp.sendmux.ai",
            mcp_path="/mcp",
        )
    )
    config = ServerConfig(surfaces=("management",), api_key=None)

    server = create_server(
        config,
        auth_provider=auth_provider,
        hosted_proxy_config=HostedProxyConfig(
            proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy",
            upstream_base_url=config.api_base_url,
            internal_bearer_token="internal-service-token",
        ),
    )

    assert server.auth is auth_provider


def test_proxy_transport_fails_closed_without_grant_claim(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run() -> None:
        monkeypatch.setattr("sendmux_mcp.hosted_proxy.get_access_token", lambda: None)

        config = ServerConfig(surfaces=("management",), api_key="smx_root_test")
        spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
        transport = HostedProxyTransport(
            HostedProxyConfig(proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy", upstream_base_url=config.api_base_url),
            manifest=build_hosted_operation_manifest(spec, "management"),
            inner=httpx.MockTransport(lambda _request: httpx.Response(204)),
        )

        response = await transport.handle_async_request(
            httpx.Request("GET", "https://app.sendmux.ai/api/v1/domains?limit=10")
        )

        assert response.status_code == 401
        assert response.json() == {"error": "invalid_token"}

    asyncio.run(run())


def test_proxy_transport_fails_closed_for_non_curated_operation(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run() -> None:
        monkeypatch.setattr(
            "sendmux_mcp.hosted_proxy.get_access_token",
            lambda: AccessToken(
                token="inbound-mcp-token",
                client_id="mcp_client_public",
                scopes=[],
                claims={"grant_id": "mcp_grant_public"},
            ),
        )

        config = ServerConfig(surfaces=("management",), api_key="smx_root_test")
        spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
        transport = HostedProxyTransport(
            HostedProxyConfig(proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy", upstream_base_url=config.api_base_url),
            manifest=build_hosted_operation_manifest(spec, "management"),
            inner=httpx.MockTransport(lambda _request: httpx.Response(204)),
        )

        response = await transport.handle_async_request(
            httpx.Request("GET", "https://app.sendmux.ai/api/v1/not-curated")
        )

        assert response.status_code == 403
        assert response.json() == {"error": "operation_not_allowed"}

    asyncio.run(run())
