import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const resultStatuses = ["passed", "expected_negative", "unmet_precondition", "inapplicable", "failed"];
export const booleanGates = ["SENDMUX_LIVE_E2E", "SENDMUX_LIVE_E2E_FIXTURE_SETUP", "SENDMUX_LIVE_E2E_MUTATIONS", "SENDMUX_LIVE_E2E_BINARY", "SENDMUX_LIVE_E2E_STREAM", "SENDMUX_STAGING_SEND"];
export const stringConfiguration = ["SENDMUX_LIVE_E2E_FIXTURE_SEND_TO", "SENDMUX_LIVE_E2E_WEBHOOK_URL", "SENDMUX_LIVE_E2E_WEBHOOK_URL_ALLOWLIST"];
export const journalSelectors = ["data.id", "data.message_id", "data.mailbox.id", "data.credential.public_id", "data.request.id", "data.blob_id", "data.attachment_id", "data.upload_id", "data.expires_at"];

export function configurationFromEnv(env) {
  return { ...Object.fromEntries(booleanGates.map(name => [name, env[name] === "1"])), ...Object.fromEntries(stringConfiguration.map(name => {
    const value = env[name] ?? "";
    return [name, name.includes("URL") && value ? `sha256:${createHash("sha256").update(value).digest("hex")}` : value];
  })) };
}

export function expectedPairs(operationIds, adapters, scenarios) {
  assert.equal(new Set(operationIds).size, operationIds.length, "Duplicate selected operation");
  assert.equal(new Set(adapters).size, adapters.length, "Duplicate selected adapter");
  assert.ok(operationIds.length > 0 && adapters.length > 0, "Empty selected matrix");
  return operationIds.flatMap(operationId => {
    const scenario = scenarios[operationId];
    assert.ok(scenario, `Unknown selected operation ${operationId}`);
    return adapters.map(adapter => {
      assert.ok(["typescript", "python", "go", "php", "ruby", "cli", "mcp"].includes(adapter), `Unknown selected adapter ${adapter}`);
      const applicable = adapter === "mcp" ? Boolean(scenario.adapters.mcp) : adapter === "cli" ? scenario.adapters.cli === true : scenario.adapters.sdk.includes(adapter);
      return { adapter, operationId, applicable };
    });
  });
}

