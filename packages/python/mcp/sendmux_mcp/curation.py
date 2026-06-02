from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, cast

from fastmcp.server.providers.openapi import MCPType, RouteMap
from fastmcp.utilities.openapi import HttpMethod

from sendmux_mcp.config import Surface
from sendmux_mcp.specs import operation_routes


@dataclass(frozen=True)
class ToolSpec:
    operation_id: str
    name: str
    title: str
    description: str


MAILBOX_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        operation_id="mailboxGetMe",
        name="mailbox_get_me",
        title="Get Mailbox Profile",
        description="Use this to identify the authenticated mailbox before acting on mail. It returns profile details for the mailbox key currently in use.",
    ),
    ToolSpec(
        operation_id="mailboxGetSession",
        name="mailbox_get_session",
        title="Get Mailbox Session",
        description="Use this before complex mailbox work to discover supported mailbox capabilities, limits, and endpoint metadata. Do not use it for message search.",
    ),
    ToolSpec(
        operation_id="mailboxGetIdentity",
        name="mailbox_get_identity",
        title="Get Mailbox Identity",
        description="Use this to read the mailbox sender identity and display name. Use it before composing replies when the sender should match the mailbox identity.",
    ),
    ToolSpec(
        operation_id="mailboxListIdentities",
        name="mailbox_list_identities",
        title="List Mailbox Identities",
        description="Use this to list sender identities available to the mailbox. Prefer mailbox_get_identity when only the default identity is needed.",
    ),
    ToolSpec(
        operation_id="mailboxUpdateIdentity",
        name="mailbox_update_identity",
        title="Update Mailbox Identity",
        description="Use this only when the user explicitly asks to change sender identity details. Do not use it for one-off message composition.",
    ),
    ToolSpec(
        operation_id="mailboxListMessages",
        name="mailbox_list_messages",
        title="List Messages",
        description="Use this to scan mailbox messages by cursor without fetching full bodies. Pass a small limit and continue with next_cursor only when more context is needed.",
    ),
    ToolSpec(
        operation_id="mailboxGetMessage",
        name="mailbox_get_message",
        title="Get Message",
        description="Use this to fetch one message summary or detail by message_id. Use mailbox_list_body or mailbox_list_content when the body content is required.",
    ),
    ToolSpec(
        operation_id="mailboxListBody",
        name="mailbox_list_body",
        title="Read Message Body",
        description="Use this to read the raw or simplified body for a known message_id. Prefer it when the task needs message text but not every MIME detail.",
    ),
    ToolSpec(
        operation_id="mailboxListContent",
        name="mailbox_list_content",
        title="Read Message Content",
        description="Use this to read structured content for a known message_id. Prefer it when headers, participants, or body parts affect the answer.",
    ),
    ToolSpec(
        operation_id="mailboxBatchGetMessages",
        name="mailbox_batch_get_messages",
        title="Batch Get Messages",
        description="Use this when the user supplies several message IDs or a prior search returns multiple candidates. It avoids repeated single-message calls.",
    ),
    ToolSpec(
        operation_id="mailboxBatchUpdateMessages",
        name="mailbox_batch_update_messages",
        title="Batch Update Messages",
        description="Use this to mark, flag, move, or otherwise update multiple messages after the user has confirmed the desired change. Do not use it for read-only tasks.",
    ),
    ToolSpec(
        operation_id="mailboxBatchDeleteMessages",
        name="mailbox_batch_delete_messages",
        title="Batch Delete Messages",
        description="Use this only when the user explicitly asks to delete messages and supplies or confirms the message IDs. Deletion is a mailbox mutation.",
    ),
    ToolSpec(
        operation_id="mailboxCountMessages",
        name="mailbox_count_messages",
        title="Count Messages",
        description="Use this to count messages matching mailbox filters without listing every result. Follow with mailbox_list_messages only when examples are needed.",
    ),
    ToolSpec(
        operation_id="mailboxSearchMessageSnippets",
        name="mailbox_search_message_snippets",
        title="Search Message Snippets",
        description="Use this to search message snippets by query text. Use returned message IDs with a read tool before making content-specific claims.",
    ),
    ToolSpec(
        operation_id="mailboxSendMessage",
        name="mailbox_send_message",
        title="Send Mailbox Message",
        description="Use this to send a message from the authenticated mailbox. Include an Idempotency-Key for retries and use mailbox identity tools if the sender details matter.",
    ),
    ToolSpec(
        operation_id="mailboxListThreads",
        name="mailbox_list_threads",
        title="List Threads",
        description="Use this to scan conversation threads without loading every message. Continue with next_cursor only when additional threads are needed.",
    ),
    ToolSpec(
        operation_id="mailboxGetThread",
        name="mailbox_get_thread",
        title="Get Thread",
        description="Use this to read one thread summary by thread_id. Use mailbox_list_thread_messages when the task needs the messages in the thread.",
    ),
    ToolSpec(
        operation_id="mailboxListThreadMessages",
        name="mailbox_list_thread_messages",
        title="List Thread Messages",
        description="Use this to list messages inside a known thread. Use message body tools only for messages that need full content.",
    ),
    ToolSpec(
        operation_id="mailboxListFolders",
        name="mailbox_list_folders",
        title="List Folders",
        description="Use this to inspect mailbox folders before filing or moving messages. It is read-only.",
    ),
    ToolSpec(
        operation_id="mailboxGetChanges",
        name="mailbox_get_changes",
        title="Get Mailbox Changes",
        description="Use this to resume mailbox sync from a prior state cursor. Do not use it for ad hoc message search.",
    ),
)

