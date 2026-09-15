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
import { startWindowsConsumer } from "./windows-consumer-owner.mjs";

const root = resolve(import.meta.dirname, "..");
const checkingSource = process.argv[2] === "--check-source";
const sourcePaths = checkingSource
  ? [resolve(process.argv[3]), resolve(process.argv[4])]
  : [join(root, ".github/workflows/ci.yml"), join(root, ".github/workflows/chocolatey.yml")];
const evidence = resolve(process.argv[2] ?? ".tmp/windows-workflow-native-exits");
const parentCredentialSentinel = "sendmux-native-exit-parent-credential-sentinel";
const fixtureCredential = "sendmux-native-exit-inert-credential";
const credentialSentinels = [parentCredentialSentinel, fixtureCredential];
const chocolateyPushSource = "https://push.chocolatey.org/";
const fixtureRunId = "424242";
const fixtureRunAttempt = "3";
const originalChocolateyConfig = Buffer.from([
  '<?xml version="1.0" encoding="utf-8"?>\r\n',
  "<chocolatey>\r\n",
  '  <config><add key="cacheLocation" value="C:\\fixture-cache" description="original café" /></config>\r\n',
  "  <apiKeys />\r\n",
  "</chocolatey>\r\n",
].join(""), "utf8");
const parentEnvironment = { ...process.env, CHOCOLATEY_API_KEY: parentCredentialSentinel };
const ci = readWorkflow(sourcePaths[0]);
const chocolatey = readWorkflow(sourcePaths[1]);
const publisherScript = stepScript(chocolatey, "Push to Chocolatey");
const credentialTransaction = powerShellFunction(publisherScript, "Invoke-ChocolateyCredentialTransaction");
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
    scripts: () => [publisherScript],
    earlyFailure: 1,
    finalFailure: 2,
    commandCount: 2,
    failureStatus: 7,
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
    credential_transaction_digest: sha256(credentialTransaction),
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
await runInstalledChocolateyProbe();

const nativeArguments = rows.flatMap((row) => row.commands ?? []).flatMap((command) => command.args);
assert(
  nativeArguments.every((argument) => credentialSentinels.every((sentinel) => !argument.includes(sentinel))),
  "A synthetic Chocolatey credential reached native child arguments",
);
assert(
  credentialSentinels.every((sentinel) => !readFileSync(resultsFile, "utf8").includes(sentinel)),
  "A synthetic Chocolatey credential reached retained test output",
);
assert(
  rows.every((row) => row.verdict === "passed" && !row.cleanup_error),
  "PowerShell workflow step masked a native command failure; see retained exact receipts",
);

