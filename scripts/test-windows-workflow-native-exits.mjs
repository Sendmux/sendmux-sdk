#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const checkingSource = process.argv[2] === "--check-source";
const sourcePaths = checkingSource
  ? [resolve(process.argv[3]), resolve(process.argv[4])]
  : [join(root, ".github/workflows/ci.yml"), join(root, ".github/workflows/chocolatey.yml")];
const evidence = resolve(process.argv[2] ?? ".tmp/windows-workflow-native-exits");
const parentCredentialSentinel = "sendmux-native-exit-parent-credential-sentinel";
const fixtureCredential = "sendmux-native-exit-inert-credential";
const parentEnvironment = { ...process.env, CHOCOLATEY_API_KEY: parentCredentialSentinel };
const ci = readWorkflow(sourcePaths[0]);
const chocolatey = readWorkflow(sourcePaths[1]);
const windowsPowerShell = process.platform === "win32"
  ? join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";
const rows = [];

function readWorkflow(file) {
  return readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

const candidates = [
  {
    name: "ci-consumer-diagnostics",
    shell: "pwsh.exe",
    scripts: ciDiagnosticScripts,
    earlyFailure: 1,
    finalFailure: 2,
    commandCount: 2,
  },
  {
    name: "chocolatey-helper-validation",
    shell: "pwsh.exe",
    scripts: () => [stepScript(chocolatey, "Verify workflow helper scripts")],
    invalidEarlySyntax: true,
    finalFailure: 5,
    commandCount: 5,
  },
  {
    name: "chocolatey-pack",
    shell: windowsPowerShell,
    scripts: () => [stepScript(chocolatey, "Pack Chocolatey packages")],
    earlyFailure: 1,
    finalFailure: 2,
    commandCount: 2,
  },
  {
    name: "chocolatey-install-test",
    shell: windowsPowerShell,
    scripts: () => [stepScript(chocolatey, "Test Chocolatey packages")],
    earlyFailure: 1,
    finalFailure: 7,
    serverCleanup: true,
    commandCount: 7,
  },
  {
    name: "chocolatey-push",
    shell: windowsPowerShell,
    scripts: () => [stepScript(chocolatey, "Push to Chocolatey")],
    earlyFailure: 1,
    finalFailure: 3,
    commandCount: 3,
  },
];

const extracted = candidates.map((candidate) => ({
  name: candidate.name,
  scripts: candidate.scripts(),
}));
for (const candidate of extracted) assert(candidate.scripts.length > 0, `No workflow run block found for ${candidate.name}`);
if (checkingSource) {
  console.log(JSON.stringify({
    candidates: extracted.map((candidate) => ({
      name: candidate.name,
      blocks: candidate.scripts.length,
      digest: createHash("sha256").update(JSON.stringify(candidate.scripts)).digest("hex"),
    })),
  }));
  process.exit(0);
}
assert.equal(process.platform, "win32", "Workflow native-exit regression requires actual Windows PowerShell");
assert(!existsSync(evidence), "Preserve prior workflow native-exit receipts");
mkdirSync(evidence, { recursive: true });
const resultsFile = join(evidence, "results.json");

for (const candidate of candidates) {
  for (const scenario of ["healthy", "early", "final"]) {
    await runCase(candidate, scenario);
  }
}

const nativeArguments = rows.flatMap((row) => row.commands ?? []).flatMap((command) => command.args);
assert(
  nativeArguments.every((argument) => !argument.includes(parentCredentialSentinel)),
  "Synthetic parent Chocolatey credential reached native child arguments",
);
assert(
  !readFileSync(resultsFile, "utf8").includes(parentCredentialSentinel),
  "Synthetic parent Chocolatey credential reached retained test output",
);
assert(
  rows.every((row) => row.verdict === "passed" && !row.cleanup_error),
  "PowerShell workflow step masked a native command failure; see retained exact receipts",
);

async function runCase(candidate, scenario) {
  const directory = mkdtempSync(join(tmpdir(), "sendmux-windows-native-exit-"));
  const row = { candidate: candidate.name, scenario, owner_pid: process.pid, directory, shells: [] };
  rows.push(row);
  console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid, candidate: candidate.name, scenario }));
  const fixture = prepareFixture(directory, candidate, scenario);
  try {
    row.status = await runWorkflowScripts(candidate, directory, fixture.env, row);
    row.commands = readJsonLines(fixture.commands);
    if (candidate.serverCleanup) await assertServerCleanup(row, fixture);
    if (scenario !== "early") assert.equal(row.commands.length, candidate.commandCount, "Workflow block must execute every expected native command");
    if (scenario === "healthy") assert.equal(row.status, 0, "Healthy workflow step must succeed");
    else assert.notEqual(row.status, 0, `${scenario} native failure must fail its workflow step`);
    row.verdict = "passed";
  } catch (error) {
    row.verdict = "failed";
    row.assertion = error.message;
  } finally {
    try {
      await recoverServer(row, fixture);
      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 });
      assert(!existsSync(directory));
      row.path_absent = true;
      console.log(JSON.stringify({ removed_workspace: directory }));
    } catch (error) {
      row.cleanup_error = error.message;
    }
    writeFileSync(resultsFile, JSON.stringify(rows, null, 2));
    console.log(JSON.stringify(row));
  }
}

