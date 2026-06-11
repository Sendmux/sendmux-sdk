import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const venv = join(root, ".tmp", "python-venv");
const python = join(venv, "bin", "python");
const distDir = join(root, ".tmp", "mcp-dist");

if (!existsSync(python)) {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  run("python3", ["-m", "venv", venv]);
}

run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "-r", "requirements-dev.txt"]);
run(python, [
  "-m",
  "pip",
  "install",
  "-e",
  "packages/python/core",
  "-e",
  "packages/python/mcp",
]);
run(python, ["-m", "compileall", "-q", "packages/python/mcp"]);
run(python, ["-m", "mypy", "packages/python/mcp"]);
run(python, ["-m", "pytest", "packages/python/tests/test_mcp.py", "packages/python/mcp/tests"]);
rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });
run(python, ["-m", "build", "--outdir", distDir, "packages/python/mcp"]);
run(python, ["-m", "twine", "check", `${distDir}/*`], { shell: true });
run(python, ["-c", [
  "import pathlib, zipfile",
  "wheel = next(pathlib.Path('.tmp/mcp-dist').glob('sendmux_mcp-*.whl'))",
  "names = set(zipfile.ZipFile(wheel).namelist())",
  "required = {'sendmux_mcp/openapi/openapi-app.json', 'sendmux_mcp/openapi/openapi-sending.json', 'sendmux_mcp/py.typed'}",
  "missing = required - names",
  "import sys",
  "sys.exit(f'Missing package files: {sorted(missing)}') if missing else None",
].join("; ")]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
