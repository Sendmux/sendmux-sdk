import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { run, workspace } from "./ci-consumers.mjs";

assert.equal(process.platform, "win32", "Directory-lock regression requires actual Windows");
const evidence = resolve(process.argv[2] ?? ".tmp/windows-workspace-cleanup");
assert(!existsSync(evidence), "Preserve prior filesystem receipts");
mkdirSync(evidence, { recursive: true });
console.log(JSON.stringify({ owner_pid: process.pid, evidence }));
const powershell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const quoted = (value) => `'${value.replaceAll("'", "''")}'`;
const rows = [];
const save = () => writeFileSync(join(evidence, "results.json"), JSON.stringify(rows, null, 2));
const absent = (pid) => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === "ESRCH") return true; throw error; }
};

for (const mode of ["transient", "persistent"]) {
  const row = { mode, owner_pid: process.pid };
  rows.push(row);
  const ready = join(evidence, `${mode}-ready.json`);
  const release = join(evidence, `${mode}-release`);
  const released = join(evidence, `${mode}-released`);
  let holder;
  let closed;
  let cleanupStarted;
  try {
    let failure;
    try {
      await workspace("windows-locked-workspace", async (directory) => {
        row.directory = directory;
        await run(process.execPath, ["-e", "process.exit(0)"], { cwd: directory });
        row.command_closed = true;
        const source = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DirectoryLock {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr handle);
}
'@
$handle=[DirectoryLock]::CreateFile(${quoted(directory)},128,3,[IntPtr]::Zero,3,0x02000000,[IntPtr]::Zero)
if ($handle -eq [IntPtr](-1)) { throw 'Directory lock acquisition failed' }
try {
    [IO.File]::WriteAllText(${quoted(ready)}, ('{"pid":' + $PID + '}'))
    $limit=[DateTime]::UtcNow.AddSeconds(45)
    while (!(Test-Path -LiteralPath ${quoted(release)})) {
        if ([DateTime]::UtcNow -ge $limit) { throw 'Directory lock release was not requested' }
        Start-Sleep -Milliseconds 10
    }
    ${mode === "transient" ? "Start-Sleep -Milliseconds 200" : ""}
} finally {
    if (![DirectoryLock]::CloseHandle($handle)) { throw 'Directory lock close failed' }
    [IO.File]::WriteAllText(${quoted(released)}, 'closed')
}
`;
        // Independent test-owned lock holder, not an unconfirmed consumer child.
        // It starts no additional fixture descendants and keeps its CWD outside
        // the target; Add-Type compiler subprocesses are not independently tracked.
        holder = spawn(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")], { stdio: "inherit" });
        row.holder_pid = holder.pid;
        console.log(JSON.stringify({ child_pid: holder.pid, command: "owned-directory-lock", directory, mode }));
        closed = new Promise((accept) => {
          holder.once("error", (error) => accept({ error: error.message }));
          holder.once("close", (code) => accept({ code }));
        });
        const readyDeadline = Date.now() + 10000;
        while (!existsSync(ready) && Date.now() < readyDeadline && !absent(holder.pid)) await delay(10);
        assert.equal(JSON.parse(readFileSync(ready, "utf8")).pid, holder.pid);
        assert(!absent(holder.pid), "Exact lock holder must still be live at cleanup boundary");
        assert(!existsSync(released), "Lock must not release during command startup");
        assert.throws(() => rmdirSync(directory), { code: "EBUSY" }, "Real OS handle must deny directory deletion");
        row.lock_confirmed = true;
        cleanupStarted = Date.now();
        if (mode === "transient") writeFileSync(release, "release");
      });
    } catch (error) { failure = error; row.error = error.message; row.error_code = error.code; }
    row.cleanup_elapsed_ms = Date.now() - cleanupStarted;
    assert(row.command_closed && row.lock_confirmed, "Do not mistake startup failure for filesystem behavior");
    assert(row.cleanup_elapsed_ms < 5000, "Fixture filesystem cleanup must remain bounded");
    if (mode === "transient") {
      assert.ifError(failure);
      assert(!existsSync(row.directory), "Released directory lock must permit completed workspace cleanup");
    } else {
      assert.equal(failure?.code, "EBUSY", "Persistent lock must fail, not certify cleanup");
      assert(existsSync(row.directory), "Persistent lock must retain its exact workspace");
      assert(!existsSync(released), "Persistent lock must remain held through failure");
      row.retained_before_recovery = true;
    }
    row.verdict = "passed";
  } catch (error) { row.verdict = "failed"; row.assertion = error.message; }
  finally {
    save();
    try {
      if (holder?.pid) {
        writeFileSync(release, "release");
        let forceTimer;
        let failureTimer;
        const recoveryDeadline = new Promise((_, reject) => {
          forceTimer = setTimeout(() => {
            row.forced_holder_stop = true;
            try { holder.kill("SIGKILL"); }
            catch (error) { reject(error); return; }
            failureTimer = setTimeout(() => reject(new Error("Exact directory-lock holder shutdown unconfirmed")), 2000);
          }, 5000);
        });
        const result = await Promise.race([closed, recoveryDeadline]).finally(() => {
          clearTimeout(forceTimer);
          clearTimeout(failureTimer);
        });
        assert.equal(result.code, 0, "Lock owner must release its handle and close normally");
        assert(absent(holder.pid));
        assert(existsSync(released));
        row.holder_absent = true;
        console.log(JSON.stringify({ child_closed: holder.pid }));
      }
      // Test-owned recovery only, after the locker closed; not the public seam.
      if (row.directory && existsSync(row.directory)) await rm(row.directory, { recursive: true, maxRetries: 3, retryDelay: 100 });
      assert(!row.directory || !existsSync(row.directory));
      row.path_absent_after_recovery = true;
    } catch (error) { row.cleanup_error = error.message; }
    save();
    console.log(JSON.stringify(row));
  }
}
assert(rows.every((row) => row.verdict === "passed" && !row.cleanup_error), "Windows filesystem cleanup regression failed; retained exact receipts");
