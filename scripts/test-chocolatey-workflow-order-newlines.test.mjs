import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { run, workspace } from "./ci-consumers.mjs";

const root = process.cwd();
const checker = join(root, "scripts", "test-chocolatey-workflow-order.mjs");
const workflow = readFileSync(join(root, ".github", "workflows", "chocolatey.yml"), "utf8")
  .replaceAll("\r\n", "\n");

await test("Chocolatey workflow-order checker accepts LF and CRLF workflows", async () => {
  await workspace("chocolatey-workflow-newlines", async (directory) => {
    const workflowPath = join(directory, ".github", "workflows", "chocolatey.yml");
    mkdirSync(join(directory, ".github", "workflows"), { recursive: true });

    for (const [newline, source] of [
      ["LF", workflow],
      ["CRLF", workflow.replaceAll("\n", "\r\n")],
    ]) {
      writeFileSync(workflowPath, source);
      await run(process.execPath, [checker], { cwd: directory });
      console.log(JSON.stringify({ newline, workflow: workflowPath }));
    }
  });
});
