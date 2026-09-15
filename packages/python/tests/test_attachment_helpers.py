from __future__ import annotations

import json
from base64 import b64decode
from hashlib import sha256
from email.message import EmailMessage
from pathlib import Path
from typing import Any, cast
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import pytest
import urllib3

import sendmux_mailbox.attachments as mailbox_attachments
import sendmux_sending.attachments as sending_attachments
from sendmux_mailbox import download_mailbox_attachment, read_mailbox_text_attachment
from sendmux_core import SendmuxApiError
from sendmux_mailbox.api_client import ApiClient as MailboxApiClient
from sendmux_mailbox.models.mailbox_attachment_upload_intent_result_response import (
    MailboxAttachmentUploadIntentResultResponse,
)
from sendmux_mailbox.models.mailbox_attachment_upload_result_response import MailboxAttachmentUploadResultResponse
from sendmux_mailbox.models.mailbox_send_result_response import MailboxSendResultResponse
from sendmux_sending.api_client import ApiClient as SendingApiClient
from sendmux_sending import create_sending_client
from sendmux_sending.models.send_success_response import SendSuccessResponse

SENDING_ATTACHMENT_LIMIT = json.loads(
    (Path(__file__).resolve().parents[1] / "mcp/sendmux_mcp/openapi/openapi-sending.json").read_text()
)["components"]["schemas"]["EmailSendRequest"]["properties"]["attachments"]["maxItems"]
# Sending's absolute ceiling: smtp-proxy/app/http-api/v1/lib/attachment-validation.js.
SENDING_ATTACHMENT_BYTE_LIMIT = 18 * 1024 * 1024


class FakeSendingAttachmentUploadData:
    attachment_id = "att_1234567890abcdefghijklmn"
    content_type = "text/plain"
    expires_at = "2026-07-07T10:00:00.000Z"
    filename = "report.txt"
    size_bytes = len(b"python helper attachment\n")

    def to_dict(self) -> dict[str, Any]:
        return {
            "attachment_id": self.attachment_id,
            "content_type": self.content_type,
            "expires_at": self.expires_at,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
        }


class FakeSendingAttachmentUploadResponse:
    data = FakeSendingAttachmentUploadData()


class FakeMailboxApi:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def mailbox_upload_attachment(self, **kwargs: Any) -> MailboxAttachmentUploadResultResponse:
        self.requests.append({"operation": "upload", **kwargs})
        body = kwargs["body"]
        result = MailboxAttachmentUploadResultResponse.from_dict(
            {
                "ok": True,
                "data": {
                    "blob_id": "blob_py_report",
                    "content_type": kwargs["_headers"]["Content-Type"],
                    "filename": kwargs["filename"],
                    "size_bytes": len(body),
                },
                "meta": {"request_id": "req_py_upload"},
            }
        )
        assert result is not None
        return result

    def mailbox_create_attachment_upload(self, **kwargs: Any) -> MailboxAttachmentUploadIntentResultResponse:
        self.requests.append({"operation": "intent", **kwargs})
        body = kwargs["mailbox_attachment_upload_intent_body"].to_dict()
        result = MailboxAttachmentUploadIntentResultResponse.from_dict(
            {
                "ok": True,
                "data": {
                    "expires_at": "2026-07-02T00:10:00.000Z",
                    "headers": {
                        "Content-Length": str(body["size_bytes"]),
                        "Content-Type": body["content_type"],
                    },
                    "max_size_bytes": 7500000,
                    "method": "PUT",
                    "upload_id": "upl_py_helper",
                    "upload_url": "https://upload-python.test/mailbox/attachment-uploads/upl_py_helper?upload_token=tok",
                },
                "meta": {"request_id": "req_py_intent"},
            }
        )
        assert result is not None
        return result

    def mailbox_send_message(self, **kwargs: Any) -> MailboxSendResultResponse:
        self.requests.append({"operation": "send", **kwargs})
        result = MailboxSendResultResponse.from_dict(
            {
                "ok": True,
                "data": {"message_id": "msg_py_file", "status": "queued"},
                "meta": {"request_id": "req_py_send"},
            }
        )
        assert result is not None
        return result

    def mailbox_get_message_attachment(self, **kwargs: Any) -> bytes:
        self.requests.append({"operation": "download", **kwargs})
        return b"python helper recipe\n"


