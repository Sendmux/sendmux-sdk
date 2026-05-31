from __future__ import annotations

from typing import Any, Literal

ApiKeySurface = Literal["root", "mailbox"]


def validate_api_key(api_key: str, *, surface: ApiKeySurface) -> None:
    expected_prefix = "smx_mbx_" if surface == "mailbox" else "smx_root_"
    if not api_key.startswith(expected_prefix):
        raise ValueError(f"Expected a {expected_prefix} API key for the {surface} surface")


def configure_auth(configuration: Any, *, api_key: str) -> None:
    configuration.api_key["BearerAuth"] = api_key
    configuration.api_key_prefix["BearerAuth"] = "Bearer"

