from __future__ import annotations

import importlib
from importlib.metadata import version

import pytest


@pytest.mark.parametrize(
    ("distribution_name", "package_name"),
    [
        ("sendmux-sending", "sendmux_sending"),
        ("sendmux-mailbox", "sendmux_mailbox"),
        ("sendmux-management", "sendmux_management"),
    ],
)
def test_generated_runtime_versions_follow_distribution_metadata(
    distribution_name: str,
    package_name: str,
) -> None:
    expected = version(distribution_name)
    package = importlib.import_module(package_name)
    api_client = importlib.import_module(f"{package_name}.api_client")
    configuration = importlib.import_module(f"{package_name}.configuration")

    assert package.__version__ == expected
    assert api_client.ApiClient(configuration=configuration.Configuration()).user_agent == (
        f"OpenAPI-Generator/{expected}/python"
    )
    assert f"SDK Package Version: {expected}" in configuration.Configuration().to_debug_report()
