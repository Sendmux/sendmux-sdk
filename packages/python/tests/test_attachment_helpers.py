from __future__ import annotations

import json
from email.message import EmailMessage
from pathlib import Path
from typing import Any, cast
from urllib.error import HTTPError

import pytest

import sendmux_mailbox.attachments as mailbox_attachments
import sendmux_sending.attachments as sending_attachments
from sendmux_mailbox import download_mailbox_attachment, read_mailbox_text_attachment
from sendmux_mailbox.api_client import ApiClient as MailboxApiClient
from sendmux_mailbox.models.mailbox_attachment_upload_intent_result_response import (
    MailboxAttachmentUploadIntentResultResponse,
)
from sendmux_mailbox.models.mailbox_attachment_upload_result_response import MailboxAttachmentUploadResultResponse
from sendmux_mailbox.models.mailbox_send_result_response import MailboxSendResultResponse
from sendmux_sending.api_client import ApiClient as SendingApiClient
from sendmux_sending.models.send_success_response import SendSuccessResponse


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
