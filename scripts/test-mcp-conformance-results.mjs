import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertRequiredResults, requiredServerScenarios } from "./mcp-conformance.mjs";

const frozen = JSON.parse(readFileSync("scripts/mcp-conformance-required-checks.json", "utf8")).revisions;

assert.equal(requiredServerScenarios("2025-11-25").length, 30);
assert.equal(requiredServerScenarios("2026-07-28").length, 37);
assert.equal(requiredServerScenarios("2025-11-25")[0], "server-initialize");
assert.equal(requiredServerScenarios("2026-07-28")[0], "server-stateless");

for (const revision of ["2025-11-25", "2026-07-28"]) {
  withFixture(revision, (root) => {
    assert.deepEqual(
      assertRequiredResults(revision, root),
      revision === "2025-11-25"
        ? { SUCCESS: 70, INFO: 0, SKIPPED: 0 }
        : { SUCCESS: 114, INFO: 1, SKIPPED: 5 },
    );
  });
}

for (const mutation of [
  fabricateSuccess,
  redistributeSuccess,
  substituteStatus,
  emptyChecks,
  removeScenario,
]) {
  withFixture("2025-11-25", (root) => {
    mutation(root, "2025-11-25");
    assert.throws(() => assertRequiredResults("2025-11-25", root));
  });
}

for (const mutation of [duplicateSkip, moveSkip, removeCapabilityEvidence, contradictCapabilityEvidence]) {
  withFixture("2026-07-28", (root) => {
    mutation(root, "2026-07-28");
    assert.throws(() => assertRequiredResults("2026-07-28", root));
  });
}

function withFixture(revision, assertion) {
  const root = mkdtempSync(join(tmpdir(), "sendmux-mcp-conformance-"));
  try {
    for (const [scenario, identities] of Object.entries(frozen[revision])) {
      const directory = scenarioDirectory(root, scenario);
      mkdirSync(directory);
      const checks = identities.map((identity) => inflateCheck(identity, revision, scenario));
      writeFileSync(join(directory, "checks.json"), JSON.stringify(checks));
    }
    assertion(root);
  } finally {
    rmSync(root, { recursive: true });
  }
}

function inflateCheck(identity, revision, scenario) {
  const check = { id: identity.id, name: identity.name, status: identity.status };
  if (identity.fieldIssue !== undefined || identity.note !== undefined) {
    check.details = {};
    if (identity.fieldIssue !== undefined) check.details.fieldIssue = identity.fieldIssue;
    if (identity.note !== undefined) check.details.note = identity.note;
  }
  if (revision === "2026-07-28" && scenario === "server-stateless" && identity.id === "sep-2575-server-implements-discover") {
    check.details ??= {};
    check.details.result = {
      capabilities: {
        prompts: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
        tools: { listChanged: false },
      },
    };
  }
  return check;
}

function scenarioDirectory(root, scenario) {
  return join(root, `server-${scenario}-result`);
}

function readChecks(root, scenario) {
  return JSON.parse(readFileSync(join(scenarioDirectory(root, scenario), "checks.json"), "utf8"));
}

function writeChecks(root, scenario, checks) {
  writeFileSync(join(scenarioDirectory(root, scenario), "checks.json"), JSON.stringify(checks));
}

function fabricateSuccess(root, revision) {
  const scenario = requiredServerScenarios(revision)[0];
  const checks = readChecks(root, scenario);
  checks[0].id = "fabricated-success";
  writeChecks(root, scenario, checks);
}

function redistributeSuccess(root, revision) {
  const [source, destination] = requiredServerScenarios(revision);
  const sourceChecks = readChecks(root, source);
  const destinationChecks = readChecks(root, destination);
  destinationChecks.push(sourceChecks.pop());
  writeChecks(root, source, sourceChecks);
  writeChecks(root, destination, destinationChecks);
}

function substituteStatus(root, revision) {
  const scenario = requiredServerScenarios(revision)[0];
  const checks = readChecks(root, scenario);
  checks[0].status = "INFO";
  writeChecks(root, scenario, checks);
}

function emptyChecks(root, revision) {
  writeChecks(root, requiredServerScenarios(revision)[0], []);
}

function removeScenario(root, revision) {
  rmSync(scenarioDirectory(root, requiredServerScenarios(revision)[0]), { recursive: true });
}

function duplicateSkip(root) {
  const checks = readChecks(root, "server-stateless");
  const skip = checks.find((check) => check.status === "SKIPPED");
  checks.push(structuredClone(skip));
  writeChecks(root, "server-stateless", checks);
}

function moveSkip(root) {
  const destination = "completion-complete";
  const sourceChecks = readChecks(root, "server-stateless");
  const destinationChecks = readChecks(root, destination);
  const skipIndex = sourceChecks.findIndex((check) => check.status === "SKIPPED");
  destinationChecks.push(sourceChecks.splice(skipIndex, 1)[0]);
  writeChecks(root, "server-stateless", sourceChecks);
  writeChecks(root, destination, destinationChecks);
}

function removeCapabilityEvidence(root) {
  const checks = readChecks(root, "server-stateless");
  delete checks.find((check) => check.id === "sep-2575-server-implements-discover").details.result;
  writeChecks(root, "server-stateless", checks);
}

function contradictCapabilityEvidence(root) {
  const checks = readChecks(root, "server-stateless");
  checks.find((check) => check.id === "sep-2575-server-implements-discover").details.result.capabilities.tools.listChanged = true;
  writeChecks(root, "server-stateless", checks);
}

console.log("MCP conformance result accounting tests passed");
