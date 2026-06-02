from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence

from starlette.datastructures import Headers
from starlette.middleware import Middleware
from starlette.responses import JSONResponse
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


def middleware_for_config(config: ServerConfig) -> list[Middleware]:
    middleware = [Middleware(OriginGuardMiddleware, allowed_origins=config.allowed_origins)]
    if config.http_bearer_token and not config.allow_unauthenticated_http:
        middleware.append(Middleware(HttpBearerMiddleware, token=config.http_bearer_token))
    return middleware


def forbidden(message: str) -> ASGIResponse:
    return JSONResponse({"ok": False, "error": {"code": "origin_forbidden", "message": message}}, status_code=403)


def unauthorised(message: str) -> ASGIResponse:
    return JSONResponse({"ok": False, "error": {"code": "unauthorised", "message": message}}, status_code=401)


ASGIResponse = Callable[[Scope, Receive, Send], Awaitable[None]]
