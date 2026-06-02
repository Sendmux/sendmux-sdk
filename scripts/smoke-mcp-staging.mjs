import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const python = join(root, ".tmp", "python-venv", "bin", "python");

if (!existsSync(python)) {
  throw new Error("Missing .tmp/python-venv. Run `pnpm build:mcp` first.");
}

run("pnpm", ["generate:mcp"]);
run(python, ["-m", "sendmux_mcp.smoke"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
