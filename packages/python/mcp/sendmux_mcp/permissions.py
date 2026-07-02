from __future__ import annotations

from types import MappingProxyType
from typing import Any, Mapping, cast

from fastmcp.server.auth import AuthContext

from sendmux_mcp.config import Surface
from sendmux_mcp.curation import TOOLS_BY_SURFACE

PermissionRequirement = tuple[str, ...]

TOOL_PERMISSION_REQUIREMENTS: Mapping[str, PermissionRequirement] = MappingProxyType(
    {
        "mailbox_list_granted_mailboxes": ("mailbox.read",),
        "mailbox_get_me": ("mailbox.read",),
        "mailbox_get_session": ("mailbox.read",),
        "mailbox_get_identity": ("mailbox.read",),
        "mailbox_list_identities": ("mailbox.read",),
        "mailbox_update_identity": ("mailbox.settings.update",),
        "mailbox_list_messages": ("mailbox.read",),
        "mailbox_get_message": ("mailbox.read",),
        "mailbox_list_body": ("mailbox.read",),
        "mailbox_list_content": ("mailbox.read",),
        "mailbox_batch_get_messages": ("mailbox.read",),
        "mailbox_batch_update_messages": ("mailbox.read", "mailbox.settings.update"),
        "mailbox_batch_delete_messages": ("mailbox.read", "mailbox.settings.update"),
        "mailbox_count_messages": ("mailbox.read",),
        "mailbox_search_message_snippets": ("mailbox.read",),
        "mailbox_send_message": ("email.send",),
        "mailbox_list_threads": ("mailbox.read",),
        "mailbox_get_thread": ("mailbox.read",),
        "mailbox_list_thread_messages": ("mailbox.read",),
        "mailbox_list_folders": ("mailbox.read",),
        "mailbox_get_changes": ("mailbox.read",),
        "mailbox_get_attachment": ("mailbox.read",),
        "mailbox_upload_attachment": ("email.send",),
        "mailbox_wait_for_message": ("mailbox.read",),
        "management_list_domains": ("domain.read",),
        "management_create_domain": ("domain.create",),
        "management_get_domain": ("domain.read",),
        "management_get_domain_zone_file": ("domain.read",),
        "management_verify_domain": ("domain.verify",),
        "management_list_mailboxes": ("mailbox.admin.read",),
        "management_check_mailbox_availability": ("mailbox.admin.create",),
        "management_create_mailbox": ("mailbox.admin.create",),
        "management_get_mailbox": ("mailbox.admin.read",),
        "management_update_mailbox": ("mailbox.admin.manage",),
        "management_suspend_mailbox": ("mailbox.admin.manage",),
        "management_resume_mailbox": ("mailbox.admin.manage",),
        "management_create_mailbox_key": ("mailbox.admin.manage",),
        "management_delete_mailbox_key": ("mailbox.admin.manage",),
        "management_list_email_logs": ("logs.read",),
        "management_get_email_log": ("logs.read",),
        "management_get_email_metrics": ("analytics.read",),
        "management_get_spend_summary": ("billing.read",),
        "management_list_webhooks": ("webhook.read",),
        "management_create_webhook": ("webhook.create",),
        "management_test_webhook": ("webhook.manage",),
        "sending_send_email": ("email.send",),
        "sending_send_email_batch": ("email.send",),
    }
)

TOOL_SURFACES: Mapping[str, Surface] = MappingProxyType(
    {tool.name: surface for surface, tools in TOOLS_BY_SURFACE.items() for tool in tools}
)


def api_key_has_permission(required: str, granted_permissions: tuple[str, ...]) -> bool:
    for permission in granted_permissions:
        if permission == required:
            return True
        if permission.endswith(".*"):
            prefix = permission[:-2]
            if required.startswith(f"{prefix}."):
                return True
    return False


def permissions_for_tool(tool_name: str) -> PermissionRequirement:
    permissions = TOOL_PERMISSION_REQUIREMENTS.get(tool_name)
    if permissions is None:
        raise ValueError(f"unknown MCP tool: {tool_name}")
    return permissions


def authorised_tool_names(surface: Surface | str, granted_permissions: tuple[str, ...]) -> set[str]:
    if surface not in TOOLS_BY_SURFACE:
        raise ValueError(f"unknown MCP surface: {surface}")
    surface_key = cast(Surface, surface)

    return {
        tool.name
        for tool in TOOLS_BY_SURFACE[surface_key]
        if all(api_key_has_permission(required, granted_permissions) for required in permissions_for_tool(tool.name))
    }


def tool_permission_auth_check(ctx: AuthContext) -> bool:
    claims = ctx.token.claims if ctx.token else None
    token_permissions = permissions_claim(claims)
    token_surfaces = surfaces_claim(claims)
    if token_permissions is None:
        return False
    if token_surfaces is None:
        return False

    component_name = getattr(ctx.component, "name", None)
    if not isinstance(component_name, str):
        return False

    try:
        required_permissions = permissions_for_tool(component_name)
        required_surface = TOOL_SURFACES[component_name]
    except ValueError:
        return False
    except KeyError:
        return False

    if required_surface not in token_surfaces:
        return False

    return all(api_key_has_permission(required, token_permissions) for required in required_permissions)


def permissions_claim(claims: Mapping[str, Any] | None) -> tuple[str, ...] | None:
    if claims is None:
        return None
    permissions = claims.get("permissions")
    if not isinstance(permissions, list):
        return None
    if not all(isinstance(permission, str) for permission in permissions):
        return None
    return tuple(permissions)


def surfaces_claim(claims: Mapping[str, Any] | None) -> tuple[Surface, ...] | None:
    if claims is None:
        return None
    surfaces = claims.get("surface")
    if not isinstance(surfaces, list):
        return None
    if not all(surface in TOOLS_BY_SURFACE for surface in surfaces):
        return None
    return tuple(cast(Surface, surface) for surface in surfaces)
