import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { mock } from "node:test";
import { run, workspace } from "./ci-consumers.mjs";

// Diagnostic only: no platform emulation and no production ownership changes.
assert.equal(process.platform, "win32", "This diagnostic requires an actual Windows runner");
const evidence = resolve(process.argv[2] ?? ".tmp/windows-consumer-ownership");
assert(!existsSync(evidence), "Use a fresh diagnostic evidence directory");
mkdirSync(evidence, { recursive: true });
const results = [];
const powershell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const encoded = (source) => Buffer.from(source, "utf16le").toString("base64");
const quoted = (value) => `'${value.replaceAll("'", "''")}'`;

function absent(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0, "Recovery needs an exact recorded PID");
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === "ESRCH") return true; throw error; }
}

async function waitFor(check, message, milliseconds = 10000) {
  const deadline = Date.now() + milliseconds;
  do { if (check()) return; await delay(25); } while (Date.now() < deadline);
  throw new Error(message);
}

async function recover(pid, row) {
  if (!absent(pid)) {
    const killer = spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      stdio: "inherit", timeout: 5000, killSignal: "SIGKILL",
    });
    row.recovery.push({ target: pid, killer: killer.pid });
    console.log(JSON.stringify({ recovery_pid: pid, killer_pid: killer.pid }));
    const code = await new Promise((accept, reject) => {
      killer.once("error", reject);
      killer.once("close", accept);
    });
    assert(absent(killer.pid), "Recovery command must close");
    assert(code === 0 || absent(pid), "Exact-PID recovery failed");
  }
  await waitFor(() => absent(pid), `Recorded process ${pid} did not stop`, 5000);
  row.recovered.push(pid);
}

