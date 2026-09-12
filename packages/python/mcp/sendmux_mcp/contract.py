from __future__ import annotations

import asyncio
import argparse
import json
import hashlib
from importlib.metadata import metadata, version
from pathlib import Path
from typing import Any, get_args

import httpx
from fastmcp import Client
from mcp.types.version import HANDSHAKE_PROTOCOL_VERSIONS, MODERN_PROTOCOL_VERSIONS

from sendmux_mcp.config import DEFAULT_APP_BASE_URL, DEFAULT_SENDING_BASE_URL, SURFACES, ServerConfig, Transport
from sendmux_mcp.hosted import DEFAULT_MCP_PATH, DEFAULT_MCP_RESOURCE_BASE_URL
from sendmux_mcp.hosted_auth import hosted_mcp_resource_url
from sendmux_mcp.server import (
    MCP_ATTACHMENT_FILE_UPLOAD_MAX_BYTES,
    MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BYTES,
    SENDMUX_MCP_VERSION,
    create_server,
)


PACKAGE_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = PACKAGE_DIR.parents[3]
CONTRACT_PATH = PACKAGE_DIR / "mcp-contract.json"


class NoUpstreamTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"Contract generation must not call upstream: {request.method} {request.url}")


async def collect_tools() -> dict[str, list[dict[str, Any]]]:
    tools_by_surface: dict[str, list[dict[str, Any]]] = {}
    for surface in SURFACES:
        api_key = "smx_root_contract" if surface == "management" else "smx_mbx_contract"
        server = create_server(
            ServerConfig(surfaces=(surface,), api_key=api_key),
            transport=NoUpstreamTransport(),
        )
        async with Client(server) as client:
            tools = await client.list_tools()
        tools_by_surface[surface] = [
            {
                "annotations": tool.annotations.model_dump(exclude_none=True) if tool.annotations else None,
                "description": tool.description,
                "input_schema": tool.input_schema,
                "name": tool.name,
                "output_schema": tool.output_schema,
                "title": tool.title,
            }
            for tool in sorted(tools, key=lambda tool: tool.name)
        ]
    return tools_by_surface


def build_contract() -> dict[str, Any]:
    project_version = read_project_version()
    if SENDMUX_MCP_VERSION != project_version:
        raise RuntimeError(
            "sendmux-mcp installed distribution version "
            f"{SENDMUX_MCP_VERSION} does not match pyproject.toml {project_version}; refresh the editable install."
        )
    tools_by_surface = asyncio.run(collect_tools())
    tool_index = {tool["name"]: tool for tools in tools_by_surface.values() for tool in tools}
    mailbox_upload = tool_index["mailbox_upload_attachment"]
    sending_upload = tool_index["sending_upload_attachment"]
    sending_presign = tool_index["sending_create_attachment_upload"]

    for tool in (mailbox_upload, sending_upload, sending_presign):
        if "file_path" in (tool["input_schema"] or {}).get("properties", {}):
            raise ValueError(f"{tool['name']} must not expose file_path")
    for tool, properties in (
        (mailbox_upload, {"content_base64", "presign_upload_url", "size_bytes"}),
        (sending_upload, {"content_base64"}),
        (sending_presign, {"size_bytes"}),
    ):
        if not properties <= tool["input_schema"]["properties"].keys():
            raise ValueError(f"{tool['name']} attachment workflow inputs changed; review the contract")
    sending_result = sending_presign["output_schema"]["properties"]["result"]
    sending_data = next(part["properties"]["data"] for part in sending_result["allOf"] if "data" in part.get("properties", {}))
    if sending_data["properties"]["max_size_bytes"]["type"] != "integer":
        raise ValueError("Sending upload intent must declare its returned byte limit")

    protocols = sorted(
        json.loads((REPOSITORY_ROOT / "scripts" / "mcp-conformance-required-checks.json").read_text())["revisions"]
    )
    runtime_protocols = sorted(set(HANDSHAKE_PROTOCOL_VERSIONS) | set(MODERN_PROTOCOL_VERSIONS))
    if not set(protocols) <= set(runtime_protocols):
        raise ValueError("Certified protocols are not supported by the installed MCP runtime")
    return normalise(
        {
            "package": {"identity": metadata("sendmux-mcp")["Name"], "version": project_version},
            "provenance": {
                "sources": source_hashes(),
                "build_inputs": {
                    "pyproject.toml": hashlib.sha256((PACKAGE_DIR.parent / "pyproject.toml").read_bytes()).hexdigest(),
                    "scripts/mcp-conformance-required-checks.json": hashlib.sha256((REPOSITORY_ROOT / "scripts/mcp-conformance-required-checks.json").read_bytes()).hexdigest(),
                },
                "runtime": {name: version(name) for name in ("fastmcp", "mcp")},
                "certified_protocols": "scripts/mcp-conformance-required-checks.json",
                "factory": "sendmux_mcp.server.create_server",
                "hosted_resource": "sendmux_mcp.hosted.DEFAULT_MCP_RESOURCE_BASE_URL + DEFAULT_MCP_PATH",
                "tool_discovery": "fastmcp.Client.list_tools input_schema",
            },
            "hosted": {
                "resource": hosted_mcp_resource_url(DEFAULT_MCP_RESOURCE_BASE_URL, DEFAULT_MCP_PATH),
                "transports": ["streamable-http"],
            },
            "local": {"transports": list(get_args(Transport)), "default_transport": ServerConfig().transport},
            "api_origins": {"app": DEFAULT_APP_BASE_URL, "sending": DEFAULT_SENDING_BASE_URL},
            "protocols": protocols,
            "runtime_protocols": runtime_protocols,
            "tools": {
                "by_surface": tools_by_surface,
                "count": sum(len(tools) for tools in tools_by_surface.values()),
            },
            "uploads": {
                "inline_decoded_max_bytes": MCP_ATTACHMENT_INLINE_UPLOAD_MAX_BYTES,
                "mailbox": {
                    "inline_property": "content_base64",
                    "modes": [name for name in mailbox_upload["input_schema"]["properties"] if name in {"content_base64", "presign_upload_url"}],
                    "presigned_max_bytes": MCP_ATTACHMENT_FILE_UPLOAD_MAX_BYTES,
                    "request_schema_max_bytes": schema_maximum(mailbox_upload["input_schema"]["properties"]["size_bytes"]),
                    "tool": mailbox_upload["name"],
                },
                "sending": {
                    "inline_property": "content_base64",
                    "request_schema_max_bytes": schema_maximum(sending_presign["input_schema"]["properties"]["size_bytes"]),
                    "limit_authority": "upload intent response max_size_bytes",
                    "presigned_tool": sending_presign["name"],
                    "tool": sending_upload["name"],
                },
            },
        }
    )


