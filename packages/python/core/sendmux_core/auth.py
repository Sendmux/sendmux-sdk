from __future__ import annotations

import re
from typing import Any, Callable, Literal

ApiKeySurface = Literal["root", "mailbox", "sending"]
AccessToken = str | Callable[[], str]


def resolve_access_token(access_token: AccessToken) -> str:
    token = access_token() if callable(access_token) else access_token
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token):
        raise ValueError("Expected a non-empty bearer token without a scheme or whitespace")
    return token


def validate_auth(*, api_key: str | None, access_token: AccessToken | None, surface: ApiKeySurface) -> None:
    if (api_key is None) == (access_token is None):
        raise ValueError("Provide exactly one of api_key or access_token")
    if api_key is not None:
        validate_api_key(api_key, surface=surface)
    elif access_token is not None and not callable(access_token):
        resolve_access_token(access_token)


def validate_api_key(api_key: str, *, surface: ApiKeySurface) -> None:
    if surface == "root":
        if not api_key.startswith("smx_root_"):
            raise ValueError("Expected a smx_root_ API key for the root surface")
        return

    if surface == "mailbox":
        if not (api_key.startswith("smx_mbx_") or api_key.startswith("smx_agent_")):
            raise ValueError("Expected a smx_mbx_ or smx_agent_ API key for the mailbox surface")
        return

    if surface == "sending":
        if not (api_key.startswith("smx_mbx_") or api_key.startswith("smx_agent_")):
            raise ValueError("Expected a smx_mbx_ or owner-approved smx_agent_ API key for the sending surface")
        return

    raise ValueError(f"Unknown Sendmux API key surface: {surface}")


def configure_auth(configuration: Any, *, api_key: str) -> None:
    configuration.access_token = api_key
