from __future__ import annotations

import ast
import asyncio
import json
import os
from collections import defaultdict
from typing import Any, Literal, TypedDict, cast

from fastmcp import Client

from sendmux_mcp.config import ServerConfig, Surface
from sendmux_mcp.server import create_server
from sendmux_mcp.verification import structured_result, text_result


class PlannedOperation(TypedDict):
    args: dict[str, Any]
    cleanupSelectors: list[str] | None
    expectedErrorCodes: list[str] | None
    operationId: str
    responseKind: Literal["binary", "json", "text"]
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
                    call_result = await client.call_tool(operation["toolName"], operation["args"])
                    if operation.get("responseKind") == "text":
                        assert_text_response(operation["operationId"], text_result(call_result))
                        cleanup = None
                    else:
                        result = structured_result(call_result)
                        assert_live_response(operation["operationId"], result, operation.get("expectedErrorCodes"))
                        cleanup = cleanup_result(result, operation.get("cleanupSelectors"))
                    entry: dict[str, Any] = {
                        "adapter": "mcp",
                        "operationId": operation["operationId"],
                        "status": "passed",
                    }
                    if cleanup is not None:
                        entry["cleanup"] = cleanup
                    results.append(entry)
                except Exception as error:  # pragma: no cover - exercised by live runner
                    if expected_api_error_exception(error, operation.get("expectedErrorCodes")):
                        results.append(
                            {
                                "adapter": "mcp",
                                "operationId": operation["operationId"],
                                "status": "passed",
                            }
                        )
                        continue
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


def assert_live_response(operation_id: str, value: dict[str, Any], expected_error_codes: list[str] | None = None) -> None:
    if expected_error_codes:
        if value.get("ok") is not False:
            raise AssertionError(f"{operation_id} expected a safe API error response")
        error = value.get("error")
        if not isinstance(error, dict) or error.get("code") not in expected_error_codes:
            raise AssertionError(f"{operation_id} returned unexpected error code")
        meta = value.get("meta")
        if not isinstance(meta, dict) or not isinstance(meta.get("request_id"), str):
            raise AssertionError(f"{operation_id} did not return meta.request_id")
        return

    if operation_id == "mailboxStreamEvents":
        event_type = value.get("event_type") or value.get("event")
        if event_type not in {"message.received", "message.received.spam", "sync_required"}:
            raise AssertionError("mailboxStreamEvents did not return a mailbox realtime event")
        return

    if operation_id == "sendingGetOpenApiSpec":
        if value.get("openapi") != "3.1.0" or not isinstance(value.get("paths"), dict):
            raise AssertionError("sendingGetOpenApiSpec did not return OpenAPI 3.1")
        return

    if value.get("ok") is not True:
        raise AssertionError(f"{operation_id} did not return ok=true")
    meta = value.get("meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("request_id"), str):
        raise AssertionError(f"{operation_id} did not return meta.request_id")


def expected_api_error_exception(error: Exception, expected_error_codes: list[str] | None) -> bool:
    if not expected_error_codes:
        return False
    text = str(error)
    if " - " not in text:
        return False
    try:
        value = ast.literal_eval(text.split(" - ", 1)[1])
    except (SyntaxError, ValueError, TypeError, MemoryError, RecursionError):
        return False
    if not isinstance(value, dict) or value.get("ok") is not False:
        return False
    api_error = value.get("error")
    meta = value.get("meta")
    return (
        isinstance(api_error, dict)
        and api_error.get("code") in expected_error_codes
        and isinstance(meta, dict)
        and isinstance(meta.get("request_id"), str)
    )


def assert_text_response(operation_id: str, value: str) -> None:
    if not value:
        raise AssertionError(f"{operation_id} returned empty text")


def cleanup_result(value: dict[str, Any], selectors: list[str] | None) -> dict[str, Any] | None:
    if not selectors:
        return None
    selected: dict[str, Any] = {}
    for selector in selectors:
        item = value_at_path(value, selector)
        if item is None:
            continue
        set_value_at_path(selected, selector, item)
    return selected if selected else None


def value_at_path(value: Any, selector: str) -> Any:
    current = value
    for segment in selector.split("."):
        if isinstance(current, list) and segment.isdigit():
            index = int(segment)
            current = current[index] if index < len(current) else None
        elif isinstance(current, dict):
            current = current.get(segment)
        else:
            return None
    return current


def set_value_at_path(target: dict[str, Any], selector: str, value: Any) -> None:
    current = target
    parts = selector.split(".")
    for segment in parts[:-1]:
        child = current.get(segment)
        if not isinstance(child, dict):
            child = {}
            current[segment] = child
        current = child
    current[parts[-1]] = value


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
