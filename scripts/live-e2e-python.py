from __future__ import annotations

import importlib
import inspect
import json
import os
import pkgutil
import re
from typing import Any

from sendmux_core.errors import SendmuxApiError


def main() -> None:
    plan = json.loads(os.environ["SENDMUX_LIVE_E2E_LANGUAGE_PLAN"])
    results: list[dict[str, Any]] = []
    clients: dict[str, Any] = {}
    apis: dict[str, list[Any]] = {}

    for operation in plan["operations"]:
        try:
            surface = operation["surface"]
            api_client = clients.get(surface)
            if api_client is None:
                api_client = create_client(surface)
                clients[surface] = api_client
            api_objects = apis.get(surface)
            if api_objects is None:
                api_objects = discover_api_objects(surface, api_client)
                apis[surface] = api_objects

            value = call_operation(api_objects, operation)
            assert_response(operation, value)
            results.append(
                cleanup_entry(
                    {
                        "adapter": "python",
                        "operationId": operation["operationId"],
                        "status": "passed",
                    },
                    operation,
                    value,
                )
            )
        except SendmuxApiError as error:
            if error.code in (operation.get("expectedErrorCodes") or []):
                results.append(
                    {
                        "adapter": "python",
                        "operationId": operation["operationId"],
                        "status": "passed",
                    }
                )
            else:
                results.append(failure(operation, error))
        except Exception as error:
            results.append(failure(operation, error))

    print(json.dumps({"results": results}, indent=2))


def create_client(surface: str) -> Any:
    if surface == "mailbox":
        from sendmux_mailbox.client import create_mailbox_client

        return create_mailbox_client(api_key=mailbox_api_key(), base_url=app_base_url())
    if surface == "management":
        from sendmux_management.client import create_management_client

        return create_management_client(api_key=root_api_key(), base_url=app_base_url())
    if surface == "sending":
        from sendmux_sending.client import create_sending_client

        return create_sending_client(api_key=mailbox_api_key(), base_url=sending_base_url())
    raise ValueError(f"Unknown surface: {surface}")


def discover_api_objects(surface: str, api_client: Any) -> list[Any]:
    package_name = f"sendmux_{surface}.api"
    package = importlib.import_module(package_name)
    out: list[Any] = []
    for module_info in pkgutil.iter_modules(package.__path__, package_name + "."):
        module = importlib.import_module(module_info.name)
        for value in vars(module).values():
            if inspect.isclass(value) and value.__name__.endswith("Api"):
                out.append(value(api_client))
    return out


def call_operation(api_objects: list[Any], operation: dict[str, Any]) -> Any:
    method_name = snake_case(operation["operationId"])
    if operation["operationId"] == "mailboxStreamEvents":
        method_name = f"{method_name}_without_preload_content"
    if operation["operationId"] == "mailboxGetMessageAttachment" or operation.get("responseKind") == "binary":
        method_name = f"{method_name}_without_preload_content"
    if operation["operationId"] == "mailboxGetChanges":
        method_name = f"{method_name}_without_preload_content"
    for api in api_objects:
        method = getattr(api, method_name, None)
        if callable(method):
            kwargs = kwargs_for(method, operation)
            value = method(**kwargs)
            if operation["operationId"] == "mailboxStreamEvents":
                return first_sse_event(value)
            if operation["operationId"] == "mailboxGetMessageAttachment" or operation.get("responseKind") == "binary":
                return raw_binary_response(value)
            if operation["operationId"] == "mailboxGetChanges":
                return raw_json_response(value)
            return normalise(value)
    raise ValueError(f"Python SDK operation {operation['operationId']} is not exported")


