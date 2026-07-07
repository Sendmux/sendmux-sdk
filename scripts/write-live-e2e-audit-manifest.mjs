#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const defaultManifestPath = "docs/live-e2e-audit-manifest.json";
const operationsPath = "packages/ts/cli/src/generated/operations.ts";
const scenarioPath = "test/live-e2e/scenarios.json";
const sdkAdapters = ["typescript", "python", "go", "php", "ruby"];
const groupedSurfaces = ["sdk", "cli", "mcp"];
const gateEnvNames = [
  "SENDMUX_LIVE_E2E",
  "SENDMUX_LIVE_E2E_FIXTURE_SETUP",
  "SENDMUX_LIVE_E2E_MUTATIONS",
  "SENDMUX_LIVE_E2E_BINARY",
  "SENDMUX_LIVE_E2E_STREAM",
  "SENDMUX_STAGING_SEND",
  "SENDMUX_LIVE_E2E_FIXTURE_SEND_TO",
  "SENDMUX_LIVE_E2E_WEBHOOK_URL",
  "SENDMUX_LIVE_E2E_WEBHOOK_URL_ALLOWLIST",
];
const customMcpOperations = [
  {
    operationId: "mailboxReadAttachment",
    surface: "mailbox",
  },
  {
    operationId: "mailboxWaitForMessage",
    surface: "mailbox",
  },
];

const args = parseArgs(process.argv.slice(2));

if (args.check) {
  const manifest = readJson(args.check);
  validateManifest(manifest);
  console.log(`Live E2E audit manifest is valid: ${args.check}`);
  process.exit(0);
}

if (!args.result) {
  throw new Error("Missing --result <path>.");
}

const manifest = buildManifest({
  commitSha: args.commit || gitSha(),
  generatedAt: args.generatedAt || new Date().toISOString(),
  result: readJson(args.result),
  source: args.source || "protected-live-e2e",
});

