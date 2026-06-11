import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const venv = join(root, ".tmp", "python-venv");
const python = join(venv, "bin", "python");

checkGeneratedMailboxBodyParamOrder();

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
  "packages/python/sending",
  "-e",
  "packages/python/mailbox",
  "-e",
  "packages/python/management",
  "-e",
  "packages/python/sdk",
  "-e",
  "packages/python/mcp",
]);
run(python, ["-m", "compileall", "-q", "packages/python"]);
run(python, ["-m", "mypy", "packages/python"]);
run(python, ["-m", "pytest", "packages/python/tests"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function checkGeneratedMailboxBodyParamOrder() {
  const filePath = join(root, "packages", "python", "mailbox", "sendmux_mailbox", "api", "mailbox_api_api.py");
  const source = readFileSync(filePath, "utf8");
  const operations = [
    {
      method: "mailbox_batch_delete_messages",
      bodyParam: "batch_delete_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_delete_messages_with_http_info",
      bodyParam: "batch_delete_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_delete_messages_without_preload_content",
      bodyParam: "batch_delete_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_update_messages",
      bodyParam: "batch_update_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_update_messages_with_http_info",
      bodyParam: "batch_update_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_update_messages_without_preload_content",
      bodyParam: "batch_update_mailbox_messages_body",
    },
  ];

  for (const operation of operations) {
    assertOrder({
      source,
      filePath,
      anchor: `def ${operation.method}(`,
      first: `${operation.bodyParam}:`,
      second: "mailbox_id:",
    });
  }
}

function assertOrder({ source, filePath, anchor, first, second }) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error(`Missing generated Python method ${anchor} in ${filePath}`);
  }

  const firstIndex = source.indexOf(first, anchorIndex);
  const secondIndex = source.indexOf(second, anchorIndex);
  if (firstIndex === -1 || secondIndex === -1) {
    throw new Error(`Generated Python method ${anchor} is missing ${first} or ${second} in ${filePath}`);
  }
  if (secondIndex < firstIndex) {
    throw new Error(`Generated Python method ${anchor} places ${second} before ${first} in ${filePath}`);
  }
}
