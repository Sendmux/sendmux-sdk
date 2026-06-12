from __future__ import annotations

from typing import Any


def assert_no_forbidden_tools(tool_names: list[str], *, allowed_prefix: str) -> None:
    forbidden = [name for name in tool_names if not name.startswith(f"{allowed_prefix}_")]
    if forbidden:
        raise AssertionError(f"Unexpected tools for {allowed_prefix}: {', '.join(forbidden)}")


def structured_result(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    structured = getattr(value, "structured_content", None)
    if isinstance(structured, dict):
        result = structured.get("result")
        if isinstance(result, dict):
            return result
        return structured
    raise TypeError(f"Expected structured MCP result, got {type(value).__name__}")


def text_result(value: Any) -> str:
    if isinstance(value, str):
        return value
    content = getattr(value, "content", None)
    if isinstance(content, list):
        text_parts = [getattr(item, "text", None) for item in content]
        text = "\n".join(part for part in text_parts if isinstance(part, str))
        if text:
            return text
    direct_text = getattr(value, "text", None)
    if isinstance(direct_text, str):
        return direct_text
    raise TypeError(f"Expected text MCP result, got {type(value).__name__}")