async function runWorkflowScripts(candidate, directory, env, row) {
  let status = 0;
  for (const [index, source] of candidate.scripts().entries()) {
    status = await runPowerShellStep({ candidate, directory, env, index, row, source });
    if (status !== 0) break;
  }
  return status;
}

async function runPowerShellStep({ candidate, directory, env, index, row, source }) {
  const script = join(directory, `step-${index}.ps1`);
  writeFileSync(script, githubPowerShellScript(renderExpressions(source), candidate.serverCleanup));
  const child = spawn(candidate.shell, ["-NoProfile", "-NonInteractive", "-File", script], {
    cwd: directory,
    env,
    stdio: "inherit",
  });
  const shell = { pid: child.pid, executable: candidate.shell, step: index };
  row.shells.push(shell);
  console.log(JSON.stringify({ child_pid: child.pid, command: candidate.shell, cwd: directory }));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill("SIGKILL"); } catch (error) { shell.kill_error = error.message; }
  }, 20000);
  const status = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", accept);
  }).finally(() => clearTimeout(timer));
  Object.assign(shell, { status, timed_out: timedOut, absent: absent(child.pid) });
  console.log(JSON.stringify({ child_closed: child.pid, status, timed_out: timedOut }));
  assert(!timedOut, "PowerShell step exceeded its bounded fixture time");
  assert(shell.absent, "PowerShell step process must be absent after close");
  return status;
}

function prepareFixture(directory, candidate, scenario) {
  const bin = join(directory, "bin");
  const scripts = join(directory, "scripts");
  const commands = join(directory, "commands.jsonl");
  const server = join(directory, "server.json");
  const stopped = join(directory, "stopped.txt");
  mkdirSync(bin);
  mkdirSync(scripts);
  const nativeCommand = join(directory, "native-command.mjs");
  writeFileSync(nativeCommand, `import { appendFileSync, existsSync, readFileSync } from "node:fs";
export function finish(command, args) {
  const file = process.env.SENDMUX_NATIVE_COMMANDS;
  const index = existsSync(file) ? readFileSync(file, "utf8").trim().split(/\\n/).filter(Boolean).length + 1 : 1;
  appendFileSync(file, JSON.stringify({ pid: process.pid, command, args, index }) + "\\n");
  return index === Number(process.env.SENDMUX_NATIVE_FAIL_AT) ? 7 : 0;
}`);
  const shim = join(directory, "native-shim.mjs");
  writeFileSync(shim, `import {finish} from ${JSON.stringify(pathToFileURL(nativeCommand).href)};const [command,...args]=process.argv.slice(2);process.exitCode=finish(command,args);`);
  for (const command of ["choco", "pnpm", "sendmux"]) {
    writeFileSync(join(bin, `${command}.cmd`), `@echo off\r\n"%SENDMUX_NATIVE_NODE%" "%SENDMUX_NATIVE_SHIM%" ${command} %*\r\nexit /b %ERRORLEVEL%\r\n`);
  }
  const nodeFixture = `import {finish} from ${JSON.stringify(pathToFileURL(nativeCommand).href)};process.exitCode=finish("node",process.argv.slice(2));`;
  writeFileSync(join(scripts, "diagnose-windows-consumer-ownership.mjs"), nodeFixture);
  writeFileSync(join(scripts, "test-windows-consumer-sensitivity.mjs"), nodeFixture);
  const invalidSyntax = candidate.invalidEarlySyntax && scenario === "early";
  writeFileSync(join(scripts, "serve-static.mjs"), invalidSyntax
    ? "this is deliberately invalid syntax {"
    : `import {appendFileSync} from "node:fs";appendFileSync(process.env.SENDMUX_NATIVE_SERVER,JSON.stringify({pid:process.pid})+"\\n");setTimeout(()=>process.exit(9),30000);setInterval(()=>{},1000);`);
  const version = "1.2.3";
  const packages = join(directory, ".tmp/chocolatey/pkg");
  mkdirSync(packages, { recursive: true });
  writeFileSync(join(packages, `sendmux.portable.${version}.nupkg`), "fixture");
  writeFileSync(join(packages, `sendmux.${version}.nupkg`), "fixture");
  const failAt = scenario === "early" ? (candidate.earlyFailure ?? 0) : scenario === "final" ? candidate.finalFailure : 0;
  return {
    commands,
    server,
    stopped,
    env: {
      ...parentEnvironment,
      CHOCOLATEY_API_KEY: fixtureCredential,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      SENDMUX_CHOCOLATEY_VERSION: version,
      SENDMUX_NATIVE_COMMANDS: commands,
      SENDMUX_NATIVE_FAIL_AT: String(failAt),
      SENDMUX_NATIVE_NODE: process.execPath,
      SENDMUX_NATIVE_SERVER: server,
      SENDMUX_NATIVE_SHIM: shim,
      SENDMUX_NATIVE_STOPPED: stopped,
    },
  };
}

