from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from typing import Any, TypedDict, cast

from fastmcp import Client

from sendmux_mcp.config import ServerConfig, Surface
from sendmux_mcp.server import create_server
from sendmux_mcp.verification import structured_result


class PlannedOperation(TypedDict):
    args: dict[str, Any]
    operationId: str
    surface: Surface
    toolName: str


async def main() -> None:
    plan = json.loads(require_env("SENDMUX_LIVE_E2E_MCP_PLAN"))
    operations = [cast(PlannedOperation, item) for item in plan.get("operations", [])]
    results: list[dict[str, Any]] = []
    grouped: dict[Surface, list[PlannedOperation]] = defaultdict(list)

    for operation in operations:
        grouped[operation["surface"]].append(operation)

    for surface, surface_operations in grouped.items():
        async with Client(server_for_surface(surface)) as client:
            tool_names = {tool.name for tool in await client.list_tools()}
            for operation in surface_operations:
                if operation["toolName"] not in tool_names:
                    results.append(
                        {
                            "adapter": "mcp",
                            "operationId": operation["operationId"],
                            "status": "failed",
                            "error": f"tool {operation['toolName']} is not visible",
                        }
                    )
                    continue

                try:
                    result = structured_result(await client.call_tool(operation["toolName"], operation["args"]))
                    assert_live_response(operation["operationId"], result)
                    results.append(
                        {
                            "adapter": "mcp",
                            "operationId": operation["operationId"],
                            "status": "passed",
                        }
                    )
                except Exception as error:  # pragma: no cover - exercised by live runner
                    results.append(
                        {
                            "adapter": "mcp",
                            "operationId": operation["operationId"],
                            "status": "failed",
                            "error": str(error),
                        }
                    )

    print(json.dumps({"results": results}, indent=2))


def server_for_surface(surface: Surface) -> Any:
    api_key = mailbox_api_key() if surface in {"mailbox", "sending"} else root_api_key()
    return create_server(
        ServerConfig(
            surfaces=(surface,),
            api_key=api_key,
            app_base_url=app_base_url(),
            sending_base_url=sending_base_url(),
        )
    )


def assert_live_response(operation_id: str, value: dict[str, Any]) -> None:
    if operation_id == "sendingGetOpenApiSpec":
        if value.get("openapi") != "3.1.0" or not isinstance(value.get("paths"), dict):
            raise AssertionError("sendingGetOpenApiSpec did not return OpenAPI 3.1")
        return

    if value.get("ok") is not True:
        raise AssertionError(f"{operation_id} did not return ok=true")
    meta = value.get("meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("request_id"), str):
        raise AssertionError(f"{operation_id} did not return meta.request_id")


def app_base_url() -> str:
    value = os.environ.get("SENDMUX_LIVE_E2E_APP_BASE_URL") or os.environ.get("SENDMUX_STAGING_APP_BASE_URL")
    return value if value else "https://app.sendmux.ai/api/v1"


def sending_base_url() -> str:
    value = os.environ.get("SENDMUX_LIVE_E2E_SENDING_BASE_URL") or os.environ.get("SENDMUX_STAGING_SMTP_BASE_URL")
    return value if value else "https://smtp.sendmux.ai/api/v1"


def root_api_key() -> str:
    return require_any_env("SENDMUX_LIVE_E2E_ROOT_API_KEY", "SENDMUX_STAGING_ROOT_API_KEY")


def mailbox_api_key() -> str:
    return require_any_env("SENDMUX_LIVE_E2E_MAILBOX_API_KEY", "SENDMUX_STAGING_MAILBOX_API_KEY")


def require_any_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise ValueError(f"Missing required environment variable: {' or '.join(names)}")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Missing required environment variable {name}")
    return value


if __name__ == "__main__":
    asyncio.run(main())
