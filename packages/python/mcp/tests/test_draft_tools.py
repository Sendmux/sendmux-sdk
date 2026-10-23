from __future__ import annotations

import asyncio

from sendmux_mcp.contract import collect_tools
from sendmux_mcp.permissions import authorised_tool_names


def test_draft_tools_require_read_and_the_matching_write_or_send_permission() -> None:
    for permission, names in (
        ("mailbox.drafts.write", {"mailbox_create_draft", "mailbox_update_draft", "mailbox_delete_draft"}),
        ("email.send", {"mailbox_send_draft", "mailbox_control_draft_schedule"}),
    ):
        assert names <= authorised_tool_names("mailbox", ("mailbox.read", permission))
        assert not names & authorised_tool_names("mailbox", (permission,))
        assert not names & authorised_tool_names("mailbox", ("mailbox.read",))


def test_discovered_draft_tools_keep_review_versions_and_accurate_annotations() -> None:
    tools = {tool["name"]: tool for tool in asyncio.run(collect_tools())["mailbox"]}
    for name, versions in (
        ("mailbox_update_draft", {"expected_revision"}),
        ("mailbox_send_draft", {"expected_revision"}),
        ("mailbox_control_draft_schedule", {"expected_revision", "expected_schedule_version", "scheduled_for"}),
    ):
        tool = tools[name]
        assert versions <= set(tool["input_schema"]["required"])
        assert tool["output_schema"]
        assert tool["annotations"]["read_only_hint"] is False
        assert tool["annotations"]["open_world_hint"] is True
        for prop in tool["input_schema"]["properties"].values():
            assert prop.get("description")
    assert tools["mailbox_delete_draft"]["annotations"]["destructive_hint"] is True
    assert tools["mailbox_request_attachment_text"]["annotations"]["idempotent_hint"] is True


def test_cost_usage_tool_requires_mailbox_administration_read() -> None:
    name = "management_get_mailbox_cost_usage"
    assert name in authorised_tool_names("management", ("mailbox.admin.read",))
    assert name not in authorised_tool_names("management", ("billing.read",))
    assert name not in authorised_tool_names("mailbox", ("mailbox.admin.read",))
