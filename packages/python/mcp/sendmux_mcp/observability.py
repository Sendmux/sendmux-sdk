from __future__ import annotations

import os
from collections.abc import MutableMapping
from dataclasses import dataclass
from typing import Any, cast

import sentry_sdk
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.types import Event, Hint


SENSITIVE_KEYS = {
    "access_token",
    "api_key",
    "authorization",
    "claims",
    "cookie",
    "cookies",
    "grant_id",
    "id_token",
    "jwt",
    "mailbox_ids",
    "mcp_session_id",
    "password",
    "permissions",
    "proxy_authorization",
    "refresh_token",
    "scope",
    "secret",
    "set_cookie",
    "sub",
    "team_public_id",
    "token",
}


@dataclass(frozen=True)
class SentryConfig:
    dsn: str
    environment: str
    release: str | None
    traces_sample_rate: float


def sentry_config_from_env() -> SentryConfig | None:
    dsn = clean_env_value(os.environ.get("SENTRY_DSN")) or clean_env_value(
        os.environ.get("NEXT_PUBLIC_SENTRY_DSN")
    )
    if not dsn:
        return None

    return SentryConfig(
        dsn=dsn,
        environment=clean_env_value(os.environ.get("SENTRY_ENVIRONMENT"))
        or clean_env_value(os.environ.get("ENVIRONMENT"))
        or clean_env_value(os.environ.get("NODE_ENV"))
        or "unknown",
        release=clean_env_value(os.environ.get("SENDMUX_MCP_RELEASE"))
        or clean_env_value(os.environ.get("SENTRY_RELEASE")),
        traces_sample_rate=parse_sample_rate(os.environ.get("SENTRY_TRACES_SAMPLE_RATE")),
    )


def init_sentry_from_env() -> bool:
    config = sentry_config_from_env()
    if config is None:
        return False

    sentry_sdk.init(
        dsn=config.dsn,
        environment=config.environment,
        release=config.release,
        traces_sample_rate=config.traces_sample_rate,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        integrations=[StarletteIntegration()],
        before_send=scrub_sentry_event,
    )
    sentry_sdk.set_tag("service", "sendmux-mcp")
    return True


def scrub_sentry_event(event: Event, _hint: Hint) -> Event | None:
    request = event.get("request")
    if isinstance(request, MutableMapping):
        request.pop("data", None)
        request.pop("cookies", None)
        request.pop("env", None)

    scrub_sensitive_values(cast(MutableMapping[str, Any], event))
    return event


def scrub_sensitive_values(value: Any) -> None:
    if isinstance(value, MutableMapping):
        for key in list(value.keys()):
            if is_sensitive_key(str(key)):
                value[key] = "[Filtered]"
                continue
            scrub_sensitive_values(value[key])
    elif isinstance(value, list):
        for item in value:
            scrub_sensitive_values(item)


def is_sensitive_key(key: str) -> bool:
    normalised = key.lower().replace("-", "_")
    return (
        normalised in SENSITIVE_KEYS
        or normalised.endswith("_token")
        or normalised.endswith("_secret")
        or normalised.endswith("_api_key")
        or "authorization" in normalised
    )


def parse_sample_rate(value: str | None) -> float:
    if value is None or not value.strip():
        return 0.0
    try:
        parsed = float(value)
    except ValueError:
        return 0.0
    return min(1.0, max(0.0, parsed))


def clean_env_value(value: str | None) -> str | None:
    trimmed = value.strip() if value else ""
    return trimmed or None
