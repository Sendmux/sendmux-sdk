from __future__ import annotations

import json

from typing import Any, cast

import sendmux_mailbox.events as events_module
from sendmux_mailbox.api_client import ApiClient
from sendmux_mailbox.events import iter_mailbox_events
from sendmux_mailbox.models.mailbox_realtime_event import MailboxRealtimeEvent


EVENT_PAYLOAD = (
    b'event: message.received\n'
    b'data: {"event_type":"message.received","mailbox_id":"mbx_py_stream","message_id":"msg_py_stream",'
    b'"message_id_kind":"provider","occurred_at":"2026-07-02T00:00:00.000Z",'
    b'"recipients":["agent@example.com"],"sender":"sender@example.com",'
    b'"team_public_id":"team_py_stream","message":null,"is_spam":false}\n\n'
)


class FakeResponse:
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.closed = False
        self.released = False

    def stream(self, *, decode_content: bool) -> list[bytes]:
        assert decode_content is True
        return self.chunks

    def close(self) -> None:
        self.closed = True

    def release_conn(self) -> None:
        self.released = True


class FakeMailboxApi:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.kwargs: dict[str, Any] = {}

    def mailbox_stream_events_without_preload_content(self, **kwargs: Any) -> FakeResponse:
        self.kwargs = kwargs
        return self.response


def test_iter_mailbox_events_yields_typed_events_and_closes_response(monkeypatch: Any) -> None:
    response = FakeResponse([EVENT_PAYLOAD])
    api = FakeMailboxApi(response)
    monkeypatch.setattr(events_module, "MailboxAPIApi", lambda _api_client: api)

    events = list(
        iter_mailbox_events(
            cast(ApiClient, object()),
            close_after=30,
            event_types="message.received",
            last_event_id="evt_query",
            last_event_id_header="evt_header",
            mailbox_id="mbx_py_stream",
            ping=15,
            request_timeout=35,
        ),
    )

    assert len(events) == 1
    assert isinstance(events[0], MailboxRealtimeEvent)
    assert events[0].event_type == "message.received"
    assert events[0].message_id == "msg_py_stream"
    assert api.kwargs == {
        "close_after": 30,
        "event_types": "message.received",
        "last_event_id": "evt_query",
        "last_event_id2": "evt_header",
        "mailbox_id": "mbx_py_stream",
        "ping": 15,
        "_request_timeout": 35,
    }
    assert response.closed is True
    assert response.released is True


def test_iter_mailbox_events_preserves_multibyte_characters_across_chunks(monkeypatch: Any) -> None:
    event_payload = {
        "event_type": "message.received",
        "is_spam": False,
        "mailbox_id": "mbx_py_stream",
        "message": {
            "bcc": [],
            "body": {"html": None, "is_truncated": False, "max_bytes": 65536, "text": "hello"},
            "cc": [],
            "flags": {"answered": False, "draft": False, "flagged": False, "seen": False},
            "folder_ids": ["inbox"],
            "from": {"email": "sender@example.com", "name": None},
            "has_attachments": False,
            "id": "msg_py_stream",
            "keywords": [],
            "preview": "hello",
            "received_at": "2026-07-02T00:00:00.000Z",
            "rfc5322_message_id": "<msg_py_stream@example.com>",
            "sent_at": None,
            "size_bytes": 512,
            "subject": "Café",
            "thread_id": "thr_py_stream",
            "to": [{"email": "agent@example.com", "name": None}],
        },
        "message_id": "msg_py_stream",
        "message_id_kind": "provider",
        "occurred_at": "2026-07-02T00:00:00.000Z",
        "recipients": ["agent@example.com"],
        "sender": "sender@example.com",
        "team_public_id": "team_py_stream",
    }
    payload = f"data: {json.dumps(event_payload, ensure_ascii=False)}\n\n".encode("utf-8")
    split_at = payload.index("é".encode("utf-8")) + 1
    response = FakeResponse([payload[:split_at], payload[split_at:]])
    api = FakeMailboxApi(response)
    monkeypatch.setattr(events_module, "MailboxAPIApi", lambda _api_client: api)

    mailbox_events = list(iter_mailbox_events(cast(ApiClient, object()), close_after=1))

    assert mailbox_events[0].message is not None
    assert mailbox_events[0].message.subject == "Café"


def test_realtime_event_message_allows_omitted_attachments() -> None:
    event = MailboxRealtimeEvent.from_dict(
        {
            "event_type": "message.received",
            "is_spam": False,
            "mailbox_id": "mbx_py_stream",
            "message": {
                "bcc": [],
                "body": {"html": None, "is_truncated": False, "max_bytes": 65536, "text": "hello"},
                "cc": [],
                "flags": {"answered": False, "draft": False, "flagged": False, "seen": False},
                "folder_ids": ["inbox"],
                "from": {"email": "sender@example.com", "name": None},
                "has_attachments": False,
                "id": "msg_py_stream",
                "keywords": [],
                "preview": "hello",
                "received_at": "2026-07-02T00:00:00.000Z",
                "rfc5322_message_id": "<msg_py_stream@example.com>",
                "sent_at": None,
                "size_bytes": 512,
                "subject": "Hello",
                "thread_id": "thr_py_stream",
                "to": [{"email": "agent@example.com", "name": None}],
            },
            "message_id": "msg_py_stream",
            "message_id_kind": "provider",
            "occurred_at": "2026-07-02T00:00:00.000Z",
            "recipients": ["agent@example.com"],
            "sender": "sender@example.com",
            "team_public_id": "team_py_stream",
        }
    )

    assert event is not None
    assert event.message is not None
    assert event.message.attachments is None