class FakeUrlopenResponse:
    def __init__(self, payload: dict[str, Any] | bytes) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeUrlopenResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        if isinstance(self.payload, bytes):
            return self.payload
        return json.dumps(self.payload).encode("utf-8")


class FakeSendingApi:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def sending_upload_attachment(self, **kwargs: Any) -> FakeSendingAttachmentUploadResponse:
        self.requests.append({"operation": "upload", **kwargs})
        return FakeSendingAttachmentUploadResponse()

    def sending_send_email(self, **kwargs: Any) -> SendSuccessResponse:
        self.requests.append({"operation": "send", **kwargs})
        result = SendSuccessResponse.from_dict(
            {
                "ok": True,
                "data": {"message_id": "eml_123456789012345678901234", "status": "queued"},
                "meta": {"request_id": "req_py_sending"},
            }
        )
        assert result is not None
        return result


def test_mailbox_upload_attachment_from_file(monkeypatch: Any, tmp_path: Path) -> None:
    report = tmp_path / "report.txt"
    report.write_bytes(b"python helper attachment\n")
    api = FakeMailboxApi()
    monkeypatch.setattr(mailbox_attachments, "MailboxAPIApi", lambda _api_client: api)

    result = mailbox_attachments.upload_mailbox_attachment_from_file(
        cast(MailboxApiClient, object()),
        file_path=report,
        mailbox_id="mbx_py_file",
    )

    assert result.data.blob_id == "blob_py_report"
    assert api.requests[0]["filename"] == "report.txt"
    assert api.requests[0]["body"] == b"python helper attachment\n"
    assert api.requests[0]["mailbox_id"] == "mbx_py_file"
    assert api.requests[0]["_headers"] == {"Content-Type": "text/plain"}


def test_mailbox_send_message_with_files(monkeypatch: Any, tmp_path: Path) -> None:
    report = tmp_path / "report.txt"
    report.write_text("python helper attachment\n", encoding="utf-8")
    api = FakeMailboxApi()
    monkeypatch.setattr(mailbox_attachments, "MailboxAPIApi", lambda _api_client: api)

    result = mailbox_attachments.send_mailbox_message_with_files(
        cast(MailboxApiClient, object()),
        body={
            "subject": "Python file",
            "text_body": "Attached",
            "to": [{"email": "agent@example.com", "name": None}],
        },
        files=[report],
        mailbox_id="mbx_py_file",
    )

    assert result.data.message_id == "msg_py_file"
    assert [request["operation"] for request in api.requests] == ["upload", "send"]
    assert api.requests[1]["send_mailbox_message_body"].to_dict()["attachments"] == [
        {
            "blob_id": "blob_py_report",
            "content_type": "text/plain",
            "filename": "report.txt",
        }
    ]


def test_mailbox_upload_attachment_via_presigned_file(monkeypatch: Any, tmp_path: Path) -> None:
    report = tmp_path / "report.txt"
    report.write_bytes(b"python helper attachment\n")
    api = FakeMailboxApi()
    seen_puts: list[dict[str, Any]] = []
    monkeypatch.setattr(mailbox_attachments, "MailboxAPIApi", lambda _api_client: api)

    def fake_urlopen(request: Any, *, timeout: float | None = None) -> FakeUrlopenResponse:
        seen_puts.append(
            {
                "data": request.data,
                "headers": dict(request.headers),
                "method": request.method,
                "timeout": timeout,
                "url": request.full_url,
            }
        )
        return FakeUrlopenResponse(
            {
                "ok": True,
                "data": {
                    "blob_id": "blob_py_presigned",
                    "content_type": "text/plain",
                    "filename": "report.txt",
                    "size_bytes": len(request.data),
                },
                "meta": {"request_id": "req_py_put"},
            }
        )

    monkeypatch.setattr(mailbox_attachments, "urlopen", fake_urlopen)

    result = mailbox_attachments.upload_mailbox_attachment_via_presigned_file(
        cast(MailboxApiClient, object()),
        file_path=report,
        mailbox_id="mbx_py_file",
        request_timeout=15,
    )

    assert result.data.blob_id == "blob_py_presigned"
    assert api.requests[0]["operation"] == "intent"
    assert api.requests[0]["mailbox_attachment_upload_intent_body"].to_dict() == {
        "content_type": "text/plain",
        "filename": "report.txt",
        "size_bytes": len(b"python helper attachment\n"),
    }
    assert seen_puts == [
        {
            "data": b"python helper attachment\n",
            "headers": {"Content-length": str(len(b"python helper attachment\n")), "Content-type": "text/plain"},
            "method": "PUT",
            "timeout": 15,
            "url": "https://upload-python.test/mailbox/attachment-uploads/upl_py_helper?upload_token=tok",
        }
    ]


