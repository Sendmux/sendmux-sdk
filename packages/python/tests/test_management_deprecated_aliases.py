from __future__ import annotations

import importlib
import warnings
from typing import Any, get_args, get_type_hints

import pytest

import sendmux_management
import sendmux_management.models
from sendmux_management.models.mailbox_app_password_result import MailboxAppPasswordResult
from sendmux_management.models.provider_create_body_quotas_per_day import ProviderCreateBodyQuotasPerDay

REMOVED_IN = "sendmux-management 3.0"

# Names the nullable-reference schema shape drops from the generated package. Each is a real
# generated class until that regeneration lands and a deprecated alias of the class that types the
# same field afterwards; either way the name keeps resolving from both modules.
COMPAT_MODEL_NAMES = {
    "MailboxAppPasswordResultCredential": ("MailboxCredential", MailboxAppPasswordResult, "credential"),
    "ProviderCreateBodyQuotasPerDayAnyOf": ("ProviderQuotaRange", ProviderCreateBodyQuotasPerDay, "anyof_schema_2_validator"),
}


def innermost_class(annotation: Any) -> Any:
    while args := [arg for arg in get_args(annotation) if arg is not type(None)]:
        annotation = args[0]
    return annotation


@pytest.mark.parametrize("module_name", ["sendmux_management", "sendmux_management.models"])
@pytest.mark.parametrize("name", sorted(COMPAT_MODEL_NAMES))
def test_compat_model_name_keeps_resolving(module_name: str, name: str) -> None:
    module = importlib.import_module(module_name)
    replacement, _owner, _field = COMPAT_MODEL_NAMES[name]
    aliases = getattr(module, "_DEPRECATED_MODEL_ALIASES", {})
    exported = getattr(module, "__all__", None)  # the models module publishes no __all__

    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always")
        resolved = getattr(module, name)

    if name in aliases:
        assert aliases[name] == (replacement, REMOVED_IN)
        assert resolved is getattr(module, replacement)
        assert [str(warning.message) for warning in captured] == [
            f"{name} is deprecated; use {replacement}. It will be removed in {REMOVED_IN}."
        ]
        assert exported is None or name not in exported
    else:
        assert captured == []
        assert resolved.__name__ == name
        assert exported is None or name in exported


@pytest.mark.parametrize("name", sorted(COMPAT_MODEL_NAMES))
def test_compat_model_name_is_the_class_typing_its_field(name: str) -> None:
    _replacement, owner, field = COMPAT_MODEL_NAMES[name]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        resolved = getattr(sendmux_management, name)

    assert innermost_class(get_type_hints(owner)[field]) is resolved


@pytest.mark.parametrize("module_name", ["sendmux_management", "sendmux_management.models"])
def test_unknown_attributes_still_raise_attribute_error(module_name: str) -> None:
    module = importlib.import_module(module_name)

    with pytest.raises(AttributeError, match="has no attribute 'ManagementNoSuchModel'"):
        getattr(module, "ManagementNoSuchModel")
