"""Tests for the langchain-sendmux toolkit."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlsplit

import pytest
import urllib3
from langchain_core.tools import BaseTool
from sendmux_sending import EmailSendRequest

from langchain_sendmux import SendmuxToolkit


def _tools() -> list[BaseTool]:
    toolkit = SendmuxToolkit(
        api_key="smx_mbx_test",
        default_from="agent@yourdomain.dev",
    )
    return toolkit.get_tools()


def test_toolkit_exposes_expected_tools() -> None:
    names = sorted(tool.name for tool in _tools())
    assert names == ["list_messages", "reply", "send_email"]


def test_tools_have_description_and_args() -> None:
    for tool in _tools():
        assert tool.description
        assert tool.args


def test_send_email_exposes_expected_args() -> None:
    send = next(tool for tool in _tools() if tool.name == "send_email")
    fields = set(send.args)
    assert {"to", "subject", "text"} <= fields
    # Regression: idempotency passthrough must be exposed to the agent.
    assert "idempotency_key" in fields


def test_email_send_request_builds_via_from_alias() -> None:
    # Regression: EmailSendRequest.var_from carries alias "from"; keyword
    # construction (var_from=...) is rejected, so the toolkit builds via
    # model_validate with the alias key. Guard that path here.
    request = EmailSendRequest.model_validate(
        {
            "from": {"email": "agent@yourdomain.dev"},
            "to": {"email": "sarah@example.com"},
            "subject": "Re: invoice 4187",
            "text_body": "Confirmed for Tuesday.",
            "html_body": "<p>Confirmed for Tuesday.</p>",
        }
    )
    assert request.var_from.email == "agent@yourdomain.dev"
    assert request.to.email == "sarah@example.com"


def test_all_tools_resolve_current_oauth_token(monkeypatch: Any) -> None:
    requests: list[tuple[str, str]] = []

    def request(
        _pool: Any, method: str, url: str, **kwargs: Any,
    ) -> urllib3.HTTPResponse:
        requests.append((urlsplit(url).path, kwargs["headers"]["Authorization"]))
        payload: dict[str, Any] = {
            "ok": True,
            "meta": {"request_id": "req_aaaaaaaaaaaaaaaaaaaaaaaa"},
            "data": {"message_id": "eml_aaaaaaaaaaaaaaaaaaaaaaaa", "status": "queued"},
        }
        if method == "GET":
            payload.update(data=[], pagination={"has_more": False})
        return urllib3.HTTPResponse(
            status=200, body=json.dumps(payload).encode(), headers={"Content-Type": "application/json"},
        )

    monkeypatch.setattr(urllib3.PoolManager, "request", request)
    token = "oauth-first"
    toolkit = SendmuxToolkit(access_token=lambda: token, default_from="agent@example.com")
    tools = {tool.name: tool for tool in toolkit.get_tools()}
    assert tools["list_messages"].invoke({"limit": 1}) == []
    token = "oauth-second"
    assert tools["send_email"].invoke({
        "to": "reader@example.com", "subject": "Test", "text": "Test",
    }).status == "queued"
    token = "oauth-third"
    assert tools["reply"].invoke({
        "to": "reader@example.com", "subject": "Test", "text": "Test",
    }).status == "queued"
    assert requests == [
        ("/api/v1/mailbox/messages", "Bearer oauth-first"),
        ("/api/v1/emails/send", "Bearer oauth-second"),
        ("/api/v1/mailbox/messages/send", "Bearer oauth-third"),
    ]


def test_tools_accept_static_oauth_token(monkeypatch: Any) -> None:
    headers: list[str] = []

    def request(
        _pool: Any, _method: str, _url: str, **kwargs: Any,
    ) -> urllib3.HTTPResponse:
        headers.append(kwargs["headers"]["Authorization"])
        return urllib3.HTTPResponse(status=200, headers={"Content-Type": "application/json"}, body=json.dumps({
            "ok": True, "data": [], "meta": {"request_id": "req_aaaaaaaaaaaaaaaaaaaaaaaa"},
            "pagination": {"has_more": False},
        }).encode())

    monkeypatch.setattr(urllib3.PoolManager, "request", request)
    toolkit = SendmuxToolkit(access_token="oauth-static")
    tool = next(tool for tool in toolkit.get_tools() if tool.name == "list_messages")
    assert tool.invoke({"limit": 1}) == []
    assert headers == ["Bearer oauth-static"]


def test_tools_reject_ambiguous_oauth_configuration() -> None:
    with pytest.raises(ValueError, match="exactly one of api_key or access_token"):
        SendmuxToolkit(api_key="smx_mbx_test", access_token="oauth-static").get_tools()


@pytest.mark.parametrize("field", ["api_key", "access_token"])
def test_toolkit_representation_excludes_credentials(field: str) -> None:
    secret = "smx_mbx_private_fixture" if field == "api_key" else "oauth-private-fixture"
    toolkit = SendmuxToolkit(**{field: secret})
    assert secret not in repr(toolkit)
    assert field not in toolkit.model_dump()
    assert secret not in toolkit.model_dump_json()