def write_contract() -> None:
    CONTRACT_PATH.write_text(f"{json.dumps(build_contract(), indent=2, sort_keys=True)}\n")


def schema_maximum(schema: dict[str, Any]) -> int | None:
    if "maximum" in schema:
        return int(schema["maximum"])
    for variant in schema.get("anyOf", []):
        maximum = schema_maximum(variant)
        if maximum is not None:
            return maximum
    return None


def source_hashes() -> dict[str, str]:
    return {
        path.relative_to(PACKAGE_DIR).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(PACKAGE_DIR.rglob("*"))
        if path.is_file() and (path.suffix == ".py" or path.parent == PACKAGE_DIR / "openapi")
    }


def load_contract() -> dict[str, Any]:
    """Read the shipped contract, rejecting stale package, source or runtime metadata."""
    contract: dict[str, Any] = json.loads(CONTRACT_PATH.read_text())
    if (
        contract.get("package") != {"identity": metadata("sendmux-mcp")["Name"], "version": SENDMUX_MCP_VERSION}
        or contract.get("provenance", {}).get("sources") != source_hashes()
        or contract.get("provenance", {}).get("runtime", {}).get("fastmcp") != version("fastmcp")
        or not set(contract.get("protocols", [])) <= set(HANDSHAKE_PROTOCOL_VERSIONS) | set(MODERN_PROTOCOL_VERSIONS)
    ):
        raise ValueError("MCP contract is stale for the installed package or runtime")
    return contract


def read_project_version() -> str:
    in_project = False
    for line in (PACKAGE_DIR.parent / "pyproject.toml").read_text().splitlines():
        if line.startswith("["):
            in_project = line == "[project]"
        if in_project and line.startswith('version = "') and line.endswith('"'):
            return line.removeprefix('version = "').removesuffix('"')
    raise RuntimeError("packages/python/mcp/pyproject.toml has no project version")


def normalise(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: normalise(child) for key, child in sorted(value.items())}
    if isinstance(value, list):
        return [normalise(child) for child in value]
    return value


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate or check the package-owned MCP contract")
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    if arguments.check:
        expected = f"{json.dumps(build_contract(), indent=2, sort_keys=True)}\n"
        if CONTRACT_PATH.read_text() != expected:
            raise SystemExit("MCP contract is stale; regenerate it from the package factory")
    else:
        write_contract()
