from __future__ import annotations

import json
import os
import re
import signal
from collections.abc import Iterator
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[4]
PACKAGE = ROOT / "packages/python/mcp"


def run_child(args: list[str], cwd: Path, *, timeout: int = 120) -> subprocess.CompletedProcess[bytes]:
    child = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    print(f"packaging child {child.pid}, cwd {cwd}", flush=True)
    try:
        stdout, stderr = child.communicate(timeout=timeout)
    finally:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.communicate(timeout=5)
    with pytest.raises(ProcessLookupError):
        os.kill(child.pid, 0)
    print(f"packaging child {child.pid} ESRCH", flush=True)
    for line in stdout.decode().splitlines():
        if line.startswith(("Artifact check child ", "Installed fixture ", "Contract generation child ")):
            print(line, flush=True)
    with pytest.raises(ProcessLookupError):
        os.killpg(child.pid, 0)
    for match in re.finditer(rb"Contract generation child (\d+)", stdout):
        pid = int(match[1])
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
        print(f"Contract generation child {pid} ESRCH", flush=True)
    return subprocess.CompletedProcess(args, child.returncode, stdout, stderr)


@pytest.fixture(scope="module")
def distributions() -> Iterator[Path]:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-dists-") as temporary:
        directory = Path(temporary)
        result = run_child([sys.executable, "-m", "build", "--outdir", str(directory), str(PACKAGE)], ROOT)
        assert result.returncode == 0, result.stderr.decode()
        yield directory
    assert not directory.exists()
    print(f"distribution fixture {directory} absent")


@pytest.mark.parametrize("artifact", ["wheel", "sdist"])
def test_package_check_rejects_missing_contract(distributions: Path, artifact: str) -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-artifact-") as temporary:
        directory = Path(temporary)
        for original in distributions.iterdir():
            destination = directory / original.name
            if artifact == "wheel" and original.suffix == ".whl":
                with zipfile.ZipFile(original) as source, zipfile.ZipFile(destination, "w") as output:
                    for member in source.infolist():
                        if not member.filename.endswith("/mcp-contract.json"):
                            output.writestr(member, source.read(member))
            elif artifact == "sdist" and original.name.endswith(".tar.gz"):
                with tarfile.open(original) as tar_source, tarfile.open(destination, "w:gz") as tar_output:
                    for tar_member in tar_source.getmembers():
                        if not tar_member.name.endswith("/mcp-contract.json"):
                            tar_output.addfile(tar_member, tar_source.extractfile(tar_member) if tar_member.isfile() else None)
            else:
                shutil.copyfile(original, destination)
        result = run_child([sys.executable, str(ROOT / "scripts/check-mcp-artifacts.py"), str(directory)], directory)
        assert result.returncode != 0
        assert b"Missing package files" in result.stderr, result.stderr.decode()
    assert not directory.exists()
    print(f"corrupted artifact fixture {directory} absent")


def test_package_check_reads_installed_wheel_outside_repository(distributions: Path) -> None:
    result = run_child([sys.executable, str(ROOT / "scripts/check-mcp-artifacts.py"), str(distributions)], distributions)
    assert result.returncode == 0, result.stderr.decode()
    assert b"Installed contract verified" in result.stdout
    print(result.stdout.decode())


@pytest.mark.parametrize("artifact", ["wheel", "sdist"])
@pytest.mark.parametrize("drift", ["native_version", "source", "contract"])
def test_package_check_rejects_corrupt_native_or_source_evidence(distributions: Path, artifact: str, drift: str) -> None:
    expected = {
        "native_version": b"differs from native distribution metadata",
        "source": b"Packaged source differs from contract source",
        "contract": b"Packaged MCP contract differs from checked-in factory evidence",
    }[drift]

    def mutate(name: str, content: bytes) -> bytes:
        if drift == "native_version" and (name.endswith(".dist-info/METADATA") or name.endswith("/PKG-INFO")):
            current = json.loads((PACKAGE / "sendmux_mcp/mcp-contract.json").read_text())["package"]["version"]
            return content.replace(f"Version: {current}\n".encode(), b"Version: 0.0.0\n")
        if drift == "source" and name.endswith("/curation.py"):
            return content + b"\n# changed package source\n"
        if drift == "contract" and name.endswith("/mcp-contract.json"):
            contract = json.loads(content)
            contract["tools"]["count"] += 1
            return json.dumps(contract).encode()
        return content

    with tempfile.TemporaryDirectory(prefix="sendmux-contract-corrupt-") as temporary:
        directory = Path(temporary)
        for original in distributions.iterdir():
            destination = directory / original.name
            if artifact == "wheel" and original.suffix == ".whl":
                with zipfile.ZipFile(original) as source, zipfile.ZipFile(destination, "w") as output:
                    for member in source.infolist():
                        output.writestr(member, mutate(member.filename, source.read(member)))
            elif artifact == "sdist" and original.name.endswith(".tar.gz"):
                import io
                with tarfile.open(original) as tar_source, tarfile.open(destination, "w:gz") as tar_output:
                    for tar_member in tar_source.getmembers():
                        if tar_member.isfile():
                            source_file = tar_source.extractfile(tar_member)
                            assert source_file is not None
                            content = mutate(tar_member.name, source_file.read())
                            tar_member.size = len(content)
                            tar_output.addfile(tar_member, io.BytesIO(content))
                        else:
                            tar_output.addfile(tar_member)
            else:
                shutil.copyfile(original, destination)
        result = run_child([sys.executable, str(ROOT / "scripts/check-mcp-artifacts.py"), str(directory)], directory)
        assert result.returncode != 0, f"{artifact} {drift} corruption was accepted"
        assert expected in result.stderr, result.stderr.decode()
    assert not directory.exists()
    print(f"corruption fixture {directory} absent")