async function runInstalledChocolateyProbe() {
  const probe = {
    runner: {
      image_os: process.env.ImageOS ?? null,
      image_version: process.env.ImageVersion ?? null,
    },
    verdict: "failed",
  };
  let failure;

  const chocolateyInstall = process.env.ChocolateyInstall;
  assert(chocolateyInstall, "Installed Chocolatey probe requires ChocolateyInstall");
  const chocolateyExecutable = join(chocolateyInstall, "bin", "choco.exe");
  const configPath = join(chocolateyInstall, "config", "chocolatey.config");
  assert(existsSync(chocolateyExecutable), `Installed Chocolatey executable was not found: ${chocolateyExecutable}`);
  assert(existsSync(configPath), `Installed Chocolatey config was not found: ${configPath}`);
  assert(probe.runner.image_os, "Installed Chocolatey probe requires the exact runner ImageOS receipt");
  assert(probe.runner.image_version, "Installed Chocolatey probe requires the exact runner ImageVersion receipt");

  const originalConfig = readFileSync(configPath);
  const probeRunId = `${process.env.GITHUB_RUN_ID ?? process.pid}-installed-probe`;
  const probeRunAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
  const stagingPath = join(
    chocolateyInstall,
    "config",
    `.sendmux-publish-${probeRunId}-${probeRunAttempt}.tmp`,
  );
  const probeSource = `https://sendmux.invalid/chocolatey-auth-probe-${process.pid}-${Date.now()}/`;
  const scriptPath = join(evidence, "installed-chocolatey-probe.ps1");
  const versionEnvironment = { ...process.env };
  delete versionEnvironment.CHOCOLATEY_API_KEY;
  assert(!existsSync(stagingPath), "Installed Chocolatey probe staging path must be absent before use");

  try {
    probe.version_process = await runCapturedProcess({
      command: chocolateyExecutable,
      args: ["--version"],
      env: versionEnvironment,
      label: "installed-chocolatey-version",
    });
    assert.equal(probe.version_process.status, 0, "Installed Chocolatey version command must succeed");
    assert(!probe.version_process.timed_out, "Installed Chocolatey version command exceeded its bound");
    assert(probe.version_process.absent, "Installed Chocolatey version process must be absent after close");
    probe.chocolatey_version = probe.version_process.stdout.trim();
    assert(probe.chocolatey_version, "Installed Chocolatey version receipt must not be empty");

    writeFileSync(scriptPath, installedProbeScript(probeSource));
    probe.transaction = await runCapturedProcess({
      command: windowsPowerShell,
      args: ["-NoProfile", "-NonInteractive", "-File", scriptPath],
      env: {
        ...process.env,
        CHOCOLATEY_API_KEY: fixtureCredential,
        GITHUB_RUN_ATTEMPT: probeRunAttempt,
        GITHUB_RUN_ID: probeRunId,
        SENDMUX_INSTALLED_CHOCO_PATH: chocolateyExecutable,
      },
      label: "installed-chocolatey-transaction",
    });
    assert.equal(probe.transaction.status, 0, "Installed Chocolatey config transaction must succeed");
    assert(!probe.transaction.timed_out, "Installed Chocolatey config transaction exceeded its bound");
    assert(probe.transaction.absent, "Installed Chocolatey transaction shell must be absent after close");
    assert(
      credentialSentinels.every((sentinel) => !`${probe.transaction.stdout}\n${probe.transaction.stderr}`.includes(sentinel)),
      "A synthetic Chocolatey credential reached installed-probe output",
    );

    const receiptLine = probe.transaction.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("SENDMUX_CHOCO_PROBE_RECEIPT="));
    assert(receiptLine, "Installed Chocolatey probe did not emit its structured child receipt");
    probe.child = JSON.parse(receiptLine.slice("SENDMUX_CHOCO_PROBE_RECEIPT=".length));
    assert.deepEqual(
      probe.child.argv,
      ["apikey", "list", "--source", probeSource, "--limit-output"],
      "Installed Chocolatey probe must use the source-specific no-network argv",
    );
    assert.equal(probe.child.credential_environment_present, false, "Installed Chocolatey child environment must not contain the credential");
    assert.equal(probe.child.exit_code, 0, "Installed Chocolatey source-specific config readback must succeed");
    assert(probe.child.stdout.includes(probeSource), "Installed Chocolatey readback must identify the synthetic source");
    assert.match(probe.child.stdout, /Authenticated/i, "Installed Chocolatey readback must report the synthetic source as authenticated");
    assert(
      credentialSentinels.every((sentinel) => !JSON.stringify(probe.child).includes(sentinel)),
      "A synthetic Chocolatey credential reached the installed child argv or retained output",
    );
    probe.child.absent = absent(probe.child.pid);
    assert(probe.child.absent, "Installed Chocolatey child process must be absent after the transaction returns");

    const restoredConfig = readFileSync(configPath);
    probe.config_before_sha256 = sha256(originalConfig);
    probe.config_after_sha256 = sha256(restoredConfig);
    probe.config_restored = restoredConfig.equals(originalConfig);
    probe.staging_path = stagingPath;
    probe.staging_path_absent = !existsSync(stagingPath);
    assert(probe.config_restored, "Installed Chocolatey transaction must restore the exact config bytes");
    assert.equal(probe.config_after_sha256, probe.config_before_sha256, "Installed Chocolatey transaction must restore the original SHA-256");
    assert(probe.staging_path_absent, "Installed Chocolatey transaction must remove its exact staging path");
    probe.verdict = "passed";
  } catch (error) {
    probe.assertion = error.message;
    failure = error;
  } finally {
    const currentConfig = existsSync(configPath) ? readFileSync(configPath) : null;
    if (!currentConfig?.equals(originalConfig)) {
      writeFileSync(configPath, originalConfig);
      probe.emergency_config_restore = true;
    }
    if (existsSync(stagingPath)) {
      await rm(stagingPath, { force: true });
      probe.emergency_staging_cleanup = true;
    }
    probe.final_config_restored = readFileSync(configPath).equals(originalConfig);
    probe.final_staging_path_absent = !existsSync(stagingPath);
    writeFileSync(join(evidence, "installed-chocolatey-probe.json"), JSON.stringify(probe, null, 2));
  }

  assert(probe.final_config_restored, "Installed Chocolatey probe recovery must leave exact original config bytes");
  assert(probe.final_staging_path_absent, "Installed Chocolatey probe recovery must leave no staging path");
  if (failure) throw failure;
  return probe;
}

