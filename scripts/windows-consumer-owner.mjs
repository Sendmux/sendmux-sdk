import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function startWindowsConsumer(command, args, options) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-windows-job-"));
  const requestFile = join(directory, "request.json");
  const request = {
    job: `Local\\sendmux-${randomUUID()}`, command, args, cwd: options.cwd,
    node: process.execPath, bridge: fileURLToPath(new URL("./windows-consumer-command.mjs", import.meta.url)),
    stop: join(directory, "stop"), result: join(directory, "result.json"),
  };
  writeFileSync(requestFile, JSON.stringify(request));
  console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid, job: request.job }));
  const powershell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const child = spawn(powershell, ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./windows-consumer-job.ps1", import.meta.url)), "-Request", requestFile], options);
  child.once("error", () => {
    if (!child.pid) { rmSync(directory, { recursive: true }); console.log(JSON.stringify({ removed_workspace: directory })); }
  });
  return {
    child,
    stop() { writeFileSync(request.stop, "stop"); },
    confirm() {
      assert(existsSync(request.result), `Windows Job shutdown unconfirmed; retained ${directory}`);
      const result = JSON.parse(readFileSync(request.result, "utf8"));
      assert.equal(result.job, request.job);
      assert.equal(result.controller, child.pid);
      assert.equal(result.active_processes, 0);
      assert.equal(typeof result.orphan, "boolean");
      assert.equal(typeof result.interrupted, "boolean");
      rmSync(directory, { recursive: true });
      assert(!existsSync(directory));
      console.log(JSON.stringify({ removed_workspace: directory, job_closed: request.job }));
      return result;
    },
  };
}