def test_generator_bootstraps_clean_environment_and_refreshes_future_version() -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-bootstrap-") as temporary:
        root = Path(temporary)
        for package in ("core", "mcp"):
            shutil.copytree(ROOT / "packages/python" / package, root / "packages/python" / package, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
        (root / "scripts").mkdir()
        shutil.copyfile(ROOT / "scripts/mcp-conformance-required-checks.json", root / "scripts/mcp-conformance-required-checks.json")
        shutil.copyfile(ROOT / "requirements-dev.txt", root / "requirements-dev.txt")
        project = root / "packages/python/mcp/pyproject.toml"
        original_version = json.loads((PACKAGE / "sendmux_mcp/mcp-contract.json").read_text())["package"]["version"]
        project.write_text(project.read_text().replace(f'version = "{original_version}"', 'version = "99.0.0"'))
        result = run_child(["node", str(ROOT / "scripts/generate-mcp-contract.mjs")], root, timeout=180)
        assert result.returncode == 0, result.stderr.decode()
        contract = root / "packages/python/mcp/sendmux_mcp/mcp-contract.json"
        assert json.loads(contract.read_text())["package"]["version"] == "99.0.0"
        project.write_text(project.read_text().replace('version = "99.0.0"', 'version = "99.0.1"'))
        result = run_child(["node", str(ROOT / "scripts/generate-mcp-contract.mjs")], root, timeout=180)
        assert result.returncode == 0, result.stderr.decode()
        assert json.loads(contract.read_text())["package"]["version"] == "99.0.1"
    assert not root.exists()
    print(f"bootstrap fixture {root} absent")


def test_generator_propagates_child_failure() -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-command-error-") as temporary:
        root = Path(temporary)
        python = root / ".tmp/python-venv/bin/python"
        python.parent.mkdir(parents=True)
        python.write_text(f"#!{sys.executable}\nraise SystemExit(17)\n")
        python.chmod(0o755)
        result = run_child(["node", str(ROOT / "scripts/generate-mcp-contract.mjs")], root)
        assert result.returncode != 0, "Generator reported success after its Python child failed"
        assert b"exit code 17" in result.stderr
    assert not root.exists()
    print(f"command failure fixture {root} absent")


def test_generator_timeout_stops_owned_process_group() -> None:
    with tempfile.TemporaryDirectory(prefix="sendmux-contract-command-timeout-") as temporary:
        root = Path(temporary)
        python = root / ".tmp/python-venv/bin/python"
        python.parent.mkdir(parents=True)
        receipt = root / "children.json"
        python.write_text(f"#!{sys.executable}\nimport json, os, subprocess, sys, time\nfrom pathlib import Path\nchild = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\nPath({str(receipt)!r}).write_text(json.dumps([os.getpid(), child.pid]))\ntime.sleep(120)\n")
        python.chmod(0o755)
        owned: list[int] = []
        try:
            with pytest.raises(subprocess.TimeoutExpired):
                run_child(["node", str(ROOT / "scripts/generate-mcp-contract.mjs")], root, timeout=2)
            owned = json.loads(receipt.read_text())
            for pid in owned:
                print(f"timeout owned child {pid}", flush=True)
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    try:
                        os.kill(pid, 0)
                    except ProcessLookupError:
                        break
                    time.sleep(0.01)
                with pytest.raises(ProcessLookupError):
                    os.kill(pid, 0)
                print(f"timeout owned child {pid} ESRCH", flush=True)
        finally:
            if receipt.exists():
                for pid in json.loads(receipt.read_text()):
                    print(f"recovery owned child {pid}", flush=True)
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    deadline = time.monotonic() + 2
                    while time.monotonic() < deadline:
                        try:
                            os.kill(pid, 0)
                        except ProcessLookupError:
                            break
                        time.sleep(0.01)
                    with pytest.raises(ProcessLookupError):
                        os.kill(pid, 0)
                    print(f"recovery owned child {pid} ESRCH", flush=True)
    assert not root.exists()
    print(f"timeout fixture {root} absent")
