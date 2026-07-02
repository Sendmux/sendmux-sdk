from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import sendmux_mailbox.attachments as mailbox_attachments
import sendmux_sending.attachments as sending_attachments
from sendmux_mailbox.api_client import ApiClient as MailboxApiClient
from sendmux_mailbox.models.mailbox_attachment_upload_intent_result_response import (
    MailboxAttachmentUploadIntentResultResponse,
)
from sendmux_mailbox.models.mailbox_attachment_upload_result_response import MailboxAttachmentUploadResultResponse
from sendmux_mailbox.models.mailbox_send_result_response import MailboxSendResultResponse
from sendmux_sending.api_client import ApiClient as SendingApiClient
from sendmux_sending.models.send_success_response import SendSuccessResponse


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


class FakeUrlopenResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeUrlopenResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class FakeSendingApi:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def sending_send_email(self, **kwargs: Any) -> SendSuccessResponse:
        self.requests.append(kwargs)
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


def test_sending_attachment_from_file_and_send_email(monkeypatch: Any, tmp_path: Path) -> None:
    report = tmp_path / "report.txt"
    report.write_bytes(b"python helper attachment\n")
    api = FakeSendingApi()
    monkeypatch.setattr(sending_attachments, "EmailsApi", lambda _api_client: api)

    attachment = sending_attachments.attachment_from_file(report)
    assert attachment == {
        "content": "cHl0aG9uIGhlbHBlciBhdHRhY2htZW50Cg==",
        "encoding": "base64",
        "filename": "report.txt",
        "type": "text/plain",
    }

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
    assert api.requests[0]["email_send_request"].to_dict()["attachments"] == [attachment]