export function validateRun(result, { runId, sourceSha, scenarios }) {
  assert.ok(!/smx_(?:root|mbx|agent)_/.test(JSON.stringify(result)), "Runner evidence contains a credential");
  const run = result.run;
  assert.ok(run && run.id && run.source_sha, "Missing runner provenance");
  assert.ok(runId, "Expected run ID is required");
  assert.match(runId, /^[a-zA-Z0-9_-]+$/, "Invalid expected run ID");
  assert.equal(run.id, runId, "Run ID provenance mismatch");
  assert.match(run.source_sha, /^[0-9a-f]{40}$/);
  assert.equal(run.source_sha, sourceSha, "Source SHA provenance mismatch");
  assert.ok(Number.isFinite(Date.parse(run.started_at)) && Number.isFinite(Date.parse(run.ended_at)) && Date.parse(run.ended_at) >= Date.parse(run.started_at), "Invalid runner start/end timestamps");
  assert.ok(run.fixture_proof && typeof run.fixture_proof === "object", "Missing sanitized fixture proof");
  assertKnownFields(run, ["id", "source_sha", "started_at", "ended_at", "operation_ids", "adapters", "applicable_pairs", "configuration", "fixture_proof", "cleanup", "commit_sha", "generated_at", "source"]);
  assertKnownFields(run.fixture_proof, ["teamId", "mailboxId", "mailboxEmail", "surfaces"]);
  for (const field of ["teamId", "mailboxId", "mailboxEmail"]) if (run.fixture_proof[field] !== undefined) assert.ok(typeof run.fixture_proof[field] === "string", "Invalid fixture identity field");
  if (run.fixture_proof.surfaces !== undefined) assert.ok(Array.isArray(run.fixture_proof.surfaces) && run.fixture_proof.surfaces.every(value => ["management", "mailbox", "sending"].includes(value)), "Invalid fixture surfaces");
  assert.ok(run.cleanup && typeof run.cleanup.ok === "boolean" && Array.isArray(run.cleanup.resources), "Missing cleanup outcome");
  assertKnownFields(run.cleanup, ["ok", "runId", "resources", "status"]);
  for (const resource of run.cleanup.resources) {
    assertKnownFields(resource, ["operationId", "kind", "id", "path", "status", "verification", "public_delete", "storage_cleanup", "url_expires_at", "reference_expires_at", "subject", "expected_count", "received_ids"]);
    assert.ok(typeof resource.id === "string" && resource.id.length > 0 && typeof resource.status === "string", "Invalid resource identity/status");
    for (const field of ["operationId", "kind", "verification", "storage_cleanup", "url_expires_at", "reference_expires_at", "subject"]) if (resource[field] !== undefined) assert.ok(typeof resource[field] === "string", "Invalid resource metadata field");
    if (resource.public_delete !== undefined) assert.ok(resource.public_delete === false, "Invalid public deletion claim");
    if (resource.expected_count !== undefined) assert.ok(Number.isInteger(resource.expected_count) && resource.expected_count > 0, "Invalid delivery count");
    if (resource.received_ids !== undefined) assert.ok(Array.isArray(resource.received_ids) && resource.received_ids.every(id => typeof id === "string" && id.length > 0), "Invalid received-message IDs");
    if (resource.status === "captured") assert.ok(resource.kind === "self_delivery" && Array.isArray(resource.received_ids) && Number.isInteger(resource.expected_count), "Captured is only delivery evidence, not resource cleanup");
    if (resource.status === "expiry_only") assert.ok(resource.kind === "upload_intent" && resource.public_delete === false && resource.storage_cleanup === "no_uploaded_bytes" && typeof resource.url_expires_at === "string", "Expiry-only intent evidence must not claim uploaded-byte cleanup");
    if (resource.path) {
      assertKnownFields(resource.path, ["public_id", "key_id", "folder_id", "message_id"]);
      assert.ok(Object.values(resource.path).every(value => typeof value === "string"), "Invalid resource path");
    }
  }
  assert.ok(!/https?:\/\//.test(JSON.stringify({ proof: run.fixture_proof, resources: run.cleanup.resources })), "Public fixture evidence contains a URL");
  if (run.cleanup.ok) {
    assert.ok(run.cleanup.resources.every(item => ["absent", "restored", "expiry_only", "captured"].includes(item.status)), "Cleanup success has unresolved resources");
    for (const delivery of run.cleanup.resources.filter(item => item.kind === "self_delivery")) {
      assert.ok(delivery.received_ids.length >= delivery.expected_count && delivery.received_ids.every(id => run.cleanup.resources.some(item => item.id === id && item.status === "absent")), "Delivery cleanup lacks verified absence");
    }
  }
  if (result.results?.some(item => ["passed", "expected_negative"].includes(item.status))) {
    assert.ok(typeof run.fixture_proof.teamId === "string" && run.fixture_proof.teamId.length > 0 && Array.isArray(run.fixture_proof.surfaces), "Missing verified fixture identity");
  }
  for (const name of booleanGates) assert.equal(typeof run.configuration?.[name], "boolean", `Invalid Boolean gate ${name}`);
  assertKnownFields(run.configuration, [...booleanGates, ...stringConfiguration]);
  for (const name of stringConfiguration) assert.equal(typeof run.configuration?.[name], "string", `Invalid string configuration ${name}`);
  for (const name of stringConfiguration.filter(name => name.includes("URL"))) assert.match(run.configuration[name], /^(?:|sha256:[a-f0-9]{64})$/, "URL configuration must contain only a fingerprint");
  const pairs = expectedPairs(run.operation_ids, run.adapters, scenarios);
  assert.deepEqual(run.applicable_pairs, pairs.filter(pair => pair.applicable).map(({ applicable, ...pair }) => pair), "Applicable pair provenance mismatch");
  validateResultPairs(result.results, pairs);
  assert.equal(result.ok, !result.results.some(item => ["failed", "unmet_precondition"].includes(item.status)) && run.cleanup.ok && !(result.errors?.length), "Incorrect run success claim");
  return result;
}

function assertKnownFields(value, fields) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Malformed public evidence object");
  assert.ok(Object.keys(value).every(key => fields.includes(key)), "Unexpected field in sanitized public evidence");
}

export function validateResultPairs(results, expected) {
  assert.ok(Array.isArray(results), "Adapter results must be an array");
  const key = item => `${item.adapter}:${item.operationId}`;
  const required = new Map(expected.map(item => [key(item), item]));
  assert.equal(required.size, expected.length, "Duplicate expected result pair");
  const seen = new Set();
  for (const item of results) {
    assert.ok(item && typeof item === "object" && typeof item.adapter === "string" && typeof item.operationId === "string" && resultStatuses.includes(item.status), "Malformed adapter result");
    const identity = key(item);
    assert.ok(required.has(identity), `Unknown result pair ${identity}`);
    assert.ok(!seen.has(identity), `Duplicate result pair ${identity}`);
    seen.add(identity);
    const applicable = required.get(identity).applicable;
    if (applicable !== undefined) assert.equal(item.status === "inapplicable", !applicable, `Incorrect applicability for result pair ${identity}`);
    const expectedNegative = required.get(identity).expectedNegative;
    if (expectedNegative !== undefined && ["passed", "expected_negative"].includes(item.status)) assert.equal(item.status === "expected_negative", expectedNegative, `Incorrect success/expected-negative classification for ${identity}`);
  }
  assert.equal(seen.size, required.size, "Missing result pairs");
  return results;
}
