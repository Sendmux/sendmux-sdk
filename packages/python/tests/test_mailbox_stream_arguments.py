from __future__ import annotations

from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest

from sendmux_mailbox import MailboxAPIApi, create_mailbox_client
from sendmux_core import SendmuxApiError


@pytest.fixture
def endpoint() -> Iterator[tuple[str, list[tuple[str, str | None]]]]:
    requests: list[tuple[str, str | None]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            requests.append((self.path, self.headers.get("Last-Event-ID")))
            self.send_response(401)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=lambda: server.serve_forever(poll_interval=0.01))
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/api/v1", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        assert not thread.is_alive()


@pytest.mark.parametrize("method", [
    "mailbox_stream_events",
    "mailbox_stream_events_with_http_info",
    "mailbox_stream_events_without_preload_content",
])
@pytest.mark.parametrize("mailbox_id", ["mailbox_123", None])
def test_published_positional_arguments_reach_request(method: str, mailbox_id: str | None, endpoint: Any) -> None:
    url, requests = endpoint
    with create_mailbox_client(api_key="smx_mbx_test", base_url=url) as client:
        stream = getattr(MailboxAPIApi(client), method)
        try:
            response = stream("message.received", "resume-query", 15, 60, "resume-header", mailbox_id)
            assert response.status == 401
            response.read()
            response.release_conn()
        except SendmuxApiError as error:
            assert error.status_code == 401

    assert len(requests) == 1
    path, last_event_id = requests[0]
    assert urlsplit(path).path == "/api/v1/mailbox/events"
    query = parse_qs(urlsplit(path).query)
    assert query["event_types"] == ["message.received"]
    assert query["last_event_id"] == ["resume-query"]
    assert query["ping"] == ["15"]
    assert query["close_after"] == ["60"]
    assert query.get("mailbox_id") == ([mailbox_id] if mailbox_id is not None else None)
    assert last_event_id == "resume-header"
