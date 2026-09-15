"""Check built MCP distributions and read the installed wheel outside the checkout."""
from __future__ import annotations

from email.parser import BytesParser
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "packages/python/mcp/sendmux_mcp/mcp-contract.json"
REQUIRED = {
    "sendmux_mcp/openapi/openapi-app.json",
    "sendmux_mcp/openapi/openapi-sending.json",
    "sendmux_mcp/py.typed",
    "sendmux_mcp/mcp-contract.json",
}


def check_members(members: dict[str, bytes], metadata: bytes) -> None:
    missing = REQUIRED - members.keys()
    if missing:
        raise ValueError(f"Missing package files: {sorted(missing)}")
    contract_bytes = members["sendmux_mcp/mcp-contract.json"]
    if contract_bytes != CONTRACT.read_bytes():
        raise ValueError("Packaged MCP contract differs from checked-in factory evidence")
    contract = json.loads(contract_bytes)
    native = BytesParser().parsebytes(metadata)
    if native["Name"] != contract["package"]["identity"] or native["Version"] != contract["package"]["version"]:
        raise ValueError("Packaged MCP contract version/identity differs from native distribution metadata")
    package = CONTRACT.parent
    for relative in contract["provenance"]["sources"]:
        if members.get(f"sendmux_mcp/{relative}") != (package / relative).read_bytes():
            raise ValueError(f"Packaged source differs from contract source: {relative}")


def run(args: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    child = subprocess.Popen(args, cwd=cwd, env=env)
    print(f"Artifact check child {child.pid}, cwd {cwd}", flush=True)
    try:
        status = child.wait(timeout=60)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)
    try:
        os.kill(child.pid, 0)
    except ProcessLookupError:
        print(f"Artifact check child {child.pid} ESRCH", flush=True)
    else:
        raise RuntimeError(f"Artifact check child {child.pid} remains alive")
    if status != 0:
        raise RuntimeError(f"Installed consumer failed with status {status}")


def check_distributions(directory: Path) -> None:
    wheels = list(directory.glob("sendmux_mcp-*.whl"))
    sdists = list(directory.glob("sendmux_mcp-*.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1:
        raise ValueError("Expected exactly one MCP wheel and sdist")
    with zipfile.ZipFile(wheels[0]) as wheel:
        members = {name: wheel.read(name) for name in wheel.namelist()}
        metadata = next(content for name, content in members.items() if name.endswith(".dist-info/METADATA"))
        check_members(members, metadata)
    with tarfile.open(sdists[0]) as sdist:
        members = {}
        for member in sdist.getmembers():
            if not member.isfile():
                continue
            content = sdist.extractfile(member)
            assert content is not None
            members[member.name.split("/", 1)[1]] = content.read()
        check_members(members, members["PKG-INFO"])
    with tempfile.TemporaryDirectory(prefix="sendmux-mcp-installed-") as temporary:
        target = Path(temporary)
        run([sys.executable, "-m", "pip", "install", "--no-deps", "--no-compile", "--target", str(target), str(wheels[0])], target)
        run([sys.executable, "-c", "\n".join([
            "from importlib.metadata import distribution",
            "from pathlib import Path",
            "import sendmux_mcp.contract as contract",
            "root = Path.cwd()",
            "assert Path(contract.__file__).resolve().is_relative_to(root)",
            "assert Path(distribution('sendmux-mcp').locate_file('')).resolve() == root",
            "value = contract.load_contract()",
            "assert value['package']['version'] == distribution('sendmux-mcp').version",
            "print('Installed contract verified: ' + value['package']['identity'] + ' ' + value['package']['version'])",
        ])], target, {**os.environ, "PYTHONPATH": str(target)})
    if target.exists():
        raise RuntimeError(f"Installed fixture remains: {target}")
    print(f"Installed fixture {target} absent")


if __name__ == "__main__":
    check_distributions(Path(sys.argv[1]).resolve())