MANAGEMENT_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        operation_id="managementListDomains",
        name="management_list_domains",
        title="List Domains",
        description="Use this to list sending domains for the team. Pass a small limit and continue by cursor only when more domains are needed.",
    ),
    ToolSpec(
        operation_id="managementCreateDomain",
        name="management_create_domain",
        title="Create Domain",
        description="Use this when the user asks to add a domain. Follow with management_get_domain_zone_file so the user can configure DNS.",
    ),
    ToolSpec(
        operation_id="managementGetDomain",
        name="management_get_domain",
        title="Get Domain",
        description="Use this to inspect one domain by public_id. Use it before verify or delete decisions.",
    ),
    ToolSpec(
        operation_id="managementGetDomainZoneFile",
        name="management_get_domain_zone_file",
        title="Get Domain DNS Records",
        description="Use this to retrieve the DNS records needed for a domain. Return the records exactly enough for the user to configure DNS.",
    ),
    ToolSpec(
        operation_id="managementVerifyDomain",
        name="management_verify_domain",
        title="Verify Domain",
        description="Use this after the user says DNS records are configured. Do not call repeatedly if verification is still propagating.",
    ),
    ToolSpec(
        operation_id="managementListMailboxes",
        name="management_list_mailboxes",
        title="List Mailboxes",
        description="Use this to list team mailboxes. Pass a small limit and continue by cursor only when more mailboxes are needed.",
    ),
    ToolSpec(
        operation_id="managementCreateMailbox",
        name="management_create_mailbox",
        title="Create Mailbox",
        description="Use this when the user asks to provision a mailbox. Follow with key creation only when an API credential is needed.",
    ),
    ToolSpec(
        operation_id="managementGetMailbox",
        name="management_get_mailbox",
        title="Get Mailbox",
        description="Use this to inspect one mailbox by public_id before updates, suspension, or key creation.",
    ),
    ToolSpec(
        operation_id="managementUpdateMailbox",
        name="management_update_mailbox",
        title="Update Mailbox",
        description="Use this only when the user explicitly asks to change mailbox settings. Confirm target mailbox identity first.",
    ),
    ToolSpec(
        operation_id="managementSuspendMailbox",
        name="management_suspend_mailbox",
        title="Suspend Mailbox",
        description="Use this only when the user explicitly asks to suspend mailbox access. It is a control-plane mutation.",
    ),
    ToolSpec(
        operation_id="managementResumeMailbox",
        name="management_resume_mailbox",
        title="Resume Mailbox",
        description="Use this to resume a suspended mailbox after the user confirms the target mailbox.",
    ),
    ToolSpec(
        operation_id="managementCreateMailboxKey",
        name="management_create_mailbox_key",
        title="Create Mailbox Key",
        description="Use this to create a mailbox-scoped API key for an agent or integration. Return the secret only as provided by the API response.",
    ),
    ToolSpec(
        operation_id="managementDeleteMailboxKey",
        name="management_delete_mailbox_key",
        title="Delete Mailbox Key",
        description="Use this only when the user asks to revoke a known mailbox key ID. This is irreversible for that key.",
    ),
    ToolSpec(
        operation_id="managementListEmailLogs",
        name="management_list_email_logs",
        title="List Email Logs",
        description="Use this to inspect recent outbound email delivery logs. Apply filters and small limits before reading specific log details.",
    ),
    ToolSpec(
        operation_id="managementGetEmailLog",
        name="management_get_email_log",
        title="Get Email Log",
        description="Use this to inspect one outbound email log by public_id. It is the preferred follow-up after list_email_logs identifies a candidate.",
    ),
    ToolSpec(
        operation_id="managementGetEmailMetrics",
        name="management_get_email_metrics",
        title="Get Email Metrics",
        description="Use this for aggregate sending metrics over a time window. Do not use it when the user asks about one specific email.",
    ),
    ToolSpec(
        operation_id="managementGetSpendSummary",
        name="management_get_spend_summary",
        title="Get Spend Summary",
        description="Use this to answer account spend or balance trend questions. It is read-only.",
    ),
    ToolSpec(
        operation_id="managementListWebhooks",
        name="management_list_webhooks",
        title="List Webhooks",
        description="Use this to list webhook subscriptions. Follow with create or test only when the user asks for changes.",
    ),
    ToolSpec(
        operation_id="managementCreateWebhook",
        name="management_create_webhook",
        title="Create Webhook",
        description="Use this when the user asks to create a webhook subscription. Confirm the destination URL and events before calling.",
    ),
    ToolSpec(
        operation_id="managementTestWebhook",
        name="management_test_webhook",
        title="Test Webhook",
        description="Use this to send a test event to an existing webhook after the user confirms the target webhook.",
    ),
)