function githubPowerShellScript(source, instrumentCleanup) {
  const cleanup = instrumentCleanup ? `function global:Stop-Process {
  [CmdletBinding()]
  param([Parameter(Mandatory=$true)][int]$Id, [switch]$Force)
  Microsoft.PowerShell.Management\\Stop-Process -Id $Id -Force:$Force -ErrorAction SilentlyContinue
  [IO.File]::AppendAllText($env:SENDMUX_NATIVE_STOPPED, ($Id.ToString() + [Environment]::NewLine))
}
` : "";
  return `$ErrorActionPreference = 'Stop'\n${cleanup}${source}\nif ((Test-Path -LiteralPath variable:\\LASTEXITCODE)) { exit $LASTEXITCODE }\n`;
}

function renderExpressions(source) {
  return source.replaceAll("${{ github.event_name }}", "pull_request");
}

function ciDiagnosticScripts() {
  const split = ["Diagnose actual Windows consumer ownership", "Prove Windows command control sensitivity"];
  if (split.every((name) => hasStep(ci, name))) return split.map((name) => stepScript(ci, name));
  return [stepScript(ci, "Verify Windows consumer tree ownership")];
}

function hasStep(workflow, name) {
  return workflow.includes(`      - name: ${name}\n`);
}

function stepScript(workflow, name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const tail = workflow.slice(start + 1);
  const relativeEnd = tail.search(/^      - (?:name:|uses:|run:)/m);
  const block = workflow.slice(start, relativeEnd === -1 ? workflow.length : start + 1 + relativeEnd);
  const marker = "        run: |\n";
  const run = block.indexOf(marker);
  assert.notEqual(run, -1, `Workflow step must expose an actual multiline run block: ${name}`);
  return block.slice(run + marker.length).split("\n").map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n").trimEnd();
}

async function assertServerCleanup(row, fixture) {
  const servers = readJsonLines(fixture.server);
  assert.equal(servers.length, 1, "Package test must start one exact fixture server");
  const stopped = existsSync(fixture.stopped) ? readFileSync(fixture.stopped, "utf8").trim().split(/\r?\n/).filter(Boolean).map(Number) : [];
  row.server_pid = servers[0].pid;
  row.server_stopped = stopped;
  await waitFor(() => absent(row.server_pid), "Package-test finally block did not stop its exact fixture server");
  assert(stopped.includes(row.server_pid), "Package-test finally cleanup must target its exact fixture server");
}

async function recoverServer(row, fixture) {
  if (!existsSync(fixture.server)) return;
  for (const { pid } of readJsonLines(fixture.server)) {
    if (absent(pid)) continue;
    row.recovered_server ??= [];
    row.recovered_server.push(pid);
    process.kill(pid, "SIGKILL");
    await waitFor(() => absent(pid), `Exact fixture server ${pid} did not stop during recovery`);
  }
}

function readJsonLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function waitFor(check, message) {
  const deadline = Date.now() + 5000;
  do { if (check()) return; await delay(25); } while (Date.now() < deadline);
  throw new Error(message);
}

function absent(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0, "Exact process receipt required");
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === "ESRCH") return true; throw error; }
}
