from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import pytest

from sendmux_mcp.observability import (
    DEFAULT_POSTHOG_HOST,
    HostedMcpPostHog,
    PostHogConfig,
    get_posthog_observability,
    hash_identifier,
    init_posthog_from_env,
    posthog_config_from_env,
    redact_observability_properties,
)


class FakePostHogClient:
    def __init__(self) -> None:
        self.captures: list[dict[str, Any]] = []
        self.flushed = False
        self.shutdown_called = False

    def capture(self, *, distinct_id: str, event: str, properties: Mapping[str, Any]) -> None:
        self.captures.append({"distinct_id": distinct_id, "event": event, "properties": properties})

    def flush(self, timeout_seconds: float | None = 10) -> None:
        self.flushed = True

    def shutdown(self) -> None:
        self.shutdown_called = True


def clear_posthog_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "POSTHOG_PROJECT_TOKEN",
        "POSTHOG_HOST",
        "POSTHOG_ENVIRONMENT",
        "ENVIRONMENT",
        "NODE_ENV",
        "SENDMUX_MCP_RELEASE",
    ):
        monkeypatch.delenv(key, raising=False)


def test_posthog_config_from_env_is_disabled_without_project_token(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_posthog_env(monkeypatch)

    assert posthog_config_from_env() is None


def test_posthog_config_from_env_uses_eu_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_posthog_env(monkeypatch)
    assert init_posthog_from_env() is None
    monkeypatch.setenv("POSTHOG_PROJECT_TOKEN", "phc_test")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SENDMUX_MCP_RELEASE", "v1.0.6")

    config = posthog_config_from_env()

    assert config is not None
    assert config.project_api_key == "phc_test"
    assert config.host == DEFAULT_POSTHOG_HOST
    assert config.environment == "production"
    assert config.release == "v1.0.6"


def test_init_posthog_from_env_uses_privacy_minimised_client(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_posthog_env(monkeypatch)
    created: list[dict[str, Any]] = []

    class FakePosthog(FakePostHogClient):
        def __init__(self, **kwargs: Any) -> None:
            super().__init__()
            created.append(kwargs)

    monkeypatch.setenv("POSTHOG_PROJECT_TOKEN", "phc_test")
    monkeypatch.setenv("POSTHOG_HOST", "https://eu.i.posthog.com")
    monkeypatch.setattr("sendmux_mcp.observability.Posthog", FakePosthog)

    active = init_posthog_from_env()

    assert active is get_posthog_observability()
    assert created == [
        {
            "project_api_key": "phc_test",
            "host": "https://eu.i.posthog.com",
            "disable_geoip": True,
            "enable_local_evaluation": False,
        }
    ]


def test_local_cli_command_does_not_initialise_posthog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sendmux_mcp import cli

    clear_posthog_env(monkeypatch)
    monkeypatch.setenv("POSTHOG_PROJECT_TOKEN", "phc_test")
    called: list[object] = []

    def fake_run(config: object) -> None:
        called.append(config)

    class FailingPosthog:
        def __init__(self, **_kwargs: Any) -> None:
            raise AssertionError("local MCP command must not initialise PostHog")

    monkeypatch.setattr("sendmux_mcp.observability.Posthog", FailingPosthog)
    monkeypatch.setattr(cli, "run", fake_run)

    assert cli.main_mailbox(["--api-key", "smx_mbx_test"]) == 0
    assert len(called) == 1


def test_redaction_removes_sensitive_fields_and_text() -> None:
    scrubbed = redact_observability_properties(
        {
            "email": "agent@example.com",
            "name": "Roshan Roy",
            "headers": {"Authorization": "Bearer client-token", "Cookie": "session=value"},
            "body": {"message": "hello", "request_body": {"text": "content"}},
            "provider_payload": {"api_key": "smx_root_secret"},
            "nested": {
                "safe": "kept",
                "description": "Contact agent@example.com with token abc",
            },
        }
    )

    assert scrubbed["email"] == "[Filtered]"
    assert scrubbed["name"] == "[Filtered]"
    assert scrubbed["headers"] == "[Filtered]"
    assert scrubbed["body"] == "[Filtered]"
    assert scrubbed["provider_payload"] == "[Filtered]"
    assert scrubbed["nested"]["safe"] == "kept"
    assert scrubbed["nested"]["description"] == "[Filtered]"


def test_tool_call_capture_uses_hashed_ids_and_safe_properties_only() -> None:
    client = FakePostHogClient()
    analytics = HostedMcpPostHog(
        client,
        PostHogConfig(
            project_api_key="phc_test",
            host=DEFAULT_POSTHOG_HOST,
            environment="production",
            release="v1.0.6",
        ),
    )

    analytics.capture_tool_call(
        method="get",
        tool_name="mailbox_list_messages",
        surface="mailbox",
        success=True,
        latency_ms=12.34567,
        status_code=200,
        grant_id="mcp_grant_public",
        mailbox_id="mbx_granted",
    )

    assert len(client.captures) == 1
    capture = client.captures[0]
    properties = capture["properties"]
    assert capture["event"] == "mcp_tool_call"
    assert capture["distinct_id"] == hash_identifier("grant", "mcp_grant_public")
    assert properties == {
        "service": "sendmux-mcp-hosted",
        "environment": "production",
        "method": "GET",
        "success": True,
        "latency_ms": 12.346,
        "release": "v1.0.6",
        "tool": "mailbox_list_messages",
        "surface": "mailbox",
        "status_code": 200,
        "grant_id_hash": hash_identifier("grant", "mcp_grant_public"),
        "mailbox_id_hash": hash_identifier("mailbox", "mbx_granted"),
    }
    assert "mcp_grant_public" not in repr(properties)
    assert "mbx_granted" not in repr(properties)
