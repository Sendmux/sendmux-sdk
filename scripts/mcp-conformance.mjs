import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.cwd();
const python = join(root, ".tmp", "python-venv", "bin", "python");
const fixture = join(root, "packages", "python", "mcp", "tests", "conformance", "server.py");
const conformancePackage = dirname(fileURLToPath(import.meta.resolve("@modelcontextprotocol/conformance/package.json")));
const frozenRequiredChecks = JSON.parse(
  readFileSync(join(root, "scripts", "mcp-conformance-required-checks.json"), "utf8"),
).revisions;
const expectedRequiredCounts = {
  "2025-11-25": { SUCCESS: 70, INFO: 0, SKIPPED: 0 },
  "2026-07-28": { SUCCESS: 114, INFO: 1, SKIPPED: 5 },
};
let activeConformanceChild = null;

async function main() {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outputRoot = process.env.MCP_CONFORMANCE_OUTPUT_DIR ?? join(root, ".tmp", "mcp-conformance", stamp);
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}/mcp`;
  const serverLog = join(outputRoot, "server.log");
  mkdirSync(outputRoot, { recursive: true });
  const server = spawn(python, [fixture, String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const logChunks = [];
  server.stdout.on("data", (chunk) => logChunks.push(chunk));
  server.stderr.on("data", (chunk) => logChunks.push(chunk));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => void stopChildrenAndReraise(signal, server));
  }
  try {
    await Promise.race([
      waitUntilReady(url, server),
      new Promise((_, reject) => server.once("error", reject)),
    ]);
    for (const revision of ["2025-11-25", "2026-07-28"]) {
      const outputDir = join(outputRoot, revision);
      await runConformance(url, revision, outputDir);
      assertRequiredResults(revision, outputDir);
    }
    console.log(`MCP required scenarios passed; exact capability exclusions and non-scored results remain visible in ${outputRoot}`);
  } finally {
    await stopChild(server);
    writeFileSync(serverLog, Buffer.concat(logChunks));
  }
}

export function requiredServerScenarios(revision) {
  const yaml = readFileSync(join(conformancePackage, "requirements", `${revision}.yaml`), "utf8");
  const serverBlock = yaml.match(/^server:\n((?:  - .+\n)+)/m)?.[1];
  if (!serverBlock) throw new Error(`MCP ${revision} immutable requirements contain no server scenarios`);
  return serverBlock.trim().split("\n").map((line) => line.replace(/^\s*-\s+/, ""));
}

export function assertRequiredResults(revision, outputDir) {
  const directories = readdirSync(outputDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const counts = { SUCCESS: 0, INFO: 0, SKIPPED: 0 };
  const requiredScenarios = requiredServerScenarios(revision);
  const expectedScenarios = frozenRequiredChecks[revision];
  if (!expectedScenarios || !isDeepStrictEqual(Object.keys(expectedScenarios).sort(), [...requiredScenarios].sort())) {
    throw new Error(`MCP ${revision} frozen required-check scenarios do not match the pinned runner requirements`);
  }
  for (const scenario of requiredScenarios) {
    const prefix = `server-${scenario}-`;
    const matches = directories.filter((entry) => entry.name.startsWith(prefix));
    if (matches.length !== 1) throw new Error(`MCP ${revision} required scenario ${scenario} produced ${matches.length} result directories`);
    const checks = JSON.parse(readFileSync(join(outputDir, matches[0].name, "checks.json"), "utf8"));
    if (!Array.isArray(checks) || checks.length === 0) throw new Error(`MCP ${revision} required scenario ${scenario} produced no checks`);
    const actualChecks = checks.map(normalizeCheck).sort(compareChecks);
    if (!isDeepStrictEqual(actualChecks, expectedScenarios[scenario])) {
      throw new Error(`MCP ${revision} required scenario ${scenario} checks differ from the frozen pinned-runner multiset`);
    }
    for (const check of checks) {
      counts[check.status] += 1;
    }
  }
  if (revision === "2026-07-28") assertModernCapabilityExclusions(outputDir, directories);
  const expected = expectedRequiredCounts[revision];
  if (!expected) throw new Error(`MCP ${revision} has no frozen required-result count`);
  for (const status of Object.keys(counts)) {
    if (counts[status] !== expected[status]) {
      throw new Error(`MCP ${revision} required ${status} count was ${counts[status]}, expected ${expected[status]}`);
    }
  }
  return counts;
}

function normalizeCheck(check) {
  const normalized = { id: check.id, name: check.name, status: check.status };
  if (check.details?.fieldIssue !== undefined) normalized.fieldIssue = check.details.fieldIssue;
  if (check.details?.note !== undefined) normalized.note = check.details.note;
  return normalized;
}

function compareChecks(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function assertModernCapabilityExclusions(outputDir, directories) {
  const scenario = "server-stateless";
  const match = directories.find((entry) => entry.name.startsWith(`server-${scenario}-`));
  const checks = JSON.parse(readFileSync(join(outputDir, match.name, "checks.json"), "utf8"));
  const discovery = checks.find((check) => check.id === "sep-2575-server-implements-discover");
  const capabilities = discovery?.details?.result?.capabilities;
  if (!capabilities || typeof capabilities !== "object") {
    throw new Error("MCP 2026-07-28 server-stateless lacks discovery capability evidence for its skips");
  }
  const subscriptionDelivered = Boolean(
    capabilities.tools?.listChanged
      || capabilities.prompts?.listChanged
      || capabilities.resources?.listChanged
      || capabilities.resources?.subscribe,
  );
  if (subscriptionDelivered || capabilities.prompts?.listChanged !== false || capabilities.tools?.listChanged !== false) {
    throw new Error("MCP 2026-07-28 server-stateless skip evidence conflicts with advertised capabilities");
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
    activeConformanceChild = child;
    child.once("error", (error) => {
      activeConformanceChild = null;
      reject(error);
    });
    child.once("exit", (code, signal) => {
      activeConformanceChild = null;
      if (code === 0) resolve();
      else reject(new Error(`MCP ${revision} conformance failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function stopChild(child) {
  if (child === null) return;
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

async function stopChildrenAndReraise(signal, server) {
  await stopChild(activeConformanceChild);
  await stopChild(server);
  process.removeAllListeners(signal);
  process.kill(process.pid, signal);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
