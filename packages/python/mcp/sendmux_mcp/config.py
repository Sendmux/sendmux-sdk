from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from sendmux_core import validate_api_key

Surface = Literal["mailbox", "management", "sending"]
Transport = Literal["stdio", "http", "streamable-http"]

DEFAULT_APP_BASE_URL = "https://app.sendmux.ai/api/v1"
DEFAULT_SENDING_BASE_URL = "https://smtp.sendmux.ai/api/v1"


@dataclass(frozen=True)
class RetryConfig:
    max_attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 8.0


@dataclass(frozen=True)
class ServerConfig:
    surface: Surface
    api_key: str
    app_base_url: str = DEFAULT_APP_BASE_URL
    sending_base_url: str = DEFAULT_SENDING_BASE_URL
    transport: Transport = "stdio"
    host: str = "127.0.0.1"
    port: int = 8765
    path: str = "/mcp"
    openapi_input_dir: str | None = None
    app_openapi: str | None = None
    sending_openapi: str | None = None
    allowed_origins: tuple[str, ...] = ()
    http_bearer_token: str | None = None
    allow_unauthenticated_http: bool = False
    timeout_seconds: float = 30.0
    stateless_http: bool = True
    retry: RetryConfig = RetryConfig()

    @property
    def required_key_surface(self) -> Literal["root", "mailbox"]:
        return "mailbox" if self.surface == "mailbox" else "root"

    @property
    def api_base_url(self) -> str:
        return self.sending_base_url if self.surface == "sending" else self.app_base_url

    def validate(self) -> None:
        validate_api_key(self.api_key, surface=self.required_key_surface)
        if self.transport in {"http", "streamable-http"} and not self.allow_unauthenticated_http:
            if not self.http_bearer_token:
                raise ValueError(
                    "HTTP transport requires SENDMUX_MCP_HTTP_BEARER_TOKEN or --allow-unauthenticated-http."
                )


def config_from_env(surface: Surface, *, api_key: str | None = None) -> ServerConfig:
    transport = normalise_transport(os.environ.get("SENDMUX_MCP_TRANSPORT", "stdio"))
    return ServerConfig(
        surface=surface,
        api_key=api_key or require_env("SENDMUX_API_KEY"),
        app_base_url=os.environ.get("SENDMUX_APP_BASE_URL", DEFAULT_APP_BASE_URL),
        sending_base_url=os.environ.get("SENDMUX_SENDING_BASE_URL", DEFAULT_SENDING_BASE_URL),
        transport=transport,
        host=os.environ.get("SENDMUX_MCP_HOST", "127.0.0.1"),
        port=int(os.environ.get("SENDMUX_MCP_PORT", "8765")),
        path=os.environ.get("SENDMUX_MCP_PATH", "/mcp"),
        openapi_input_dir=os.environ.get("SENDMUX_MCP_OPENAPI_INPUT_DIR") or os.environ.get("OPENAPI_INPUT_DIR"),
        app_openapi=os.environ.get("SENDMUX_MCP_APP_OPENAPI"),
        sending_openapi=os.environ.get("SENDMUX_MCP_SENDING_OPENAPI"),
        allowed_origins=parse_csv(os.environ.get("SENDMUX_MCP_ALLOWED_ORIGINS")),
        http_bearer_token=os.environ.get("SENDMUX_MCP_HTTP_BEARER_TOKEN"),
        allow_unauthenticated_http=parse_bool(os.environ.get("SENDMUX_MCP_ALLOW_UNAUTHENTICATED_HTTP")),
        timeout_seconds=float(os.environ.get("SENDMUX_MCP_TIMEOUT_SECONDS", "30")),
        stateless_http=parse_bool(os.environ.get("SENDMUX_MCP_STATELESS_HTTP"), default=True),
        retry=RetryConfig(
            max_attempts=int(os.environ.get("SENDMUX_MCP_RETRY_MAX_ATTEMPTS", "3")),
            base_delay_seconds=float(os.environ.get("SENDMUX_MCP_RETRY_BASE_DELAY_SECONDS", "0.25")),
            max_delay_seconds=float(os.environ.get("SENDMUX_MCP_RETRY_MAX_DELAY_SECONDS", "8")),
        ),
    )


def normalise_transport(value: str) -> Transport:
    if value == "streamable-http":
        return "streamable-http"
    if value in {"stdio", "http"}:
        return value  # type: ignore[return-value]
    raise ValueError("transport must be one of: stdio, http, streamable-http")


def parse_csv(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


def parse_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Missing required environment variable {name}")
    return value
