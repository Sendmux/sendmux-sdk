"""Tests for the langchain-sendmux toolkit."""

from __future__ import annotations

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