async function scenario(kind) {
  const fixture = mkdtempSync(join(tmpdir(), "sendmux-windows-ownership-"));
  const row = { kind, owner: process.pid, fixture, recovery: [], recovered: [] };
  const leaderReceipt = join(fixture, "leader.json");
  const descendantReceipt = join(fixture, "descendant.json");
  const ready = join(fixture, "ready");
  const release = join(fixture, "release");
  let directory;
  let invocation;
  let deadlineCallback;
  let timerMock;
  let handles;
  console.log(JSON.stringify({ owner_pid: process.pid, fixture, kind }));
  const readHandles = () => {
    if (!existsSync(leaderReceipt)) return;
    try { return JSON.parse(readFileSync(leaderReceipt, "utf8")); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  };
  try {
    let command;
    let args;
    if (kind === "node-leader-control") {
      const child = `require('node:fs').writeFileSync(${JSON.stringify(descendantReceipt)}, JSON.stringify({pid:process.pid}));setTimeout(()=>process.exit(0),45000);`;
      const leader = `const fs=require('node:fs');const {spawn}=require('node:child_process');
fs.writeFileSync(${JSON.stringify(leaderReceipt)},JSON.stringify({leader:process.pid}));
const child=spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore',cwd:${JSON.stringify(fixture)}});
fs.writeFileSync(${JSON.stringify(leaderReceipt)},JSON.stringify({leader:process.pid,descendant:child.pid}));
const poll=setInterval(()=>{if(fs.existsSync(${JSON.stringify(descendantReceipt)})){fs.writeFileSync(${JSON.stringify(ready)},'ready');clearInterval(poll);const release=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0);},25);}},25);
setTimeout(()=>process.exit(9),45000);`;
      command = process.execPath;
      args = ["-e", leader];
    } else {
      // Start-Process is a real non-Node consumer intermediary, not a platform mock.
      const child = `[IO.File]::WriteAllText(${quoted(descendantReceipt)}, ('{"pid":' + $PID + '}')); Start-Sleep -Seconds 45`;
      const leader = `$ErrorActionPreference='Stop'
[IO.File]::WriteAllText(${quoted(leaderReceipt)}, ('{"leader":' + $PID + '}'))
$child=Start-Process -FilePath ${quoted(powershell)} -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',${quoted(encoded(child))}) -WorkingDirectory ${quoted(fixture)} -WindowStyle Hidden -RedirectStandardOutput ${quoted(join(fixture, "child.stdout"))} -RedirectStandardError ${quoted(join(fixture, "child.stderr"))} -PassThru
[IO.File]::WriteAllText(${quoted(leaderReceipt)}, ('{"leader":' + $PID + ',"descendant":' + $child.Id + '}'))
$limit=[DateTime]::UtcNow.AddSeconds(45)
while (!(Test-Path -LiteralPath ${quoted(descendantReceipt)})) { if ([DateTime]::UtcNow -gt $limit) { exit 9 }; Start-Sleep -Milliseconds 25 }
[IO.File]::WriteAllText(${quoted(ready)}, 'ready')
while (!(Test-Path -LiteralPath ${quoted(release)})) { if ([DateTime]::UtcNow -gt $limit) { exit 9 }; Start-Sleep -Milliseconds 25 }
exit 0`;
      command = powershell;
      args = ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(leader)];
    }
    if (kind === "powershell-deadline") {
      const originalTimer = globalThis.setTimeout;
      // Only accelerate the existing deadline after both real processes are ready.
      timerMock = mock.method(globalThis, "setTimeout", (callback, ms, ...values) => {
        if (ms === 900000) deadlineCallback = callback;
        return originalTimer(callback, ms, ...values);
      });
    }
    invocation = workspace("windows-owned-command", async (cwd) => {
      directory = cwd;
      await run(command, args, { cwd });
    }).then(() => { row.result = "success"; }, (error) => {
      row.result = "failure";
      row.error = error.message;
    });
    await waitFor(() => existsSync(ready), "Fixture did not become ready");
    handles = readHandles();
    assert(handles?.leader && handles?.descendant, "Both process handles must be recorded");
    assert.equal(JSON.parse(readFileSync(descendantReceipt, "utf8")).pid, handles.descendant);
    Object.assign(row, handles, { directory });
    console.log(JSON.stringify({ ...handles, directory, kind }));
    assert(!absent(handles.leader) && !absent(handles.descendant), "Both owned processes must be live before trigger");
    timerMock?.mock.restore();
    if (kind === "powershell-deadline") {
      assert.equal(typeof deadlineCallback, "function");
      deadlineCallback();
    } else {
      writeFileSync(release, "release");
    }
    await invocation;
    row.leader_absent_before_recovery = absent(handles.leader);
    row.descendant_absent_before_recovery = absent(handles.descendant);
    row.workspace_removed_before_recovery = !existsSync(directory);
    console.log(JSON.stringify(row));
    assert(row.leader_absent_before_recovery, "Consumer leader must stop before return");
    assert(row.descendant_absent_before_recovery, "Consumer returned while its owned Windows descendant was still alive");
    if (kind !== "node-leader-control") assert.equal(row.result, "failure", "An orphaned or timed-out consumer must not succeed");
    row.verdict = "passed";
  } catch (error) {
    row.verdict = "failed";
    row.assertion = error.message;
  } finally {
    timerMock?.mock.restore();
    handles ??= readHandles();
    Object.assign(row, handles, { directory });
    results.push(row);
    writeFileSync(join(evidence, "results.json"), JSON.stringify(results, null, 2));
    try {
      // On any setup/assertion failure recover only handles written by this fixture.
      if (handles) {
        if (handles.descendant) await recover(handles.descendant, row);
        await recover(handles.leader, row);
      }
      if (invocation) await invocation;
      if (directory && existsSync(directory)) rmSync(directory, { recursive: true });
      assert(!directory || !existsSync(directory));
      rmSync(fixture, { recursive: true });
      assert(!existsSync(fixture));
      row.paths_absent = true;
    } catch (error) {
      row.cleanup_error = error.message;
      throw error;
    } finally {
      writeFileSync(join(evidence, "results.json"), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ kind, verdict: row.verdict, recovered: row.recovered, paths_absent: row.paths_absent, cleanup_error: row.cleanup_error }));
    }
  }
}

for (const kind of ["node-leader-control", "powershell-leader-exit", "powershell-deadline"]) await scenario(kind);
assert.equal(results.length, 3);
assert.equal(results.filter((row) => row.verdict === "failed").length, 0, "Windows consumer ownership diagnostic failed; see exact pre-recovery receipts");
