from __future__ import annotations

import hashlib
import os
import re
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass
from typing import Any, Protocol, cast

from posthog import Posthog
from starlette.middleware import Middleware
from starlette.types import ASGIApp, Receive, Scope, Send


DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com"
POSTHOG_TOOL_EVENT = "mcp_tool_call"
POSTHOG_HOSTED_EXCEPTION_EVENT = "mcp_hosted_exception"
SERVICE_NAME = "sendmux-mcp-hosted"

SENSITIVE_KEYS = {
    "access_token",
    "api_key",
    "authorization",
    "body",
    "body_base64",
    "claims",
    "content",
    "cookie",
    "cookies",
    "email",
    "env",
    "first_name",
    "from",
    "full_name",
    "grant_id",
    "headers",
    "html",
    "id_token",
    "jwt",
    "last_name",
    "mailbox_id",
    "mailbox_ids",
    "mcp_session_id",
    "message",
    "messages",
    "name",
    "password",
    "path",
    "payload",
    "permissions",
    "provider_payload",
    "proxy_authorization",
    "query",
    "refresh_token",
    "request",
    "request_body",
    "scope",
    "secret",
    "set_cookie",
    "sub",
    "subject",
    "team_public_id",
    "text",
    "to",
    "token",
}

EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
SECRET_RE = re.compile(r"(?i)\b(?:bearer|basic|api[_-]?key|token|secret)\s+[-._~+/=A-Z0-9]+\b")


class PostHogClient(Protocol):
    def capture(self, *, distinct_id: str, event: str, properties: Mapping[str, Any]) -> Any: ...

    def flush(self, timeout_seconds: float | None = 10) -> None: ...

    def shutdown(self) -> None: ...


@dataclass(frozen=True)
class PostHogConfig:
    project_api_key: str
    host: str
    environment: str
    release: str | None


class HostedMcpPostHog:
    def __init__(self, client: PostHogClient, config: PostHogConfig) -> None:
        self.client = client
        self.config = config

    def capture_tool_call(
        self,
        *,
        method: str,
        tool_name: str | None,
        surface: str | None,
        success: bool,
        latency_ms: float,
        status_code: int | None = None,
        error_class: str | None = None,
        grant_id: str | None = None,
        mailbox_id: str | None = None,
    ) -> None:
        properties: dict[str, Any] = {
            "service": SERVICE_NAME,
            "environment": self.config.environment,
            "method": method.upper(),
            "success": success,
            "latency_ms": round(latency_ms, 3),
        }
        if self.config.release:
            properties["release"] = self.config.release
        if tool_name:
            properties["tool"] = tool_name
        if surface:
            properties["surface"] = surface
        if status_code is not None:
            properties["status_code"] = status_code
        if error_class:
            properties["error_class"] = error_class

        grant_hash = hash_identifier("grant", grant_id)
        mailbox_hash = hash_identifier("mailbox", mailbox_id)
        if grant_hash:
            properties["grant_id_hash"] = grant_hash
        if mailbox_hash:
            properties["mailbox_id_hash"] = mailbox_hash

        self.client.capture(
            distinct_id=grant_hash or SERVICE_NAME,
            event=POSTHOG_TOOL_EVENT,
            properties=redact_observability_properties(properties),
        )

    def capture_hosted_exception(
        self,
        error: BaseException,
        *,
        method: str | None = None,
        surface: str | None = None,
    ) -> None:
        self.client.capture(
            distinct_id=SERVICE_NAME,
            event=POSTHOG_HOSTED_EXCEPTION_EVENT,
            properties=redact_observability_properties(
                {
                    "service": SERVICE_NAME,
                    "environment": self.config.environment,
                    "release": self.config.release,
                    "method": method,
                    "surface": surface,
                    "success": False,
                    "error_class": type(error).__name__,
                }
            ),
        )

    def flush(self) -> None:
        self.client.flush(timeout_seconds=10)

    def shutdown(self) -> None:
        self.client.shutdown()


_active_posthog: HostedMcpPostHog | None = None


def posthog_config_from_env() -> PostHogConfig | None:
    project_api_key = clean_env_value(os.environ.get("POSTHOG_PROJECT_TOKEN"))
    if not project_api_key:
        return None

    return PostHogConfig(
        project_api_key=project_api_key,
        host=clean_env_value(os.environ.get("POSTHOG_HOST")) or DEFAULT_POSTHOG_HOST,
        environment=clean_env_value(os.environ.get("POSTHOG_ENVIRONMENT"))
        or clean_env_value(os.environ.get("ENVIRONMENT"))
        or clean_env_value(os.environ.get("NODE_ENV"))
        or "unknown",
        release=clean_env_value(os.environ.get("SENDMUX_MCP_RELEASE")),
    )


def init_posthog_from_env() -> HostedMcpPostHog | None:
    global _active_posthog

    config = posthog_config_from_env()
    if config is None:
        _active_posthog = None
        return None

    client = Posthog(
        project_api_key=config.project_api_key,
        host=config.host,
        disable_geoip=True,
        enable_local_evaluation=False,
    )
    _active_posthog = HostedMcpPostHog(cast(PostHogClient, client), config)
    return _active_posthog


def get_posthog_observability() -> HostedMcpPostHog | None:
    return _active_posthog


class PostHogExceptionMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        try:
            await self.app(scope, receive, send)
        except Exception as exc:
            active = get_posthog_observability()
            if active is not None:
                active.capture_hosted_exception(exc, method=str(scope.get("method") or ""))
            raise


def posthog_exception_middleware() -> Middleware:
    return Middleware(PostHogExceptionMiddleware)


def redact_observability_properties(properties: Mapping[str, Any]) -> dict[str, Any]:
    return cast(dict[str, Any], scrub_sensitive_values(dict(properties)))


def scrub_sensitive_values(value: Any, *, key: str | None = None) -> Any:
    if key is not None and is_sensitive_key(key):
        return "[Filtered]"
    if isinstance(value, MutableMapping):
        return {
            str(child_key): scrub_sensitive_values(child_value, key=str(child_key))
            for child_key, child_value in value.items()
        }
    if isinstance(value, list):
        return [scrub_sensitive_values(item) for item in value]
    if isinstance(value, tuple):
        return tuple(scrub_sensitive_values(item) for item in value)
    if isinstance(value, str) and is_sensitive_text(value):
        return "[Filtered]"
    return value


def is_sensitive_key(key: str) -> bool:
    normalised = key.lower().replace("-", "_")
    return (
        normalised in SENSITIVE_KEYS
        or normalised.endswith("_token")
        or normalised.endswith("_secret")
        or normalised.endswith("_api_key")
        or "authorization" in normalised
        or "cookie" in normalised
    )


def is_sensitive_text(value: str) -> bool:
    return bool(EMAIL_RE.search(value) or SECRET_RE.search(value))


def hash_identifier(kind: str, value: str | None) -> str | None:
    if not value:
        return None
    digest = hashlib.sha256(f"sendmux-mcp:{kind}:{value}".encode("utf8")).hexdigest()
    return digest[:32]


def clean_env_value(value: str | None) -> str | None:
    trimmed = value.strip() if value else ""
    return trimmed or None
