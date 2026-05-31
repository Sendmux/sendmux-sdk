from __future__ import annotations


def idempotency_headers(idempotency_key: str | None = None) -> dict[str, str]:
    return {"Idempotency-Key": idempotency_key} if idempotency_key else {}


def conditional_headers(*, if_match: str | None = None, if_none_match: str | None = None) -> dict[str, str]:
    headers: dict[str, str] = {}
    if if_match:
        headers["If-Match"] = if_match
    if if_none_match:
        headers["If-None-Match"] = if_none_match
    return headers

