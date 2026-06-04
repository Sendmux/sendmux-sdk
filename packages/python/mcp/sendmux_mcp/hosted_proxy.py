from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from typing import Any, Mapping

import httpx
from fastmcp.server.dependencies import get_access_token

from sendmux_mcp.config import Surface
from sendmux_mcp.curation import TOOLS_BY_SURFACE
from sendmux_mcp.permissions import permissions_for_tool
from sendmux_mcp.specs import operation_routes

HOP_BY_HOP_HEADERS = {
    "authorization",
    "cookie",
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "upgrade",
    "te",
    "keep-alive",
    "expect",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
}


@dataclass(frozen=True)
class HostedProxyConfig:
    proxy_url: str
    upstream_base_url: str
    internal_bearer_token: str | None = None


@dataclass(frozen=True)
class HostedOperationRoute:
    operation_id: str
    tool_name: str
    surface: Surface
    method: str
    path_template: str
    permissions: tuple[str, ...]
    path_pattern: re.Pattern[str]


class HostedOperationManifest:
    def __init__(self, routes: tuple[HostedOperationRoute, ...]) -> None:
        self.routes = routes

    def resolve(self, method: str, path: str) -> HostedOperationRoute | None:
        method = method.upper()
        for route in self.routes:
            if route.method == method and route.path_pattern.match(path):
                return route
        return None


class HostedProxyTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        config: HostedProxyConfig,
        *,
        manifest: HostedOperationManifest,
        inner: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.config = config
        self.manifest = manifest
        self.inner = inner or httpx.AsyncHTTPTransport()
        self._base_path = httpx.URL(config.upstream_base_url).path.rstrip("/")

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = await request.aread()
        relative_path = self._relative_path(request.url)
        route = self.manifest.resolve(request.method, relative_path)
        if route is None:
            return httpx.Response(403, json={"error": "operation_not_allowed"}, request=request)

        grant_id = current_grant_id()
        if grant_id is None:
            return httpx.Response(401, json={"error": "invalid_token"}, request=request)

        proxy_request = self._proxy_request(request, route, grant_id, relative_path, body)
        proxy_response = await self.inner.handle_async_request(proxy_request)
        proxy_body = await proxy_response.aread()

        return httpx.Response(
            status_code=proxy_response.status_code,
            headers=proxy_response.headers,
            content=proxy_body,
            extensions=proxy_response.extensions,
            request=request,
        )

    async def aclose(self) -> None:
        await self.inner.aclose()

    def _relative_path(self, url: httpx.URL) -> str:
        path = url.path
        if self._base_path and path.startswith(f"{self._base_path}/"):
            return path[len(self._base_path) :]
        if self._base_path and path == self._base_path:
            return "/"
        return path

    def _proxy_request(
        self,
        request: httpx.Request,
        route: HostedOperationRoute,
        grant_id: str,
        relative_path: str,
        body: bytes,
    ) -> httpx.Request:
        headers = {"content-type": "application/json"}
        if self.config.internal_bearer_token:
            headers["authorization"] = f"Bearer {self.config.internal_bearer_token}"

        envelope = {
            "grant_id": grant_id,
            "operation_id": route.operation_id,
            "tool_name": route.tool_name,
            "surface": route.surface,
            "method": request.method.upper(),
            "path": relative_path,
            "query": request.url.query.decode("ascii"),
            "headers": sanitised_headers(request.headers),
            "body_base64": base64.b64encode(body).decode("ascii") if body else None,
        }

        return httpx.Request(
            "POST",
            self.config.proxy_url,
            headers=headers,
            content=json.dumps(envelope, separators=(",", ":")).encode("utf8"),
        )


def build_hosted_operation_manifest(document: Mapping[str, Any], surface: Surface) -> HostedOperationManifest:
    operation_route_map = operation_routes(dict(document))
    routes: list[HostedOperationRoute] = []
    missing: list[str] = []

    for tool in TOOLS_BY_SURFACE[surface]:
        route = operation_route_map.get(tool.operation_id)
        if route is None:
            missing.append(tool.operation_id)
            continue
        method, path_template = route
        routes.append(
            HostedOperationRoute(
                operation_id=tool.operation_id,
                tool_name=tool.name,
                surface=surface,
                method=method,
                path_template=path_template,
                permissions=permissions_for_tool(tool.name),
                path_pattern=path_template_pattern(path_template),
            )
        )

    if missing:
        raise ValueError(f"OpenAPI document is missing hosted proxy operations for {surface}: {', '.join(missing)}")

    return HostedOperationManifest(tuple(routes))


def current_grant_id() -> str | None:
    token = get_access_token()
    if token is None:
        return None
    claims = token.claims or {}
    grant_id = claims.get("grant_id")
    return grant_id if isinstance(grant_id, str) and grant_id else None


def sanitised_headers(headers: httpx.Headers) -> Mapping[str, str]:
    return {
        key.lower(): value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }


def path_template_pattern(path_template: str) -> re.Pattern[str]:
    parts = []
    for part in re.split(r"(\{[^/{}]+\})", path_template):
        if part.startswith("{") and part.endswith("}"):
            parts.append(r"[^/]+")
        else:
            parts.append(re.escape(part))
    return re.compile("^" + "".join(parts) + "$")