def test_mailbox_upload_attachment_via_presigned_file_rejects_empty_metadata(
    monkeypatch: Any, tmp_path: Path
) -> None:
    report = tmp_path / "report.txt"
    report.write_bytes(b"python helper attachment\n")
    api = FakeMailboxApi()
    monkeypatch.setattr(mailbox_attachments, "MailboxAPIApi", lambda _api_client: api)
    monkeypatch.setattr(mailbox_attachments, "urlopen", lambda *_args, **_kwargs: FakeUrlopenResponse(b""))

    with pytest.raises(ValueError, match="did not return attachment metadata"):
        mailbox_attachments.upload_mailbox_attachment_via_presigned_file(
            cast(MailboxApiClient, object()),
            file_path=report,
        )


def test_mailbox_upload_attachment_via_presigned_file_reports_http_status(
    monkeypatch: Any, tmp_path: Path
) -> None:
    report = tmp_path / "report.txt"
    report.write_bytes(b"python helper attachment\n")
    api = FakeMailboxApi()
    monkeypatch.setattr(mailbox_attachments, "MailboxAPIApi", lambda _api_client: api)

    def fake_urlopen(*_args: Any, **_kwargs: Any) -> FakeUrlopenResponse:
        raise HTTPError("https://upload-python.test", 503, "Service Unavailable", hdrs=EmailMessage(), fp=None)

    monkeypatch.setattr(mailbox_attachments, "urlopen", fake_urlopen)

    with pytest.raises(RuntimeError, match="HTTP 503"):
        mailbox_attachments.upload_mailbox_attachment_via_presigned_file(
            cast(MailboxApiClient, object()),
            file_path=report,
        )


def test_mailbox_download_and_read_text_attachment(monkeypatch: Any) -> None:
    api = FakeMailboxApi()
    monkeypatch.setattr(mailbox_attachments, "MailboxAPIApi", lambda _api_client: api)

    assert download_mailbox_attachment is mailbox_attachments.download_mailbox_attachment
    assert read_mailbox_text_attachment is mailbox_attachments.read_mailbox_text_attachment

    downloaded = download_mailbox_attachment(
        cast(MailboxApiClient, object()),
        message_id="msg_py_attachment",
        attachment_id="att_py_markdown",
        mailbox_id="mbx_py_file",
        request_timeout=15,
    )
    text = read_mailbox_text_attachment(
        cast(MailboxApiClient, object()),
        message_id="msg_py_attachment",
        attachment_id="att_py_markdown",
    )

    assert downloaded == b"python helper recipe\n"
    assert text == "python helper recipe\n"
    assert api.requests == [
        {
            "operation": "download",
            "message_id": "msg_py_attachment",
            "attachment_id": "att_py_markdown",
            "mailbox_id": "mbx_py_file",
            "_request_timeout": 15,
        },
        {
            "operation": "download",
            "message_id": "msg_py_attachment",
            "attachment_id": "att_py_markdown",
            "mailbox_id": None,
            "_request_timeout": None,
        },
    ]


