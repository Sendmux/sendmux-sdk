import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const python = join(root, ".tmp", "python-venv", "bin", "python");
const fixture = join(root, "packages", "python", "mcp", "tests", "conformance", "server.py");
const stamp = new Date().toISOString().replaceAll(":", "-");
const outputRoot = process.env.MCP_CONFORMANCE_OUTPUT_DIR ?? join(root, ".tmp", "mcp-conformance", stamp);
const port = await availablePort();
const url = `http://127.0.0.1:${port}/mcp`;
const serverLog = join(outputRoot, "server.log");
const requiredServerScenarios = {
  "2025-11-25": ["server-initialize", "logging-set-level", "ping", "completion-complete", "tools-list", "tools-call-simple-text", "tools-call-image", "tools-call-audio", "tools-call-embedded-resource", "tools-call-mixed-content", "tools-call-with-logging", "tools-call-error", "tools-call-with-progress", "tools-call-sampling", "tools-call-elicitation", "elicitation-sep1034-defaults", "server-sse-multiple-streams", "elicitation-sep1330-enums", "resources-list", "resources-read-text", "resources-read-binary", "resources-templates-read", "resources-subscribe", "resources-unsubscribe", "prompts-list", "prompts-get-simple", "prompts-get-with-args", "prompts-get-embedded-resource", "prompts-get-with-image", "dns-rebinding-protection"],
  "2026-07-28": ["server-stateless", "completion-complete", "tools-list", "tools-call-simple-text", "tools-call-image", "tools-call-audio", "tools-call-embedded-resource", "tools-call-mixed-content", "tools-call-error", "tools-call-with-progress", "server-sse-multiple-streams", "resources-list", "resources-read-text", "resources-read-binary", "resources-templates-read", "sep-2164-resource-not-found", "prompts-list", "prompts-get-simple", "prompts-get-with-args", "prompts-get-embedded-resource", "prompts-get-with-image", "dns-rebinding-protection", "caching", "input-required-result-basic-elicitation", "input-required-result-basic-sampling", "input-required-result-basic-list-roots", "input-required-result-request-state", "input-required-result-multiple-input-requests", "input-required-result-multi-round", "input-required-result-missing-input-response", "input-required-result-non-tool-request", "input-required-result-result-type", "input-required-result-unsupported-methods", "input-required-result-tampered-state", "input-required-result-capability-check", "input-required-result-ignore-extra-params", "input-required-result-validate-input"],
};

mkdirSync(outputRoot, { recursive: true });
const server = spawn(python, [fixture, String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
const logChunks = [];
server.stdout.on("data", (chunk) => logChunks.push(chunk));
server.stderr.on("data", (chunk) => logChunks.push(chunk));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopServer(server).then(() => process.kill(process.pid, signal));
  });
}

try {
  await waitUntilReady(url, server);
  for (const revision of ["2025-11-25", "2026-07-28"]) {
    const outputDir = join(outputRoot, revision);
    await runConformance(url, revision, outputDir);
    assertRequiredResults(revision, outputDir);
  }
  console.log(`MCP required scenarios passed with zero failures/skipped scenarios; capability-inapplicable checks and non-scored results remain visible in ${outputRoot}`);
} finally {
  await stopServer(server);
  writeFileSync(serverLog, Buffer.concat(logChunks));
}

function assertRequiredResults(revision, outputDir) {
  const directories = readdirSync(outputDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const scenario of requiredServerScenarios[revision]) {
    const prefix = `server-${scenario}-`;
    const matches = directories.filter((entry) => entry.name.startsWith(prefix));
    if (matches.length !== 1) throw new Error(`MCP ${revision} required scenario ${scenario} produced ${matches.length} result directories`);
    const checks = JSON.parse(readFileSync(join(outputDir, matches[0].name, "checks.json"), "utf8"));
    const unacceptable = checks.filter((check) => check.status === "FAILURE");
    if (unacceptable.length) {
      throw new Error(`MCP ${revision} required scenario ${scenario} has non-success checks: ${unacceptable.map((check) => `${check.id}:${check.status}`).join(", ")}`);
    }
    const unexpectedSkips = checks.filter((check) => check.status === "SKIPPED" && !/not applicable|did not declare/.test(check.details?.note ?? ""));
    if (unexpectedSkips.length) throw new Error(`MCP ${revision} required scenario ${scenario} has unexplained skips: ${unexpectedSkips.map((check) => check.id).join(", ")}`);
  }
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const selectedPort = typeof address === "object" && address ? address.port : undefined;
      listener.close((error) => error ? reject(error) : resolve(selectedPort));
    });
  });
}

async function waitUntilReady(target, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Conformance fixture exited before readiness with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(250) });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Conformance fixture did not become ready within 10 seconds");
}

function runConformance(target, revision, outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "conformance", "server", "--url", target, "--requirements", revision, "--output-dir", outputDir],
      { cwd: root, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`MCP ${revision} conformance failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve();
    }, 5_000)),
  ]);
  await waitForExit(child);
}
