from __future__ import annotations

import asyncio
import os
from uuid import uuid4

from fastmcp import Client

from sendmux_mcp.config import ServerConfig
from sendmux_mcp.server import create_server
from sendmux_mcp.verification import assert_no_forbidden_tools, structured_result


async def main() -> None:
    mailbox_key = require_env("SENDMUX_STAGING_MAILBOX_API_KEY")
    app_base_url = os.environ.get("SENDMUX_STAGING_APP_BASE_URL", "https://app.sendmux.ai/api/v1")
    to_email = require_env("SENDMUX_STAGING_SEND_TO")

    mailbox_server = create_server(
        ServerConfig(
            surfaces=("mailbox",),
            api_key=mailbox_key,
            app_base_url=app_base_url,
        )
    )

    async with Client(mailbox_server) as client:
        tools = await client.list_tools()
        tool_names = sorted(tool.name for tool in tools)
        assert_no_forbidden_tools(tool_names, allowed_prefix="mailbox")
        if "mailbox_send_message" not in tool_names or "mailbox_list_messages" not in tool_names:
            raise AssertionError("Mailbox MCP server is missing send/read tools")

        send_result = structured_result(
            await client.call_tool(
                "mailbox_send_message",
                {
                    "Idempotency-Key": f"mcp-smoke-{uuid4()}",
                    "subject": "Sendmux MCP staging smoke",
                    "text_body": "Sendmux MCP staging smoke.",
                    "to": [{"email": to_email, "name": None}],
                },
            )
        )
        if send_result.get("ok") is not True:
            raise AssertionError("mailbox_send_message did not return ok=true")

        list_result = structured_result(await client.call_tool("mailbox_list_messages", {"limit": 1}))
        if list_result.get("ok") is not True:
            raise AssertionError("mailbox_list_messages did not return ok=true")

    try:
        create_server(ServerConfig(surfaces=("management",), api_key=mailbox_key, app_base_url=app_base_url))
    except ValueError:
        pass
    else:
        raise AssertionError("Management MCP server accepted a mailbox key")

    print("MCP staging smoke passed.")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Missing required environment variable {name}")
    return value


if __name__ == "__main__":
    asyncio.run(main())
