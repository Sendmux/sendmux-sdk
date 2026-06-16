from __future__ import annotations

from collections.abc import MutableMapping
from typing import Any, cast

from sentry_sdk.types import Event

from sendmux_mcp.observability import scrub_sentry_event, sentry_config_from_env


def test_sentry_config_from_env_is_disabled_without_dsn() -> None:
    assert sentry_config_from_env({}) is None


def test_sentry_config_from_env_uses_privacy_minimized_defaults() -> None:
    config = sentry_config_from_env(
        {
            "NEXT_PUBLIC_SENTRY_DSN": "https://public@example.invalid/1",
            "SENTRY_ENVIRONMENT": "production",
            "SENDMUX_MCP_RELEASE": "v1.0.4",
        }
    )

    assert config is not None
    assert config.dsn == "https://public@example.invalid/1"
    assert config.environment == "production"
    assert config.release == "v1.0.4"
    assert config.traces_sample_rate == 0.0


def test_sentry_scrubber_removes_request_body_and_sensitive_headers() -> None:
    event = cast(Event, {
        "request": {
            "headers": {
                "Authorization": "Bearer client-token",
                "Cookie": "session=value",
                "Mcp-Session-Id": "session-id",
                "User-Agent": "test-client",
            },
            "cookies": {"session": "value"},
            "data": {"jsonrpc": "2.0"},
            "env": {"authorization": "Bearer client-token"},
        },
        "extra": {
            "grant_id": "grant",
            "access_token": "token",
            "nested": {"team_public_id": "team", "safe": "kept"},
        },
    })

    scrubbed = scrub_sentry_event(event, {})
    assert scrubbed is not None

    request = cast(MutableMapping[str, Any], scrubbed["request"])
    headers = cast(MutableMapping[str, Any], request["headers"])
    extra = cast(MutableMapping[str, Any], scrubbed["extra"])
    nested = cast(MutableMapping[str, Any], extra["nested"])

    assert "data" not in request
    assert "cookies" not in request
    assert "env" not in request
    assert headers["Authorization"] == "[Filtered]"
    assert headers["Cookie"] == "[Filtered]"
    assert headers["Mcp-Session-Id"] == "[Filtered]"
    assert headers["User-Agent"] == "test-client"
    assert extra["grant_id"] == "[Filtered]"
    assert extra["access_token"] == "[Filtered]"
    assert nested["team_public_id"] == "[Filtered]"
    assert nested["safe"] == "kept"
