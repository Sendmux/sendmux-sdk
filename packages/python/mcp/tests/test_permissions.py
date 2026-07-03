from __future__ import annotations

from types import SimpleNamespace
from typing import cast, get_args

from fastmcp.server.auth import AccessToken, AuthContext
from fastmcp.utilities.components import FastMCPComponent

from sendmux_mcp.config import Surface
from sendmux_mcp.curation import TOOLS_BY_SURFACE
from sendmux_mcp.permissions import (
    TOOL_PERMISSION_REQUIREMENTS,
    api_key_has_permission,
    authorised_tool_names,
    permissions_for_tool,
    tool_permission_auth_check,
)


def test_every_curated_tool_has_permission_requirements() -> None:
    curated_tool_names = {tool.name for tools in TOOLS_BY_SURFACE.values() for tool in tools}

    assert set(TOOL_PERMISSION_REQUIREMENTS) == curated_tool_names
    assert all(TOOL_PERMISSION_REQUIREMENTS[tool_name] for tool_name in curated_tool_names)


def test_permission_lookup_returns_required_permissions_for_tool() -> None:
    assert permissions_for_tool("mailbox_batch_delete_messages") == (
        "mailbox.read",
        "mailbox.settings.update",
    )
    assert permissions_for_tool("mailbox_list_granted_mailboxes") == ("mailbox.read",)
    assert permissions_for_tool("mailbox_get_attachment") == ("mailbox.read",)
    assert permissions_for_tool("mailbox_upload_attachment") == ("email.send",)
    assert permissions_for_tool("mailbox_wait_for_message") == ("mailbox.read",)
    assert permissions_for_tool("management_create_domain") == ("domain.create",)
    assert permissions_for_tool("management_check_mailbox_availability") == ("mailbox.admin.create",)
    assert permissions_for_tool("sending_send_email_batch") == ("email.send",)


def test_api_key_permission_check_matches_sendmux_wildcard_semantics() -> None:
    assert api_key_has_permission("analytics.read", ("analytics.*",))
    assert api_key_has_permission("analytics.read", ("analytics.read",))
    assert not api_key_has_permission("analytics.read", ("logs.read",))


def test_authorised_tools_are_filtered_per_surface() -> None:
    granted = ("mailbox.read", "email.send")

    assert authorised_tool_names("mailbox", granted) == {
        "mailbox_get_me",
        "mailbox_list_granted_mailboxes",
        "mailbox_get_session",
        "mailbox_get_identity",
        "mailbox_list_identities",
        "mailbox_list_messages",
        "mailbox_get_message",
        "mailbox_list_body",
        "mailbox_list_content",
        "mailbox_batch_get_messages",
        "mailbox_count_messages",
        "mailbox_search_message_snippets",
        "mailbox_get_attachment",
        "mailbox_send_message",
        "mailbox_upload_attachment",
        "mailbox_list_threads",
        "mailbox_get_thread",
        "mailbox_list_thread_messages",
        "mailbox_list_folders",
        "mailbox_get_changes",
        "mailbox_wait_for_message",
    }


def test_authorised_tools_respect_management_wildcards() -> None:
    granted = ("domain.*", "mailbox.admin.read")

    assert authorised_tool_names("management", granted) == {
        "management_list_domains",
        "management_create_domain",
        "management_get_domain",
        "management_get_domain_zone_file",
        "management_verify_domain",
        "management_list_mailboxes",
        "management_get_mailbox",
    }


def test_authorised_tools_include_mailbox_availability_for_create_permission() -> None:
    granted = ("mailbox.admin.create",)

    assert "management_check_mailbox_availability" in authorised_tool_names("management", granted)


def test_authorised_tool_names_rejects_unknown_surface() -> None:
    unknown_surface = "analytics"

    try:
        authorised_tool_names(unknown_surface, ())
    except ValueError as error:
        assert str(error) == "unknown MCP surface: analytics"
    else:
        raise AssertionError("expected unknown surface to fail")


def test_all_known_surfaces_can_be_filtered() -> None:
    for surface in get_args(Surface):
        assert isinstance(authorised_tool_names(surface, ()), set)


def test_tool_permission_auth_check_uses_permissions_claim() -> None:
    token = AccessToken(
        token="token",
        client_id="client",
        scopes=[],
        claims={"permissions": ["domain.*"], "surface": ["management"]},
    )
    component = cast(FastMCPComponent, SimpleNamespace(name="management_create_domain"))

    assert tool_permission_auth_check(AuthContext(token=token, component=component))


def test_tool_permission_auth_check_fails_closed_without_required_claim() -> None:
    token = AccessToken(
        token="token",
        client_id="client",
        scopes=[],
        claims={"permissions": ["domain.read"], "surface": ["management"]},
    )
    component = cast(FastMCPComponent, SimpleNamespace(name="management_create_domain"))

    assert not tool_permission_auth_check(AuthContext(token=token, component=component))
    assert not tool_permission_auth_check(AuthContext(token=None, component=component))


def test_tool_permission_auth_check_fails_closed_outside_token_surface() -> None:
    token = AccessToken(
        token="token",
        client_id="client",
        scopes=[],
        claims={"permissions": ["email.send"], "surface": ["sending"]},
    )
    component = cast(FastMCPComponent, SimpleNamespace(name="mailbox_send_message"))

    assert not tool_permission_auth_check(AuthContext(token=token, component=component))