SENDING_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        operation_id="sendingSendEmail",
        name="sending_send_email",
        title="Send Email",
        description="Use this to send one outbound email through the sending API. Include an Idempotency-Key so retries do not create duplicate sends.",
    ),
    ToolSpec(
        operation_id="sendingSendEmailBatch",
        name="sending_send_email_batch",
        title="Send Email Batch",
        description="Use this to send multiple outbound emails in one request. Use it only when the user supplies or confirms every recipient and message.",
    ),
)

TOOLS_BY_SURFACE: dict[Surface, tuple[ToolSpec, ...]] = {
    "mailbox": MAILBOX_TOOLS,
    "management": MANAGEMENT_TOOLS,
    "sending": SENDING_TOOLS,
}

TOOL_BY_OPERATION_ID = {
    tool.operation_id: (surface, tool)
    for surface, tools in TOOLS_BY_SURFACE.items()
    for tool in tools
}


def route_maps_for_surface(document: dict[str, Any], surface: Surface) -> list[RouteMap]:
    routes = operation_routes(document)
    maps: list[RouteMap] = []
    missing: list[str] = []

    for tool in TOOLS_BY_SURFACE[surface]:
        route = routes.get(tool.operation_id)
        if route is None:
            missing.append(tool.operation_id)
            continue
        method, path = route
        maps.append(
            RouteMap(
                methods=[cast(HttpMethod, method)],
                pattern=f"^{re.escape(path)}$",
                mcp_type=MCPType.TOOL,
                mcp_tags={"sendmux", surface},
            )
        )

    if missing:
        raise ValueError(f"OpenAPI document is missing curated operations for {surface}: {', '.join(missing)}")

    maps.append(RouteMap(mcp_type=MCPType.EXCLUDE))
    return maps


def mcp_names_for_surface(surface: Surface) -> dict[str, str]:
    return {tool.operation_id: tool.name for tool in TOOLS_BY_SURFACE[surface]}


def customise_component(route: Any, component: Any) -> None:
    operation_id = getattr(route, "operation_id", None)
    if not isinstance(operation_id, str):
        return
    entry = TOOL_BY_OPERATION_ID.get(operation_id)
    if entry is None:
        return
    surface, tool = entry
    component.name = tool.name
    component.title = tool.title
    component.description = tool.description
    component.tags = set(getattr(component, "tags", set())) | {"sendmux", surface}
