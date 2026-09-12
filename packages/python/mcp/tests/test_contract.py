from __future__ import annotations

import json
import asyncio
import base64
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from importlib.metadata import distribution, version

import pytest

from sendmux_mcp.contract import build_contract


PACKAGE_DIR = Path(__file__).resolve().parents[1]
CONTRACT_PATH = PACKAGE_DIR / "sendmux_mcp" / "mcp-contract.json"


def test_checked_in_contract_matches_the_public_mcp_factory() -> None:
    """A changed tool, endpoint, protocol, or upload limit must stale the shipped contract."""
    assert json.loads(CONTRACT_PATH.read_text()) == build_contract()


def test_contract_counts_match_combined_public_discovery() -> None:
    from fastmcp import Client
    from sendmux_mcp.config import SURFACES, ServerConfig
    from sendmux_mcp.contract import NoUpstreamTransport
    from sendmux_mcp.server import create_server

    async def discover() -> list[str]:
        server = create_server(ServerConfig(surfaces=SURFACES, api_keys={"mailbox": "smx_mbx_fixture", "management": "smx_root_fixture", "sending": "smx_mbx_fixture"}), transport=NoUpstreamTransport())
        async with Client(server) as client:
            return sorted(tool.name for tool in await client.list_tools())

    names = asyncio.run(discover())
    contract = build_contract()
    assert contract["tools"]["count"] == len(names)
    assert sorted(tool["name"] for tools in contract["tools"]["by_surface"].values() for tool in tools) == names


def test_contract_binds_packaged_sources_and_distinguishes_api_origins() -> None:
    contract = build_contract()
    sources = contract["provenance"]["sources"]
    for relative in ("server.py", "curation.py", "config.py", "hosted.py", "hosted_auth.py", "openapi/openapi-app.json", "openapi/openapi-sending.json"):
        assert sources[relative] == hashlib.sha256((PACKAGE_DIR / "sendmux_mcp" / relative).read_bytes()).hexdigest()
    from sendmux_mcp.config import DEFAULT_APP_BASE_URL, DEFAULT_SENDING_BASE_URL
    assert contract["api_origins"] == {"app": DEFAULT_APP_BASE_URL, "sending": DEFAULT_SENDING_BASE_URL}
    assert contract["hosted"]["resource"] not in contract["api_origins"].values()


def test_hosted_transport_and_frozen_protocols_match_runtime() -> None:
    from mcp.types.version import HANDSHAKE_PROTOCOL_VERSIONS, MODERN_PROTOCOL_VERSIONS
    from sendmux_mcp.config import ServerConfig, Transport
    from typing import get_args

    contract = build_contract()
    assert contract["hosted"]["transports"] == ["streamable-http"]
    assert contract["local"]["transports"] == list(get_args(Transport))
    assert contract["local"]["default_transport"] == ServerConfig().transport
    assert contract["runtime_protocols"] == sorted(set(HANDSHAKE_PROTOCOL_VERSIONS) | set(MODERN_PROTOCOL_VERSIONS))
    assert set(contract["protocols"]) <= set(contract["runtime_protocols"])


def test_upload_contract_distinguishes_enforced_limits_from_upstream_reference() -> None:
    from fastmcp import Client
    from sendmux_mcp.config import ServerConfig
    from sendmux_mcp.contract import NoUpstreamTransport
    from sendmux_mcp.server import create_server

    contract = build_contract()
    uploads = contract["uploads"]
    assert uploads["mailbox"]["request_schema_max_bytes"] == uploads["mailbox"]["presigned_max_bytes"]
    assert uploads["sending"]["request_schema_max_bytes"] is None
    assert uploads["sending"]["limit_authority"] == "upload intent response max_size_bytes"
    assert "reference_max_bytes" not in uploads["sending"]
    assert "presigned_max_bytes" not in uploads["sending"], "Unused server constant must not certify an enforced upstream cap"

    async def check() -> None:
        for surface in ("mailbox", "sending"):
            server = create_server(ServerConfig(surfaces=(surface,), api_key="smx_mbx_fixture"), transport=NoUpstreamTransport())
            async with Client(server) as client:
                result = await client.call_tool(uploads[surface]["tool"], {"filename": "too-large.txt", "content_base64": base64.b64encode(b"x" * (uploads["inline_decoded_max_bytes"] + 1)).decode()})
                assert result.structured_content is not None
                assert result.structured_content["ok"] is False
                assert result.structured_content["error"]["code"] == "invalid_parameter"
    asyncio.run(check())


