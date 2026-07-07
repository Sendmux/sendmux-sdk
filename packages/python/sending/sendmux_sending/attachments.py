from __future__ import annotations

import base64
import mimetypes

from os import PathLike
from pathlib import Path
from typing import Any

from sendmux_sending.api.attachments_api import AttachmentsApi
from sendmux_sending.api.emails_api import EmailsApi
from sendmux_sending.api_client import ApiClient
from sendmux_sending.models.attachment_upload_response import AttachmentUploadResponse
from sendmux_sending.models.email_send_request import EmailSendRequest
from sendmux_sending.models.send_success_response import SendSuccessResponse

PathInput = str | PathLike[str]
FileInput = PathInput | dict[str, Any]


def attachment_from_file(
    file_path: PathInput,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, str]:
    """Return a Sending API attachment object from a local file path."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    return {
        "content": base64.b64encode(file["bytes"]).decode("ascii"),
        "encoding": "base64",
        "filename": file["filename"],
        "type": file["content_type"],
    }


def upload_attachment_from_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    idempotency_key: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> AttachmentUploadResponse:
    """Upload a local file and return an attachment ID for Sending attachments."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = AttachmentsApi(api_client)
    return api.sending_upload_attachment(
        filename=file["filename"],
        body=file["bytes"],
        idempotency_key=idempotency_key,
        content_type=file["content_type"],
        _headers={"Content-Type": file["content_type"]},
        _request_timeout=request_timeout,
    )


def send_email_with_files(
    api_client: ApiClient,
    *,
    body: dict[str, Any],
    files: list[FileInput],
    idempotency_key: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> SendSuccessResponse:
    """Upload local files, attach their attachment IDs, and send one email."""

    attachments = list(body.get("attachments") or [])
    for file_input in files:
        file = _file_input(file_input)
        uploaded = upload_attachment_from_file(
            api_client,
            file_path=file["path"],
            filename=file.get("filename"),
            content_type=file.get("content_type"),
            idempotency_key=file.get("idempotency_key"),
            request_timeout=request_timeout,
        )
        attachments.append({"attachment_id": uploaded.data.attachment_id})

    api = EmailsApi(api_client)
    return api.sending_send_email(
        email_send_request=_email_send_request({**body, "attachments": attachments}),
        idempotency_key=idempotency_key,
        _request_timeout=request_timeout,
    )


def _file_input(value: FileInput) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"path": value}


def _email_send_request(body: dict[str, Any]) -> EmailSendRequest:
    request_body = EmailSendRequest.from_dict(body)
    if request_body is None:
        raise ValueError("Sending email request body was empty.")
    return request_body


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
