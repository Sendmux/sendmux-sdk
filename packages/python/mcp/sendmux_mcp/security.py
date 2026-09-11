from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence

from starlette.datastructures import Headers
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from sendmux_mcp.config import ServerConfig


class OriginGuardMiddleware:
    def __init__(self, app: ASGIApp, *, allowed_origins: Sequence[str]) -> None:
        self.app = app
        self.allowed_origins = set(allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin and "*" not in self.allowed_origins and origin not in self.allowed_origins:
            await forbidden("Origin is not allowed.")(scope, receive, send)
            return

        await self.app(scope, receive, send)


class HttpBearerMiddleware:
    def __init__(self, app: ASGIApp, *, token: str, public_paths: Sequence[str] = ("/health",)) -> None:
        self.app = app
        self.token = token
        self.public_paths = set(public_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") in self.public_paths:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        expected = f"Bearer {self.token}"
        if headers.get("authorization") != expected:
            await unauthorised("MCP bearer token is required.")(scope, receive, send)
            return

        await self.app(scope, receive, send)


class MCPHeaderGuardMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        allowed_preflight_headers: Sequence[str],
        max_params: int = 16,
        max_name_bytes: int = 64,
        max_value_bytes: int = 1024,
    ) -> None:
        self.app = app
        self.allowed_preflight_headers = {name.lower() for name in allowed_preflight_headers}
        self.max_params = max_params
        self.max_name_bytes = max_name_bytes
        self.max_value_bytes = max_value_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        names = [name.strip().lower() for name in headers.get("access-control-request-headers", "").split(",")]
        names = [name for name in names if name]
        unknown_names = [
            name for name in names if name not in self.allowed_preflight_headers and not name.startswith("mcp-param-")
        ]
        if unknown_names:
            await invalid_mcp_header("Preflight requested an unsupported header.")(scope, receive, send)
            return
        parameter_names = [name for name in names if name.startswith("mcp-param-")]
        parameter_headers = [(name, value) for name, value in headers.items() if name.startswith("mcp-param-")]
        if len(parameter_names) > self.max_params or len(parameter_headers) > self.max_params:
            await invalid_mcp_header("Too many Mcp-Param-* headers.")(scope, receive, send)
            return
        if any(len(name.encode()) > self.max_name_bytes for name in [*parameter_names, *(name for name, _ in parameter_headers)]):
            await invalid_mcp_header("Mcp-Param-* header name is too long.")(scope, receive, send)
            return
        if any(len(value.encode()) > self.max_value_bytes for _, value in parameter_headers):
            await invalid_mcp_header("Mcp-Param-* header value is too long.")(scope, receive, send)
            return

        await self.app(scope, receive, send)


class BearerScopeChallengeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, scopes: Sequence[str]) -> None:
        super().__init__(app)
        self.scope_value = " ".join(scopes)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        challenge = response.headers.get("www-authenticate")
        if response.status_code == 401 and challenge and "bearer" in challenge.lower() and self.scope_value:
            if 'scope="' not in challenge.lower():
                response.headers["WWW-Authenticate"] = f'{challenge}, scope="{self.scope_value}"'
        return response


def middleware_for_config(config: ServerConfig) -> list[Middleware]:
    middleware = [Middleware(OriginGuardMiddleware, allowed_origins=config.allowed_origins)]
    if config.http_bearer_token and not config.allow_unauthenticated_http:
        middleware.append(Middleware(HttpBearerMiddleware, token=config.http_bearer_token))
    return middleware


def forbidden(message: str) -> ASGIResponse:
    return JSONResponse({"ok": False, "error": {"code": "origin_forbidden", "message": message}}, status_code=403)


def unauthorised(message: str) -> ASGIResponse:
    return JSONResponse({"ok": False, "error": {"code": "unauthorised", "message": message}}, status_code=401)


def invalid_mcp_header(message: str) -> ASGIResponse:
    return JSONResponse({"ok": False, "error": {"code": "invalid_mcp_header", "message": message}}, status_code=400)


ASGIResponse = Callable[[Scope, Receive, Send], Awaitable[None]]
