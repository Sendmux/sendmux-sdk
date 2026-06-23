from __future__ import annotations

from typing import Any, Literal

ApiKeySurface = Literal["root", "mailbox", "sending"]


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
