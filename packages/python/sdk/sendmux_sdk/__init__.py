from __future__ import annotations

from importlib import import_module
from types import ModuleType

__all__ = ["core", "mailbox", "management", "sending"]

_MODULES = {
    "core": "sendmux_core",
    "mailbox": "sendmux_mailbox",
    "management": "sendmux_management",
    "sending": "sendmux_sending",
}


def __getattr__(name: str) -> ModuleType:
    if name not in _MODULES:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module = import_module(_MODULES[name])
    globals()[name] = module
    return module
