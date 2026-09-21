from __future__ import annotations

import importlib
import warnings
from typing import Any, get_args, get_type_hints

import pytest

import sendmux_mailbox
import sendmux_mailbox.models
from sendmux_mailbox.models.mailbox_message_content_response import MailboxMessageContentResponse
from sendmux_mailbox.models.mailbox_raw_body_response import MailboxRawBodyResponse
from sendmux_mailbox.models.mailbox_realtime_message import MailboxRealtimeMessage
from sendmux_mailbox.models.mailbox_realtime_message_body import MailboxRealtimeMessageBody
from sendmux_mailbox.models.mailbox_submission_envelope import MailboxSubmissionEnvelope
from sendmux_mailbox.models.mailbox_thread_content_response import MailboxThreadContentResponse

DEPRECATION_MESSAGE = (
    "MailboxRealtimeMessageAllOfBody is deprecated; use MailboxRealtimeMessageBody. "
    "It will be removed in sendmux-mailbox 3.0."
)
REMOVED_IN = "sendmux-mailbox 3.0"

# Names the nullable-reference schema shape drops from the generated package. Each is a real
# generated class until that regeneration lands and a deprecated alias of the class that types the
# same field afterwards; either way the name keeps resolving from both modules.
COMPAT_MODEL_NAMES = {
    "MailboxMessageContentResponseAllOfData": ("MailboxMessageContent", MailboxMessageContentResponse, "data"),
    "MailboxRawBodyResponseAllOfData": ("MailboxRawBody", MailboxRawBodyResponse, "data"),
    "MailboxSubmissionEnvelopeRcptToInner": ("MailboxSubmissionEnvelopeAddress", MailboxSubmissionEnvelope, "rcpt_to"),
    "MailboxThreadContentResponseAllOfData": ("MailboxMessageContent", MailboxThreadContentResponse, "data"),
}


def innermost_class(annotation: Any) -> Any:
    while args := [arg for arg in get_args(annotation) if arg is not type(None)]:
        annotation = args[0]
    return annotation


@pytest.mark.parametrize("module_name", ["sendmux_mailbox", "sendmux_mailbox.models"])
def test_deprecated_alias_resolves_to_the_new_model_with_one_warning(module_name: str) -> None:
    module = importlib.import_module(module_name)

    with pytest.warns(DeprecationWarning) as captured:
        alias = module.MailboxRealtimeMessageAllOfBody

    assert alias is MailboxRealtimeMessageBody
    assert len(captured) == 1
    assert str(captured[0].message) == DEPRECATION_MESSAGE


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


@pytest.mark.parametrize("module_name", ["sendmux_mailbox", "sendmux_mailbox.models"])
@pytest.mark.parametrize("name", sorted(COMPAT_MODEL_NAMES))
def test_compat_model_name_keeps_resolving(module_name: str, name: str) -> None:
    module = importlib.import_module(module_name)
    replacement, _owner, _field = COMPAT_MODEL_NAMES[name]
    aliases = getattr(module, "_DEPRECATED_MODEL_ALIASES", {})
    exported = getattr(module, "__all__", None)  # the models module publishes no __all__

    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always")
        resolved = getattr(module, name)

    if name in aliases:
        assert aliases[name] == (replacement, REMOVED_IN)
        assert resolved is getattr(module, replacement)
        assert [str(warning.message) for warning in captured] == [
            f"{name} is deprecated; use {replacement}. It will be removed in {REMOVED_IN}."
        ]
        assert exported is None or name not in exported
    else:
        assert captured == []
        assert resolved.__name__ == name
        assert exported is None or name in exported


@pytest.mark.parametrize("name", sorted(COMPAT_MODEL_NAMES))
def test_compat_model_name_is_the_class_typing_its_field(name: str) -> None:
    _replacement, owner, field = COMPAT_MODEL_NAMES[name]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        resolved = getattr(sendmux_mailbox, name)

    assert innermost_class(get_type_hints(owner)[field]) is resolved
