from __future__ import annotations

import copy
import json
from importlib import resources
from pathlib import Path
from typing import Any

import httpx

from sendmux_mcp.config import ServerConfig

APP_SPEC = "openapi-app.json"
SENDING_SPEC = "openapi-sending.json"


def load_spec(config: ServerConfig, surface: str | None = None) -> dict[str, Any]:
    source = spec_source(config, surface)
    if is_url(source):
        response = httpx.get(source, timeout=config.timeout_seconds)
        response.raise_for_status()
        document = response.json()
    else:
        document = json.loads(Path(source).read_text(encoding="utf8"))

    if document.get("openapi") != "3.1.0":
        raise ValueError(f"{source} must be an OpenAPI 3.1.0 document")
    return document


def spec_source(config: ServerConfig, surface: str | None = None) -> str:
    selected_surface = surface or config.only_surface()
    if selected_surface == "sending":
        if config.sending_openapi:
            return config.sending_openapi
        filename = SENDING_SPEC
    else:
        if config.app_openapi:
            return config.app_openapi
        filename = APP_SPEC

    if config.openapi_input_dir:
        return str(Path(config.openapi_input_dir) / filename)

    return str(resources.files("sendmux_mcp.openapi").joinpath(filename))


def prepare_for_fastmcp(document: dict[str, Any], *, base_url: str) -> dict[str, Any]:
    prepared = strip_unevaluated_properties(copy.deepcopy(document))
    prepared["servers"] = [{"url": base_url}]
    return prepared


def strip_unevaluated_properties(value: Any) -> Any:
    if isinstance(value, list):
        return [strip_unevaluated_properties(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: strip_unevaluated_properties(child)
        for key, child in value.items()
        if key != "unevaluatedProperties"
    }


def operation_routes(document: dict[str, Any]) -> dict[str, tuple[str, str]]:
    routes: dict[str, tuple[str, str]] = {}
    for path, path_item in (document.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete", "head", "options"}:
                continue
            if not isinstance(operation, dict):
                continue
            operation_id = operation.get("operationId")
            if isinstance(operation_id, str):
                routes[operation_id] = (method.upper(), path)
    return routes


def is_url(value: str) -> bool:
    return value.startswith("https://") or value.startswith("http://")