def test_sending_attachment_from_file_and_send_email(monkeypatch: Any, tmp_path: Path) -> None:
    report = tmp_path / "report.txt"
    report.write_bytes(b"python helper attachment\n")
    api = FakeSendingApi()
    monkeypatch.setattr(sending_attachments, "EmailsApi", lambda _api_client: api)
    monkeypatch.setattr(sending_attachments, "AttachmentsApi", lambda _api_client: api)

    attachment = sending_attachments.attachment_from_file(report)
    assert attachment == {
        "content": "cHl0aG9uIGhlbHBlciBhdHRhY2htZW50Cg==",
        "encoding": "base64",
        "filename": "report.txt",
        "type": "text/plain",
    }

    upload = sending_attachments.upload_attachment_from_file(
        cast(SendingApiClient, object()),
        file_path=report,
    )
    assert upload.data.attachment_id == "att_1234567890abcdefghijklmn"
    assert api.requests[0]["operation"] == "upload"
    assert api.requests[0]["filename"] == "report.txt"
    assert api.requests[0]["body"] == b"python helper attachment\n"
    assert api.requests[0]["content_length"] == len(b"python helper attachment\n")
    assert api.requests[0]["_headers"] == {"Content-Type": "text/plain"}

    result = sending_attachments.send_email_with_files(
        cast(SendingApiClient, object()),
        body={
            "from": {"email": "from@example.com"},
            "html_body": "<p>Attached</p>",
            "subject": "Python file",
            "to": {"email": "agent@example.com"},
        },
        files=[report],
    )

    assert result.data.message_id == "eml_123456789012345678901234"
    assert [request["operation"] for request in api.requests] == ["upload", "upload", "send"]
    assert api.requests[2]["email_send_request"].to_dict()["attachments"] == [
        {"attachment_id": "att_1234567890abcdefghijklmn"}
    ]


@pytest.fixture
def sending_replay(monkeypatch: Any) -> tuple[SendingApiClient, list[dict[str, Any]]]:
    requests: list[dict[str, Any]] = []
    cache: dict[tuple[str, str], tuple[str, dict[str, Any]]] = {}

    def request(_pool: Any, method: str, url: str, **kwargs: Any) -> urllib3.HTTPResponse:
        parsed = urlsplit(url)
        assert method == "POST"
        assert parsed.path in ("/emails/attachments", "/emails/send")
        upload = parsed.path == "/emails/attachments"
        headers = {key.lower(): value for key, value in kwargs["headers"].items()}
        key = headers.get("idempotency-key")
        body: dict[str, Any]
        if upload:
            query = parse_qs(parsed.query)
            body = {
                "filename": query["filename"][0],
                "content_type": query.get("content_type", [headers["content-type"]])[0],
                "size_bytes": len(kwargs["body"]),
                "sha256": sha256(kwargs["body"]).hexdigest(),
            }
        else:
            body = json.loads(kwargs["body"])
        fingerprint = json.dumps(body, sort_keys=True)
        previous = cache.get((parsed.path, key)) if key and len(key) <= 255 else None
        conflict = previous is not None and previous[0] != fingerprint
        invalid_size = upload and body["size_bytes"] > SENDING_ATTACHMENT_BYTE_LIMIT
        empty = upload and body["size_bytes"] == 0
        payload: dict[str, Any]
        if invalid_size:
            payload = {
                "ok": False,
                "error": {"code": "payload_too_large", "message": "Attachment exceeds the maximum allowed size.", "retryable": False},
                "meta": {"request_id": "req_py_size"},
            }
        elif empty:
            payload = {
                "ok": False,
                "error": {"code": "invalid_parameter", "message": "Content-Length must be a positive integer.", "param": "Content-Length", "retryable": False},
                "meta": {"request_id": "req_py_empty"},
            }
        elif conflict:
            payload = {
                "ok": False,
                "error": {"code": "idempotency_conflict", "message": "Different body for the same key", "retryable": False},
                "meta": {"request_id": "req_py_conflict"},
            }
        elif previous:
            payload = previous[1]
        else:
            data = {
                "attachment_id": f"att_{len(requests) + 1:024d}",
                "filename": body["filename"], "content_type": body["content_type"],
                "size_bytes": body["size_bytes"], "expires_at": "2026-07-07T10:00:00.000Z",
            } if upload else {"message_id": f"eml_{len(requests) + 1:024d}", "status": "queued"}
            payload = {"ok": True, "data": data, "meta": {"request_id": "req_py_replay"}}
        if key and len(key) <= 255 and previous is None and not invalid_size and not empty:
            cache[(parsed.path, key)] = (fingerprint, payload)
        requests.append({"upload": upload, "key": key, "body": body, "payload": payload})
        return urllib3.HTTPResponse(
            status=413 if invalid_size else 400 if empty else 409 if conflict else 201 if upload else 200,
            body=json.dumps(payload).encode(), headers={"Content-Type": "application/json"},
        )

    monkeypatch.setattr(urllib3.PoolManager, "request", request)
    return create_sending_client(api_key="smx_mbx_test_attachment_replay", base_url="https://sending-replay.test"), requests


