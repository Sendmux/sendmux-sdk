from __future__ import annotations

from fastmcp.server.auth import RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier
from fastmcp.server.middleware import AuthMiddleware

from sendmux_mcp.config import ServerConfig
from sendmux_mcp.hosted_auth import HostedAuthConfig, create_remote_auth_provider
from sendmux_mcp.server import create_server


def test_remote_auth_provider_binds_resource_url_to_jwt_audience() -> None:
    config = HostedAuthConfig(
        issuer="https://app.sendmux.ai",
        authorization_servers=("https://app.sendmux.ai",),
        jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
        resource_base_url="https://mcp.sendmux.ai",
        mcp_path="/mcp",
    )

    auth_provider = create_remote_auth_provider(config)

    assert isinstance(auth_provider, RemoteAuthProvider)
    assert str(auth_provider._get_resource_url("/mcp")) == "https://mcp.sendmux.ai/mcp"
    assert isinstance(auth_provider.token_verifier, JWTVerifier)
    assert auth_provider.token_verifier.audience == "https://mcp.sendmux.ai/mcp"
    assert auth_provider.token_verifier.issuer == "https://app.sendmux.ai"
    assert auth_provider.token_verifier.jwks_uri == "https://app.sendmux.ai/.well-known/jwks.json"


def test_remote_auth_provider_advertises_authorization_server_and_scopes() -> None:
    config = HostedAuthConfig(
        issuer="https://app.sendmux.ai",
        authorization_servers=("https://app.sendmux.ai",),
        jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
        resource_base_url="https://mcp.sendmux.ai",
        mcp_path="/mcp",
        scopes_supported=("mailbox.read", "email.send"),
    )

    auth_provider = create_remote_auth_provider(config)

    assert [str(server) for server in auth_provider.authorization_servers] == ["https://app.sendmux.ai/"]
    assert auth_provider._scopes_supported == ["mailbox.read", "email.send"]
    assert auth_provider.resource_name == "Sendmux MCP"


def test_remote_auth_provider_rejects_mismatched_explicit_audience() -> None:
    config = HostedAuthConfig(
        issuer="https://app.sendmux.ai",
        authorization_servers=("https://app.sendmux.ai",),
        jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
        resource_base_url="https://mcp.sendmux.ai",
        mcp_path="/mcp",
        audience="https://other.example/mcp",
    )

    try:
        create_remote_auth_provider(config)
    except ValueError as error:
        assert str(error) == "hosted MCP JWT audience must match resource URL: https://mcp.sendmux.ai/mcp"
    else:
        raise AssertionError("expected mismatched audience to fail")


def test_create_server_accepts_hosted_remote_auth_provider() -> None:
    auth_provider = create_remote_auth_provider(
        HostedAuthConfig(
            issuer="https://app.sendmux.ai",
            authorization_servers=("https://app.sendmux.ai",),
            jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
            resource_base_url="https://mcp.sendmux.ai",
            mcp_path="/mcp",
        )
    )
    config = ServerConfig(surface="management", api_key="smx_root_test")

    server = create_server(config, auth_provider=auth_provider)

    assert server.auth is auth_provider
    assert any(isinstance(middleware, AuthMiddleware) for middleware in server.middleware)
