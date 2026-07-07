from __future__ import annotations

import json
import mimetypes

from os import PathLike
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from sendmux_mailbox.api.mailbox_api_api import MailboxAPIApi
from sendmux_mailbox.api_client import ApiClient
from sendmux_mailbox.models.mailbox_attachment_upload_intent_body import MailboxAttachmentUploadIntentBody
from sendmux_mailbox.models.mailbox_attachment_upload_intent_result_response import (
    MailboxAttachmentUploadIntentResultResponse,
)
from sendmux_mailbox.models.mailbox_attachment_upload_result_response import MailboxAttachmentUploadResultResponse
from sendmux_mailbox.models.mailbox_send_result_response import MailboxSendResultResponse
from sendmux_mailbox.models.send_mailbox_message_body import SendMailboxMessageBody

PathInput = str | PathLike[str]
FileInput = PathInput | dict[str, Any]


def upload_mailbox_attachment_from_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> MailboxAttachmentUploadResultResponse:
    """Upload a local file and return a blob ID for mailbox send attachments."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = MailboxAPIApi(api_client)
    return api.mailbox_upload_attachment(
        filename=file["filename"],
        body=file["bytes"],
        mailbox_id=mailbox_id,
        _headers={"Content-Type": file["content_type"]},
        _request_timeout=request_timeout,
    )


def create_mailbox_attachment_upload_from_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> MailboxAttachmentUploadIntentResultResponse:
    """Create a short-lived signed PUT URL for a local file."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = MailboxAPIApi(api_client)
    return api.mailbox_create_attachment_upload(
        mailbox_attachment_upload_intent_body=_attachment_upload_intent_body(file),
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )


def upload_mailbox_attachment_via_presigned_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | None = None,
) -> MailboxAttachmentUploadResultResponse:
    """Create a signed upload URL, PUT the file without an API key, and return the blob ID."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = MailboxAPIApi(api_client)
    intent = api.mailbox_create_attachment_upload(
        mailbox_attachment_upload_intent_body=_attachment_upload_intent_body(file),
        mailbox_id=mailbox_id,
    )
    request = Request(
        intent.data.upload_url,
        data=file["bytes"],
        headers={
            "Content-Length": intent.data.headers.content_length,
            "Content-Type": intent.data.headers.content_type,
        },
        method=intent.data.method,
    )
    try:
        with urlopen(request, timeout=request_timeout) as response:
            payload = _parse_upload_result_response(response.read())
    except HTTPError as exc:
        raise RuntimeError(f"Presigned attachment upload failed with HTTP {exc.code}.") from exc

    result = MailboxAttachmentUploadResultResponse.from_dict(payload)
    if result is None:
        raise ValueError("Presigned upload response was empty.")
    return result


def download_mailbox_attachment(
    api_client: ApiClient,
    *,
    message_id: str,
    attachment_id: str,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> bytes:
    """Download one mailbox attachment as bytes."""

    api = MailboxAPIApi(api_client)
    raw_download = getattr(api, "mailbox_get_message_attachment_without_preload_content", None)
    if callable(raw_download):
        response = raw_download(
            message_id=message_id,
            attachment_id=attachment_id,
            mailbox_id=mailbox_id,
            _request_timeout=request_timeout,
        )
        try:
            return _read_binary_response(response)
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()
            release_conn = getattr(response, "release_conn", None)
            if callable(release_conn):
                release_conn()

    result = api.mailbox_get_message_attachment(
        message_id=message_id,
        attachment_id=attachment_id,
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )
    return _coerce_bytes(result)


def read_mailbox_text_attachment(
    api_client: ApiClient,
    *,
    message_id: str,
    attachment_id: str,
    mailbox_id: str | None = None,
    encoding: str = "utf-8",
    request_timeout: float | tuple[float, float] | None = None,
) -> str:
    """Download one mailbox attachment and decode it as text."""

    return download_mailbox_attachment(
        api_client,
        message_id=message_id,
        attachment_id=attachment_id,
        mailbox_id=mailbox_id,
        request_timeout=request_timeout,
    ).decode(encoding)


def send_mailbox_message_with_files(
    api_client: ApiClient,
    *,
    body: dict[str, Any],
    files: list[FileInput],
    mailbox_id: str | None = None,
    idempotency_key: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> MailboxSendResultResponse:
    """Upload local files, attach their blob IDs, and send one mailbox message."""

    attachments = list(body.get("attachments") or [])
    for file_input in files:
        file = _file_input(file_input)
        uploaded = upload_mailbox_attachment_from_file(
            api_client,
            file_path=file["path"],
            filename=file.get("filename"),
            content_type=file.get("content_type"),
            mailbox_id=mailbox_id,
            request_timeout=request_timeout,
        )
        attachments.append(
            {
                "blob_id": uploaded.data.blob_id,
                "content_type": uploaded.data.content_type,
                "filename": uploaded.data.filename,
            }
        )

    next_body = {**body, "attachments": attachments}
    api = MailboxAPIApi(api_client)
    return api.mailbox_send_message(
        idempotency_key=idempotency_key,
        send_mailbox_message_body=_send_mailbox_message_body(next_body),
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )


def _file_input(value: FileInput) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"path": value}


def _attachment_upload_intent_body(file: dict[str, Any]) -> MailboxAttachmentUploadIntentBody:
    body = MailboxAttachmentUploadIntentBody.from_dict(
        {
            "content_type": file["content_type"],
            "filename": file["filename"],
            "size_bytes": len(file["bytes"]),
        }
    )
    if body is None:
        raise ValueError("Attachment upload intent body was empty.")
    return body


def _send_mailbox_message_body(body: dict[str, Any]) -> SendMailboxMessageBody:
    request_body = SendMailboxMessageBody.from_dict(body)
    if request_body is None:
        raise ValueError("Mailbox send message body was empty.")
    return request_body


def _parse_upload_result_response(body: bytes) -> dict[str, Any]:
    if not body.strip():
        raise ValueError("Presigned attachment upload succeeded but did not return attachment metadata.")
    try:
        decoded = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Presigned attachment upload returned invalid JSON metadata.") from exc
    if not isinstance(decoded, dict):
        raise ValueError("Presigned attachment upload metadata must be a JSON object.")
    return decoded


def _read_binary_response(response: Any) -> bytes:
    read = getattr(response, "read", None)
    if not callable(read):
        return _coerce_bytes(response)

    try:
        return _coerce_bytes(read(decode_content=True))
    except TypeError:
        return _coerce_bytes(read())


def _coerce_bytes(value: Any) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, str):
        return value.encode("utf-8")
    raise TypeError(f"Expected attachment bytes, got {type(value).__name__}.")


def _read_attachment_file(
    file_path: PathInput,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    path = Path(file_path)
    if not path.is_file():
        raise ValueError(f"Attachment path is not a regular file: {path}")
    data = path.read_bytes()
    if not data:
        raise ValueError(f"Attachment file is empty: {path}")

    guessed_type, _encoding = mimetypes.guess_type(path.name)
    return {
        "bytes": data,
        "content_type": content_type or guessed_type or "application/octet-stream",
        "filename": filename or path.name,
        "path": path,
    }