@pytest.mark.parametrize("change", ["compatible_mcp", "unsupported_protocol"])
def test_installed_reader_respects_supported_runtime_range(change: str) -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-runtime-") as temporary:
        root = Path(temporary)
        shutil.copytree(PACKAGE_DIR / "sendmux_mcp", root / "sendmux_mcp")
        if change == "compatible_mcp":
            native = distribution("mcp")
            assert native.files is not None
            metadata_path = next(path for path in native.files if str(path).endswith(".dist-info/METADATA"))
            target = root / metadata_path
            target.parent.mkdir()
            current = version("mcp")
            parts = current.split(".")
            compatible = ".".join([*parts[:2], str(int(parts[2]) + 1)])
            target.write_text(native.locate_file(metadata_path).read_text().replace(f"Version: {current}\n", f"Version: {compatible}\n"))
        else:
            artifact = root / "sendmux_mcp/mcp-contract.json"
            contract = json.loads(artifact.read_text())
            contract["protocols"].append("1900-01-01")
            artifact.write_text(json.dumps(contract))
        child = subprocess.Popen([sys.executable, "-c", "from sendmux_mcp.contract import load_contract; load_contract()"], cwd=root, env={**os.environ, "PYTHONPATH": str(root)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"runtime reader child {child.pid}, fixture {root}")
        try:
            stdout, stderr = child.communicate(timeout=45)
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate(timeout=5)
        with pytest.raises(ProcessLookupError):
            os.kill(child.pid, 0)
        if change == "compatible_mcp":
            assert child.returncode == 0, stderr
        else:
            assert child.returncode != 0, "Unimplemented protocol was accepted as certified"
    assert not root.exists()
    print(f"runtime reader child {child.pid} ESRCH; fixture {root} absent")


@pytest.mark.parametrize("drift", ["source", "native_version", "dependency_version", "missing_source"])
def test_installed_reader_rejects_stale_provenance(drift: str) -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-reader-") as temporary:
        root = Path(temporary)
        shutil.copytree(PACKAGE_DIR / "sendmux_mcp", root / "sendmux_mcp")
        artifact = root / "sendmux_mcp/mcp-contract.json"
        contract = json.loads(artifact.read_text())
        if drift == "source":
            with (root / "sendmux_mcp/curation.py").open("a") as source:
                source.write("\n# fixture source drift\n")
        elif drift == "native_version":
            contract["package"]["version"] = "0.0.0"
        elif drift == "dependency_version":
            contract["provenance"]["runtime"]["fastmcp"] = "0.0.0"
        else:
            del contract["provenance"]["sources"]["server.py"]
        artifact.write_text(json.dumps(contract))
        child = subprocess.Popen([sys.executable, "-c", "from sendmux_mcp.contract import load_contract; load_contract()"], cwd=root, env={**os.environ, "PYTHONPATH": str(root)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"reader child {child.pid}, fixture {root}")
        try:
            stdout, stderr = child.communicate(timeout=45)
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate(timeout=5)
        with pytest.raises(ProcessLookupError):
            os.kill(child.pid, 0)
        assert child.returncode != 0
        assert b"stale" in stderr, stderr
    assert not root.exists()
    print(f"reader child {child.pid} ESRCH; fixture {root} absent")


@pytest.mark.parametrize("fact", ["tools", "version", "resource", "protocols", "uploads"])
def test_contract_check_rejects_public_fact_drift_without_rewriting(fact: str) -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-") as temporary:
        root = Path(temporary)
        package = root / "packages/python/mcp"
        shutil.copytree(PACKAGE_DIR, package, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
        (root / "scripts").mkdir()
        shutil.copyfile(PACKAGE_DIR.parents[2] / "scripts/mcp-conformance-required-checks.json", root / "scripts/mcp-conformance-required-checks.json")
        artifact = package / "sendmux_mcp/mcp-contract.json"
        contract = json.loads(artifact.read_text())
        if fact == "tools":
            contract["tools"]["count"] += 1
        elif fact == "version":
            contract["package"]["version"] = "0.0.0"
        elif fact == "resource":
            contract["hosted"]["resource"] = "https://wrong.invalid/mcp"
        elif fact == "protocols":
            contract["protocols"] = ["1900-01-01"]
        else:
            contract["uploads"]["inline_decoded_max_bytes"] += 1
        artifact.write_text(json.dumps(contract))
        before = artifact.read_bytes()
        child = subprocess.Popen([sys.executable, "-m", "sendmux_mcp.contract", "--check"], cwd=root, env={**os.environ, "PYTHONPATH": str(package)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"contract check child PID {child.pid}")
        try:
            stdout, stderr = child.communicate(timeout=45)
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate(timeout=5)
        with pytest.raises(ProcessLookupError):
            os.kill(child.pid, 0)
        assert child.returncode != 0, f"{fact} drift was accepted: {stdout!r} {stderr!r}"
        assert artifact.read_bytes() == before, "Check mode rewrote the stale evidence"
    assert not root.exists()
    print(f"contract fixture {root} absent; child {child.pid} ESRCH")


@pytest.mark.parametrize("change", ["inline_mode", "presign_mode", "returned_limit", "native_version"])
def test_generator_rejects_incompatible_source_contract_without_overwriting(change: str) -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-source-") as temporary:
        root = Path(temporary)
        package = root / "packages/python/mcp"
        shutil.copytree(PACKAGE_DIR, package, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
        (root / "scripts").mkdir()
        shutil.copyfile(PACKAGE_DIR.parents[2] / "scripts/mcp-conformance-required-checks.json", root / "scripts/mcp-conformance-required-checks.json")
        artifact = package / "sendmux_mcp/mcp-contract.json"
        before = artifact.read_bytes()
        if change == "returned_limit":
            source = package / "sendmux_mcp/openapi/openapi-sending.json"
            source.write_text(source.read_text().replace('"max_size_bytes"', '"renamed_max_bytes"'))
        elif change == "native_version":
            source = package / "pyproject.toml"
            current = json.loads(before)["package"]["version"]
            source.write_text(source.read_text().replace(f'version = "{current}"', 'version = "99.0.0"'))
        else:
            source = package / "sendmux_mcp/server.py"
            original = "content_base64" if change == "inline_mode" else "presign_upload_url"
            source.write_text(source.read_text().replace(original, "renamed_input"))
        child = subprocess.Popen([sys.executable, "-m", "sendmux_mcp.contract"], cwd=root, env={**os.environ, "PYTHONPATH": str(package)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"source generator child {child.pid}, fixture {root}", flush=True)
        try:
            stdout, stderr = child.communicate(timeout=45)
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate(timeout=5)
        with pytest.raises(ProcessLookupError):
            os.kill(child.pid, 0)
        assert child.returncode != 0, f"Incompatible {change} silently generated false workflow facts"
        assert artifact.read_bytes() == before
    assert not root.exists()
    print(f"source generator child {child.pid} ESRCH; fixture {root} absent")
