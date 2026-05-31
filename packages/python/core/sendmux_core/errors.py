from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class SendmuxApiError(Exception):
    status_code: int | None
    code: str
    message: str
    retryable: bool
    request_id: str | None
    headers: Mapping[str, str]
    raw_body: str | None = None

    def __str__(self) -> str:
        status = f"{self.status_code} " if self.status_code is not None else ""
        return f"{status}{self.code}: {self.message}"


def map_api_exception(exc: Any) -> SendmuxApiError:
    headers = _headers(exc)
    payload = _payload(exc)
    detail = _error_detail(payload)
    status_code = getattr(exc, "status", None)
    code = _string(detail.get("code")) or "api_error"
    message = _string(detail.get("message")) or _string(getattr(exc, "reason", None)) or "Sendmux API request failed"
    retryable = _bool(detail.get("retryable"))

    return SendmuxApiError(
        status_code=status_code if isinstance(status_code, int) else None,
        code=code,
        message=message,
        retryable=retryable if retryable is not None else _default_retryable(status_code),
        request_id=_request_id(payload) or _header(headers, "x-request-id"),
        headers=headers,
        raw_body=getattr(exc, "body", None),
    )


def _headers(exc: Any) -> Mapping[str, str]:
    value = getattr(exc, "headers", None)
    if not value:
        return {}
    return {str(key): str(child) for key, child in dict(value).items()}


def _payload(exc: Any) -> Any:
    data = getattr(exc, "data", None)
    if data is not None:
        if hasattr(data, "to_dict"):
            return data.to_dict()
        return data

    body = getattr(exc, "body", None)
    if isinstance(body, str) and body:
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return None
    return None


def _error_detail(payload: Any) -> Mapping[str, Any]:
    if not isinstance(payload, Mapping):
        return {}
    error = payload.get("error")
    if isinstance(error, Mapping):
        return error
    return {}


def _request_id(payload: Any) -> str | None:
    if not isinstance(payload, Mapping):
        return None
    meta = payload.get("meta")
    if not isinstance(meta, Mapping):
        return None
    return _string(meta.get("request_id"))


def _header(headers: Mapping[str, str], name: str) -> str | None:
    name = name.lower()
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _bool(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _default_retryable(status_code: Any) -> bool:
    return isinstance(status_code, int) and (status_code == 429 or status_code >= 500)