def kwargs_for(method: Any, operation: dict[str, Any]) -> dict[str, Any]:
    request = operation.get("request") or {}
    kwargs: dict[str, Any] = {}
    for source in ("path", "query"):
        for key, value in (request.get(source) or {}).items():
            kwargs[key] = value
    for key, value in (request.get("headers") or {}).items():
        kwargs[snake_case(key)] = value

    body = request.get("body")
    if body is not None:
        if operation.get("bodyKind") == "binary":
            kwargs["body"] = str(body).encode("utf-8")
        else:
            body_param = first_body_param(method, set(kwargs))
            if body_param:
                kwargs[body_param] = body
    return kwargs


def first_body_param(method: Any, existing: set[str]) -> str | None:
    for name in inspect.signature(method).parameters:
        if name.startswith("_") or name in {"self", *existing}:
            continue
        if name == "body" or name.endswith("_body") or name.endswith("_request"):
            return name
    for name in inspect.signature(method).parameters:
        if name.startswith("_") or name in {"self", *existing}:
            continue
        return name
    return None


def first_sse_event(response: Any) -> dict[str, Any]:
    chunk = response.read(4096, decode_content=True)
    text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
    for block in text.replace("\r\n", "\n").split("\n\n"):
        lines = [line for line in block.split("\n") if line.startswith("data:")]
        if not lines:
            continue
        raw = "\n".join(line.split(":", 1)[1].strip() for line in lines)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"text": raw}
    raise AssertionError("mailboxStreamEvents did not yield an SSE data event")


def raw_json_response(response: Any) -> dict[str, Any]:
    chunk = response.read(decode_content=True)
    text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
    decoded = json.loads(text)
    if not isinstance(decoded, dict):
        raise AssertionError("raw JSON response was not an object")
    return decoded


def raw_binary_response(response: Any) -> bytes:
    chunk = response.read(decode_content=True)
    if isinstance(chunk, bytes):
        return chunk
    return str(chunk).encode("utf-8")


def assert_response(operation: dict[str, Any], value: Any) -> None:
    operation_id = operation["operationId"]
    if operation_id == "mailboxStreamEvents":
        event_type = value.get("event_type") or value.get("event")
        if event_type not in {"message.received", "message.received.spam", "sync_required"}:
            raise AssertionError("mailboxStreamEvents did not return a mailbox realtime event")
        return
    if operation.get("responseKind") == "binary" or operation_id == "mailboxGetMessageAttachment":
        if isinstance(value, (bytes, bytearray)) and len(value) > 0:
            return
        if isinstance(value, str) and value:
            return
        raise AssertionError(f"{operation_id} did not return binary content")
    if operation.get("responseKind") == "text":
        if not isinstance(value, str) or not value:
            raise AssertionError(f"{operation_id} did not return text")
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


def cleanup_entry(entry: dict[str, Any], operation: dict[str, Any], value: Any) -> dict[str, Any]:
    selectors = operation.get("cleanupSelectors") or []
    cleanup: dict[str, Any] = {}
    for selector in selectors:
        selected = value_at_path(value, selector)
        if selected is not None:
            set_value_at_path(cleanup, selector, selected)
    if cleanup:
        entry["cleanup"] = cleanup
    return entry


def normalise(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, str)):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if hasattr(value, "data"):
        return normalise(value.data)
    return value


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


def snake_case(value: str) -> str:
    return re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", value.replace("-", "_")).lower()


def app_base_url() -> str:
    return os.environ.get("SENDMUX_LIVE_E2E_APP_BASE_URL") or os.environ.get("SENDMUX_STAGING_APP_BASE_URL") or "https://app.sendmux.ai/api/v1"


def sending_base_url() -> str:
    return os.environ.get("SENDMUX_LIVE_E2E_SENDING_BASE_URL") or os.environ.get("SENDMUX_STAGING_SMTP_BASE_URL") or "https://smtp.sendmux.ai/api/v1"


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


def failure(operation: dict[str, Any], error: Exception) -> dict[str, Any]:
    return {
        "adapter": "python",
        "error": str(error),
        "operationId": operation["operationId"],
        "status": "failed",
    }


if __name__ == "__main__":
    main()