def test_sending_oversized_file_fails_before_upload(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "oversized.txt"
    report.write_bytes(b"x" * (SENDING_ATTACHMENT_BYTE_LIMIT + 1))
    with pytest.raises((ValueError, SendmuxApiError)):
        sending_attachments.upload_attachment_from_file(client, file_path=report)
    assert requests == [], "Oversized files must not be uploaded"


def test_sending_file_growth_cannot_be_uploaded(sending_replay: Any, tmp_path: Path, monkeypatch: Any) -> None:
    client, requests = sending_replay
    report = tmp_path / "growing.txt"
    report.write_bytes(b"Before metadata check\n")
    original_open = Path.open

    def grow_before_open(path: Path, *args: Any, **kwargs: Any) -> Any:
        if path == report and (args[0] if args else kwargs.get("mode", "r")) == "rb":
            with original_open(path, "wb") as output:
                output.write(b"x" * (SENDING_ATTACHMENT_BYTE_LIMIT + 1))
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", grow_before_open)
    with pytest.raises((ValueError, SendmuxApiError)):
        sending_attachments.upload_attachment_from_file(client, file_path=report)
    assert requests == [], "An invalidated file must not be uploaded, including a truncated prefix"


def test_sending_inline_empty_file_is_rejected(tmp_path: Path) -> None:
    report = tmp_path / "empty.txt"
    report.write_bytes(b"")
    with pytest.raises(ValueError, match="Attachment file is empty"):
        sending_attachments.attachment_from_file(report)


def test_sending_inline_file_at_byte_ceiling_preserves_content(tmp_path: Path) -> None:
    report = tmp_path / "at-limit.txt"
    content = b"x" * SENDING_ATTACHMENT_BYTE_LIMIT
    report.write_bytes(content)
    result = sending_attachments.attachment_from_file(report)
    decoded = b64decode(result["content"], validate=True)
    assert len(decoded) == SENDING_ATTACHMENT_BYTE_LIMIT
    assert sha256(decoded).digest() == sha256(content).digest()


def test_sending_excess_files_fail_before_upload(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Attachment limit\n")
    body = {"from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Limit", "html_body": "<p>Attached</p>"}
    with pytest.raises(ValueError):
        sending_attachments.send_email_with_files(client, body=body, files=[report] * (SENDING_ATTACHMENT_LIMIT + 1))
    assert requests == [], "Excess attachments must not upload files or send email"


def test_sending_existing_attachments_count_before_upload(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Attachment limit\n")
    body = {
        "from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Limit", "html_body": "<p>Attached</p>",
        "attachments": [{"attachment_id": "att_1234567890abcdefghijklmn"}] * SENDING_ATTACHMENT_LIMIT,
    }
    with pytest.raises(ValueError):
        sending_attachments.send_email_with_files(client, body=body, files=[report])
    assert requests == [], "Existing references must count before uploading more files"


def test_sending_attachment_limit_preserves_existing_references(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Attachment limit\n")
    existing = {"attachment_id": "att_1234567890abcdefghijklmn"}
    body = {
        "from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Limit", "html_body": "<p>Attached</p>",
        "attachments": [existing],
    }
    result = sending_attachments.send_email_with_files(client, body=body, files=[report] * (SENDING_ATTACHMENT_LIMIT - 1))
    assert result.data.status == "queued"
    assert requests[-1]["body"]["attachments"] == [existing] + [
        {"attachment_id": request["payload"]["data"]["attachment_id"]} for request in requests if request["upload"]
    ]
    assert len(requests[-1]["body"]["attachments"]) == SENDING_ATTACHMENT_LIMIT


def test_sending_file_retry_returns_original_result(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Attachment replay\n")
    options: dict[str, Any] = {
        "body": {"from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Replay", "html_body": "<p>Attached</p>"},
        "files": [report], "idempotency_key": "attachment-replay",
    }
    first = sending_attachments.send_email_with_files(client, **options)
    first_body = requests[-1]["body"]
    second = sending_attachments.send_email_with_files(client, **options)
    assert second.to_dict() == first.to_dict()
    assert requests[-1]["body"] == first_body


def test_sending_distinct_outer_keys_namespace_upload_key(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Attachment namespace\n")
    body = {
        "from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"},
        "subject": "Namespace", "html_body": "<p>Attached</p>",
    }
    first = sending_attachments.send_email_with_files(
        client, body=body, files=[report], idempotency_key="attachment-namespace-a"
    )
    second = sending_attachments.send_email_with_files(
        client, body=body, files=[report], idempotency_key="attachment-namespace-b"
    )
    uploaded = [request for request in requests if request["upload"]]
    assert first.data.status == "queued"
    assert second.data.status == "queued"
    assert len(uploaded) == 2
    assert uploaded[0]["key"] != uploaded[1]["key"]


@pytest.mark.parametrize("explicit", [False, True], ids=["derived-keys", "explicit-per-file-key"])
def test_sending_two_file_retry_preserves_upload_keys(sending_replay: Any, tmp_path: Path, explicit: bool) -> None:
    client, requests = sending_replay
    first_path, second_path = tmp_path / "first.txt", tmp_path / "second.txt"
    first_path.write_bytes(b"First attachment\n")
    second_path.write_bytes(b"Different attachment\n")
    options: dict[str, Any] = {
        "body": {"from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Replay", "html_body": "<p>Attached</p>"},
        "files": [{"path": first_path, "idempotency_key": "explicit-upload"} if explicit else first_path, str(second_path)],
        "idempotency_key": "m" * 255,
    }
    first = sending_attachments.send_email_with_files(client, **options)
    second = sending_attachments.send_email_with_files(client, **options)
    uploaded = [request for request in requests if request["upload"]]
    assert len(uploaded) == 4
    assert all(0 < len(request["key"]) <= 255 for request in uploaded)
    assert uploaded[0]["key"] != uploaded[1]["key"]
    if explicit:
        assert uploaded[0]["key"] == "explicit-upload"
    assert uploaded[2:] == uploaded[:2]
    assert second.to_dict() == first.to_dict()


def test_sending_changed_file_conflicts_before_send(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Original attachment\n")
    options: dict[str, Any] = {
        "body": {"from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Replay", "html_body": "<p>Attached</p>"},
        "files": [report], "idempotency_key": "changed-file-replay",
    }
    sending_attachments.send_email_with_files(client, **options)
    sends_before = sum(not request["upload"] for request in requests)
    report.write_bytes(b"Changed attachment bytes\n")
    with pytest.raises(SendmuxApiError) as conflict:
        sending_attachments.send_email_with_files(client, **options)
    assert conflict.value.code == "idempotency_conflict"
    assert conflict.value.status_code == 409
    assert requests[-1]["upload"] is True
    assert sum(not request["upload"] for request in requests) == sends_before


def test_sending_unkeyed_file_repeat_stays_unkeyed(sending_replay: Any, tmp_path: Path) -> None:
    client, requests = sending_replay
    report = tmp_path / "report.txt"
    report.write_bytes(b"Unkeyed attachment\n")
    options: dict[str, Any] = {
        "body": {"from": {"email": "from@example.com"}, "to": {"email": "agent@example.com"}, "subject": "Unkeyed", "html_body": "<p>Attached</p>"},
        "files": [report],
    }
    first = sending_attachments.send_email_with_files(client, **options)
    first_body = requests[-1]["body"]
    second = sending_attachments.send_email_with_files(client, **options)
    assert all(request["key"] is None for request in requests)
    assert second.data.message_id != first.data.message_id
    assert requests[-1]["body"]["attachments"] != first_body["attachments"]
