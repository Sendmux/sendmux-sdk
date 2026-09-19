from __future__ import annotations

import importlib
import warnings

import pytest

import sendmux_mailbox
import sendmux_mailbox.models
from sendmux_mailbox.models.mailbox_realtime_message import MailboxRealtimeMessage
from sendmux_mailbox.models.mailbox_realtime_message_body import MailboxRealtimeMessageBody

DEPRECATION_MESSAGE = (
    "MailboxRealtimeMessageAllOfBody is deprecated; use MailboxRealtimeMessageBody. "
    "It will be removed in sendmux-mailbox 3.0."
)


@pytest.mark.parametrize("module_name", ["sendmux_mailbox", "sendmux_mailbox.models"])
def test_deprecated_alias_resolves_to_the_new_model_with_one_warning(module_name: str) -> None:
    module = importlib.import_module(module_name)

    with pytest.warns(DeprecationWarning) as captured:
        alias = module.MailboxRealtimeMessageAllOfBody

    assert alias is MailboxRealtimeMessageBody
    assert len(captured) == 1
    assert str(captured[0].message) == DEPRECATION_MESSAGE


def test_deprecated_alias_is_importable_by_name() -> None:
    with pytest.warns(DeprecationWarning, match="MailboxRealtimeMessageAllOfBody is deprecated"):
        from sendmux_mailbox import MailboxRealtimeMessageAllOfBody

    assert MailboxRealtimeMessageAllOfBody is sendmux_mailbox.MailboxRealtimeMessageBody


@pytest.mark.parametrize("module_name", ["sendmux_mailbox", "sendmux_mailbox.models"])
def test_unknown_attributes_still_raise_attribute_error(module_name: str) -> None:
    module = importlib.import_module(module_name)

    with pytest.raises(AttributeError, match="has no attribute 'MailboxRealtimeMessageNoSuchModel'"):
        getattr(module, "MailboxRealtimeMessageNoSuchModel")


def test_deprecated_alias_is_not_exported_by_star_import() -> None:
    assert "MailboxRealtimeMessageAllOfBody" not in sendmux_mailbox.__all__
    assert "MailboxRealtimeMessageBody" in sendmux_mailbox.__all__


def test_realtime_message_body_is_the_new_model() -> None:
    with warnings.catch_warnings():
        warnings.simplefilter("error", DeprecationWarning)
        message = MailboxRealtimeMessage.from_dict(
            {
                "bcc": [],
                "body": {"html": None, "is_truncated": False, "max_bytes": 65536, "text": "hello"},
                "cc": [],
                "flags": {"answered": False, "draft": False, "flagged": False, "seen": False},
                "folder_ids": ["inbox"],
                "from": {"email": "sender@example.com", "name": None},
                "has_attachments": False,
                "id": "msg_py_alias",
                "keywords": [],
                "preview": "hello",
                "received_at": "2026-09-19T00:00:00.000Z",
                "rfc5322_message_id": "<msg_py_alias@example.com>",
                "sent_at": None,
                "size_bytes": 512,
                "subject": "Alias",
                "thread_id": "thr_py_alias",
                "to": [{"email": "agent@example.com", "name": None}],
            }
        )

    assert message is not None
    assert type(message.body) is MailboxRealtimeMessageBody
    assert MailboxRealtimeMessage.model_fields["body"].annotation is MailboxRealtimeMessageBody
    assert message.body.text == "hello"