validateManifest(manifest);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote live E2E audit manifest to ${args.out}`);

function parseArgs(argv) {
  const parsed = {
    check: "",
    commit: "",
    generatedAt: "",
    out: defaultManifestPath,
    result: "",
    source: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      parsed.check = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--commit") {
      parsed.commit = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--generated-at") {
      parsed.generatedAt = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      parsed.out = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--result") {
      parsed.result = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--source") {
      parsed.source = requireArgValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireArgValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function buildManifest({ commitSha, generatedAt, result, source }) {
  const operations = loadOperations();
  const scenarios = readJson(scenarioPath).scenarios ?? {};
  const operationById = new Map(operations.map((operation) => [operation.operationId, operation]));
  const gates = gateStateFromEnv(process.env);
  const plan = livePlanForGates(gates);
  const results = result.results ?? [];

  assert.equal(result.ok, !results.some((item) => item.status === "failed"));
  assert.ok(results.length > 0, "Live E2E result has no adapter results.");

  return {
    schema_version: 1,
    kind: "sendmux-live-e2e-audit-manifest",
    note: "Sanitized audit record only: no API keys, bearer tokens, base URLs, request bodies, or response bodies.",
    run: {
      commit_sha: commitSha,
      generated_at: generatedAt,
      source,
    },
    ci_refresh: {
      workflow: ".github/workflows/live-e2e.yml",
      script: "scripts/write-live-e2e-audit-manifest.mjs",
      artifact_name: "live-e2e-audit-manifest",
    },
    gates: gates,
    operation_counts: {
      total: plan.summary.total,
      executable: plan.summary.executable,
      gated: plan.summary.gated,
      blocked: plan.summary.blocked,
      gated_by_risk: sortObject(plan.summary.gatedByRisk ?? {}),
    },
    result_summary: summariseResults(results, operationById, scenarios),
  };
}

function summariseResults(results, operationById, scenarios) {
  const summary = {
    total: emptyCounts(),
    surfaces: Object.fromEntries(groupedSurfaces.map((surface) => [surface, emptyCounts()])),
    adapters: {},
    product_lines: {},
  };

  for (const result of results) {
    const status = statusName(result.status);
    const adapter = result.adapter ?? "unknown";
    const adapterSurface = surfaceForAdapter(adapter);
    const operation = operationById.get(result.operationId);
    const productLine = operation?.surface ?? "unknown";

    increment(summary.total, status);
    increment(summary.surfaces[adapterSurface] ?? (summary.surfaces[adapterSurface] = emptyCounts()), status);
    increment(summary.adapters[adapter] ?? (summary.adapters[adapter] = emptyCounts()), status);
    increment(summary.product_lines[productLine] ?? (summary.product_lines[productLine] = emptyCounts()), status);

    if (adapter === "mcp" && result.status === "skipped") {
      assert.ok(!scenarios[result.operationId]?.adapters?.mcp);
    }
  }

  summary.adapters = sortObject(summary.adapters);
  summary.product_lines = sortObject(summary.product_lines);
  return summary;
}

function statusName(status) {
  if (status === "passed") return "passed";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "failed";
  throw new Error(`Unknown live E2E result status: ${status}`);
}

function surfaceForAdapter(adapter) {
  if (sdkAdapters.includes(adapter)) return "sdk";
  if (adapter === "cli") return "cli";
  if (adapter === "mcp") return "mcp";
  return "other";
}

function emptyCounts() {
  return { failed: 0, passed: 0, skipped: 0 };
}

function increment(counts, status) {
  counts[status] += 1;
}

function validateManifest(manifest) {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.kind, "sendmux-live-e2e-audit-manifest");
  assert.match(manifest.run.commit_sha, /^[0-9a-f]{40}$/);
  assert.match(
    manifest.run.generated_at,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  assert.ok(Number.isFinite(Date.parse(manifest.run.generated_at)));
  assert.ok(typeof manifest.run.source === "string" && manifest.run.source.length > 0);
  assert.doesNotMatch(JSON.stringify(manifest), /smx_(root|mbx)_/);

  const plan = livePlanForGates(manifest.gates);
  assert.deepEqual(manifest.operation_counts, {
    total: plan.summary.total,
    executable: plan.summary.executable,
    gated: plan.summary.gated,
    blocked: plan.summary.blocked,
    gated_by_risk: sortObject(plan.summary.gatedByRisk ?? {}),
  });

  const surfaceTotal = sumCounts(Object.values(manifest.result_summary.surfaces));
  assert.deepEqual(surfaceTotal, manifest.result_summary.total);
  const adapterTotal = sumCounts(Object.values(manifest.result_summary.adapters));
  assert.deepEqual(adapterTotal, manifest.result_summary.total);
  const productLineTotal = sumCounts(Object.values(manifest.result_summary.product_lines));
  assert.deepEqual(productLineTotal, manifest.result_summary.total);
}

function livePlanForGates(gates) {
  const result = spawnSync(process.execPath, ["scripts/run-live-e2e.mjs", "--plan", "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...envFromGates(gates),
      SENDMUX_LIVE_E2E_MAILBOX_API_KEY: "",
      SENDMUX_LIVE_E2E_ROOT_API_KEY: "",
      SENDMUX_STAGING_MAILBOX_API_KEY: "",
      SENDMUX_STAGING_ROOT_API_KEY: "",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function gateStateFromEnv(env) {
  return Object.fromEntries(gateEnvNames.map((name) => [name, isEnabled(env[name])]));
}

function envFromGates(gates) {
  return Object.fromEntries(gateEnvNames.map((name) => [name, gates[name] ? "1" : ""]));
}

function isEnabled(value) {
  return value === "1" || value === "true" || value === "yes";
}

function sumCounts(items) {
  return items.reduce((total, item) => {
    total.failed += item.failed;
    total.passed += item.passed;
    total.skipped += item.skipped;
    return total;
  }, emptyCounts());
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function loadOperations() {
  const source = readFileSync(operationsPath, "utf8");
  const match = source.match(/export const operations = ([\s\S]*?) as const satisfies/);
  if (!match) {
    throw new Error("Could not parse CLI operation manifest");
  }
  return [...Object.values(Function(`"use strict"; return (${match[1]});`)()), ...customMcpOperations];
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
