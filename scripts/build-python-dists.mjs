import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const python = join(root, ".tmp", "python-venv", "bin", "python");
const distDir = join(root, ".tmp", "python-dist");
const packages = ["core", "sending", "mailbox", "management", "sdk"];

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });

run("node", ["scripts/check-python.mjs"]);

for (const packageName of packages) {
  run(python, ["-m", "build", "--outdir", distDir, join("packages", "python", packageName)]);
}

run(python, ["-m", "twine", "check", `${distDir}/*`], { shell: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

