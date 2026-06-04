from __future__ import annotations

from dataclasses import dataclass

from fastmcp.server.auth import RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier
from pydantic import AnyHttpUrl


@dataclass(frozen=True)
class HostedAuthConfig:
    issuer: str
    authorization_servers: tuple[str, ...]
    jwks_uri: str
    resource_base_url: str
    mcp_path: str = "/mcp"
    audience: str | None = None
    scopes_supported: tuple[str, ...] = ()
    resource_name: str = "Sendmux MCP"

    @property
    def resource_url(self) -> str:
        base_url = self.resource_base_url.rstrip("/")
        path = "/" + self.mcp_path.strip("/")
        return f"{base_url}{path}"


def create_remote_auth_provider(config: HostedAuthConfig) -> RemoteAuthProvider:
    audience = config.audience or config.resource_url
    if audience != config.resource_url:
        raise ValueError(f"hosted MCP JWT audience must match resource URL: {config.resource_url}")

    token_verifier = JWTVerifier(
        jwks_uri=config.jwks_uri,
        issuer=config.issuer,
        audience=audience,
    )

    return RemoteAuthProvider(
        token_verifier=token_verifier,
        authorization_servers=[AnyHttpUrl(server) for server in config.authorization_servers],
        base_url=config.resource_base_url,
        resource_base_url=config.resource_base_url,
        scopes_supported=list(config.scopes_supported) or None,
        resource_name=config.resource_name,
    )
