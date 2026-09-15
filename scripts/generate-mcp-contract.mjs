import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const venv = join(root, ".tmp", "python-venv");
const python = join(venv, "bin", "python");

if (!existsSync(python)) {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  await run("python3", ["-m", "venv", venv]);
}

await run(python, ["-m", "pip", "install", "-r", "requirements-dev.txt"]);
await run(python, ["-m", "pip", "install", "-e", "packages/python/core", "-e", "packages/python/mcp"]);
await run(python, ["-m", "sendmux_mcp.contract"]);

async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit" });
  console.log(`Contract generation child ${child.pid} started`);
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  console.log(`Contract generation child ${child.pid} exited ${status}`);
  if (status !== 0) throw new Error(`Contract generation command failed with exit code ${status}`);
}
