from __future__ import annotations

import json
import codecs

from collections.abc import Iterator
from typing import Any

from sendmux_mailbox.api.mailbox_api_api import MailboxAPIApi
from sendmux_mailbox.api_client import ApiClient
from sendmux_mailbox.models.mailbox_realtime_event import MailboxRealtimeEvent


def iter_mailbox_events(
    api_client: ApiClient,
    *,
    event_types: str | None = None,
    last_event_id: str | None = None,
    ping: int | None = None,
    close_after: int | None = None,
    last_event_id_header: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> Iterator[MailboxRealtimeEvent]:
    """Yield typed mailbox SSE events from the generated mailbox API client.

    Pass close_after for bounded streams, or close the iterator/response from the caller when following continuously.
    """

    api = MailboxAPIApi(api_client)
    response = api.mailbox_stream_events_without_preload_content(
        event_types=event_types,
        last_event_id=last_event_id,
        ping=ping,
        close_after=close_after,
        last_event_id2=last_event_id_header,
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )
    try:
        yield from _iter_sse_response(response)
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            close()
        release_conn = getattr(response, "release_conn", None)
        if callable(release_conn):
            release_conn()


def _iter_sse_response(response: Any) -> Iterator[MailboxRealtimeEvent]:
    buffer = ""
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    for chunk in response.stream(decode_content=True):
        if chunk is None:
            continue
        buffer += decoder.decode(chunk) if isinstance(chunk, bytes) else str(chunk)
        buffer = buffer.replace("\r\n", "\n").replace("\r", "\n")
        blocks = buffer.split("\n\n")
        buffer = blocks.pop() or ""
        for block in blocks:
            event = _event_from_block(block)
            if event is not None:
                yield event


def _event_from_block(block: str) -> MailboxRealtimeEvent | None:
    data_lines: list[str] = []
    for line in block.split("\n"):
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip(" "))

    if not data_lines:
        return None

    decoded = json.loads("\n".join(data_lines))
    if not isinstance(decoded, dict):
        raise ValueError("Mailbox SSE event data must be a JSON object.")

    event = MailboxRealtimeEvent.from_dict(decoded)
    if event is None:
        raise ValueError("Mailbox SSE event data was empty.")
    return event