function installedProbeScript(probeSource) {
  return `$ErrorActionPreference = 'Stop'
${credentialTransaction}
$probeSource = ${powerShellLiteral(probeSource)}
Invoke-ChocolateyCredentialTransaction -Source $probeSource -Operation {
  param($configuredSource)
  $probeArguments = @('apikey', 'list', '--source', $configuredSource, '--limit-output')
  $startInfo = New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName = $env:SENDMUX_INSTALLED_CHOCO_PATH
  $startInfo.Arguments = 'apikey list --source "' + $configuredSource + '" --limit-output'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $credentialEnvironmentPresent = $startInfo.EnvironmentVariables.ContainsKey('CHOCOLATEY_API_KEY')
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Installed Chocolatey probe process did not start.' }
  $probePid = $process.Id
  [Console]::Out.WriteLine("SENDMUX_CHOCO_PROBE_PID=$probePid")
  [Console]::Out.Flush()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $probeExitCode = $process.ExitCode
  $receipt = [ordered]@{
    pid = $probePid
    argv = $probeArguments
    credential_environment_present = $credentialEnvironmentPresent
    stdout = $stdoutTask.GetAwaiter().GetResult()
    stderr = $stderrTask.GetAwaiter().GetResult()
    exit_code = $probeExitCode
  }
  $process.Dispose()
  Write-Output ('SENDMUX_CHOCO_PROBE_RECEIPT=' + ($receipt | ConvertTo-Json -Compress))
  Set-Variable -Name LASTEXITCODE -Value $probeExitCode -Scope 1
}
`;
}

async function runCapturedProcess({ command, args, env, label }) {
  const owner = startWindowsConsumer(command, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const child = owner.child;
  const receipt = { pid: child.pid, command, args, label, stdout: "", stderr: "" };
  console.log(JSON.stringify({ child_pid: child.pid, command, label }));
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { receipt.stdout += chunk; });
  child.stderr.on("data", (chunk) => { receipt.stderr += chunk; });
  let timedOut = false;
  let shutdownTimer;
  let rejectShutdown;
  const shutdownFailed = new Promise((_, reject) => { rejectShutdown = reject; });
  const timer = setTimeout(() => {
    timedOut = true;
    try { owner.stop(); } catch (error) { receipt.stop_error = error.message; }
    shutdownTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (error) { receipt.kill_error = error.message; }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      rejectShutdown(new Error(`Installed Chocolatey probe shutdown unconfirmed: ${child.pid}`));
    }, 2000);
  }, 20000);
  const closed = new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", accept);
  });
  receipt.status = await Promise.race([closed, shutdownFailed]).finally(() => {
    clearTimeout(timer);
    clearTimeout(shutdownTimer);
  });
  receipt.timed_out = timedOut;
  receipt.job = await owner.confirm();
  receipt.absent = absent(child.pid);
  assert(!receipt.job.orphan, "Installed Chocolatey command must not leave an owned descendant");
  assert(!receipt.stop_error && !receipt.kill_error, "Installed Chocolatey command shutdown must be confirmed");
  console.log(JSON.stringify({ child_closed: child.pid, label, status: receipt.status, timed_out: timedOut }));
  return receipt;
}

function powerShellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

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
    if (candidate.name === "chocolatey-push") assertPublisherTransaction(row, fixture);
    if (scenario !== "early") assert.equal(row.commands.length, candidate.commandCount, "Workflow block must execute every expected native command");
    if (scenario === "healthy") assert.equal(row.status, 0, "Healthy workflow step must succeed");
    else if (candidate.failureStatus) assert.equal(row.status, candidate.failureStatus, `${scenario} native failure must survive publisher cleanup`);
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
  const isChocolateyPublisher = candidate.name === "chocolatey-push";
  const chocolateyInstall = join(directory, "chocolatey");
  const chocolateyConfigDirectory = join(chocolateyInstall, "config");
  const chocolateyConfig = join(chocolateyConfigDirectory, "chocolatey.config");
  const chocolateyStaging = join(
    chocolateyConfigDirectory,
    `.sendmux-publish-${fixtureRunId}-${fixtureRunAttempt}.tmp`,
  );
  mkdirSync(bin);
  mkdirSync(scripts);
  if (isChocolateyPublisher) {
    mkdirSync(chocolateyConfigDirectory, { recursive: true });
    writeFileSync(chocolateyConfig, originalChocolateyConfig);
  }
  const nativeCommand = join(directory, "native-command.mjs");
  writeFileSync(nativeCommand, `import { appendFileSync, existsSync, readFileSync } from "node:fs";
const fixtureCredential = ${JSON.stringify(fixtureCredential)};
const chocolateyPushSource = ${JSON.stringify(chocolateyPushSource)};
export function finish(command, args) {
  const file = process.env.SENDMUX_NATIVE_COMMANDS;
  const index = existsSync(file) ? readFileSync(file, "utf8").trim().split(/\\n/).filter(Boolean).length + 1 : 1;
  const config = inspectChocolateyConfig(command);
  appendFileSync(file, JSON.stringify({
    pid: process.pid,
    command,
    args,
    index,
    credential_environment_present: Boolean(process.env.CHOCOLATEY_API_KEY),
    ...config,
  }) + "\\n");
  return index === Number(process.env.SENDMUX_NATIVE_FAIL_AT) ? 7 : 0;
}
function inspectChocolateyConfig(command) {
  const file = process.env.SENDMUX_CHOCOLATEY_CONFIG;
  if (command !== "choco" || !file) return {};
  const text = readFileSync(file, "utf8");
  const apiKeyEntries = text.match(/<apiKeys\\s+[^>]*>/g) ?? [];
  return {
    config_has_push_source: apiKeyEntries.some((entry) => entry.includes(\`source="\${chocolateyPushSource}"\`)),
    config_contains_fixture_plaintext: text.includes(fixtureCredential),
  };
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
      ...(isChocolateyPublisher ? {
        ChocolateyInstall: chocolateyInstall,
        GITHUB_RUN_ATTEMPT: fixtureRunAttempt,
        GITHUB_RUN_ID: fixtureRunId,
        SENDMUX_CHOCOLATEY_CONFIG: chocolateyConfig,
      } : {}),
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      SENDMUX_CHOCOLATEY_VERSION: version,
      SENDMUX_NATIVE_COMMANDS: commands,
      SENDMUX_NATIVE_FAIL_AT: String(failAt),
      SENDMUX_NATIVE_NODE: process.execPath,
      SENDMUX_NATIVE_SERVER: server,
      SENDMUX_NATIVE_SHIM: shim,
      SENDMUX_NATIVE_STOPPED: stopped,
    },
    chocolateyConfig,
    chocolateyStaging,
    originalChocolateyConfig,
  };
}

function assertPublisherTransaction(row, fixture) {
  const restoredConfig = readFileSync(fixture.chocolateyConfig);
  row.config_before_sha256 = sha256(fixture.originalChocolateyConfig);
  row.config_after_sha256 = sha256(restoredConfig);
  row.config_restored = restoredConfig.equals(fixture.originalChocolateyConfig);
  row.staging_path = fixture.chocolateyStaging;
  row.staging_path_absent = !existsSync(fixture.chocolateyStaging);

  assert(row.config_restored, "Chocolatey publisher must restore the exact original config bytes");
  assert.equal(row.config_after_sha256, row.config_before_sha256, "Chocolatey publisher must restore the original config SHA-256");
  assert(row.staging_path_absent, "Chocolatey publisher must remove its exact owned staging path");
  for (const command of row.commands) {
    assert.equal(command.command, "choco", "Chocolatey publisher must invoke only Chocolatey children");
    assert.equal(command.args[0], "push", "Chocolatey publisher must invoke only its two package pushes");
    assert.equal(command.credential_environment_present, false, "Chocolatey publisher must clear the credential from child environments");
    assert.equal(command.config_has_push_source, true, "Chocolatey publisher child must observe the exact-source encrypted config entry");
    assert.equal(command.config_contains_fixture_plaintext, false, "Chocolatey config must not contain the fixture credential plaintext");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function powerShellFunction(source, name) {
  const declaration = `function ${name} {`;
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `Missing PowerShell function in extracted publisher: ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unterminated PowerShell function in extracted publisher: ${name}`);
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
