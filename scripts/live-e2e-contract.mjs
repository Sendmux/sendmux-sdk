import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const resultStatuses = ["passed", "expected_negative", "unmet_precondition", "inapplicable", "failed"];
export const booleanGates = ["SENDMUX_LIVE_E2E", "SENDMUX_LIVE_E2E_FIXTURE_SETUP", "SENDMUX_LIVE_E2E_MUTATIONS", "SENDMUX_LIVE_E2E_BINARY", "SENDMUX_LIVE_E2E_STREAM", "SENDMUX_STAGING_SEND"];
export const stringConfiguration = ["SENDMUX_LIVE_E2E_FIXTURE_SEND_TO", "SENDMUX_LIVE_E2E_WEBHOOK_URL", "SENDMUX_LIVE_E2E_WEBHOOK_URL_ALLOWLIST"];
export const journalSelectors = ["data.id", "data.message_id", "data.mailbox.id", "data.credential.public_id", "data.request.id", "data.blob_id", "data.attachment_id", "data.upload_id", "data.expires_at"];
const attachmentKinds = new Set(["mailbox_blob", "sending_attachment"]);
const attachmentRetentionError = "Attachment reference/URL expiry does not establish storage cleanup; retention verification remains unmet";

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
  assert.ok(run.cleanup && typeof run.cleanup.ok === "boolean", "Missing cleanup outcome");
  validateRecoveryLedger({ ...run.cleanup, runId: run.cleanup.runId ?? runId }, { runId, sourceSha });
  assert.ok(!/https?:\/\//.test(JSON.stringify(run.fixture_proof)), "Public fixture evidence contains a URL");
  for (const resource of run.cleanup.resources) {
    if (resource.status === "captured") assert.ok(resource.kind === "self_delivery" && Array.isArray(resource.received_ids) && Number.isInteger(resource.expected_count), "Captured is only delivery evidence, not resource cleanup");
    if (resource.status === "expiry_only") assert.ok(resource.kind === "upload_intent" && resource.public_delete === false && resource.storage_cleanup === "no_uploaded_bytes" && typeof resource.url_expires_at === "string", "Expiry-only intent evidence must not claim uploaded-byte cleanup");
    if (resource.status === "storage_absent") validateFinalizedAttachmentResource(resource);
  }
  if (run.cleanup.ok) {
    assert.ok(run.cleanup.resources.every(item => ["absent", "restored", "expiry_only", "captured", "storage_absent"].includes(item.status)), "Cleanup success has unresolved resources");
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

export function validateRecoveryLedger(ledger, { runId, sourceSha } = {}) {
  assert.ok(runId, "Expected run ID is required");
  assert.match(runId, /^[a-zA-Z0-9_-]+$/, "Invalid expected run ID");
  assertKnownFields(ledger, ["ok", "runId", "sourceSha", "resources", "status"]);
  assert.equal(ledger.runId, runId, "Run ID provenance mismatch");
  if (ledger.sourceSha !== undefined) {
    assert.match(ledger.sourceSha, /^[0-9a-f]{40}$/, "Invalid recovery source SHA");
    if (sourceSha !== undefined) assert.equal(ledger.sourceSha, sourceSha, "Recovery source SHA provenance mismatch");
  }
  assert.ok(Array.isArray(ledger.resources), "Missing recovery resources");
  if (ledger.ok !== undefined) assert.equal(typeof ledger.ok, "boolean", "Invalid cleanup outcome");
  if (ledger.status !== undefined) assert.ok(["incomplete", "blocked_active_work"].includes(ledger.status), "Invalid recovery status");
  assert.ok(!/smx_(?:root|mbx|agent)_/.test(JSON.stringify(ledger)), "Recovery evidence contains a credential");
  assert.ok(!/https?:\/\//.test(JSON.stringify(ledger)), "Recovery evidence contains a URL");
  for (const resource of ledger.resources) {
    assertKnownFields(resource, ["operationId", "adapter", "kind", "id", "path", "status", "verification", "public_delete", "storage_cleanup", "url_expires_at", "reference_expires_at", "subject", "expected_count", "received_ids", "filename", "size_bytes", "sha256", "presence_observed_at", "absence_observed_at", "receipt_producer", "receipt_version", "receipt_source_sha"]);
    assert.ok(typeof resource.id === "string" && resource.id.length > 0 && typeof resource.status === "string", "Invalid resource identity/status");
    assert.ok(["pending", "pending_delivery", "unverified_delivery", "unverified_retention", "failed", "absent", "restored", "expiry_only", "captured", "storage_absent"].includes(resource.status), "Invalid resource status");
    for (const field of ["operationId", "adapter", "kind", "verification", "storage_cleanup", "url_expires_at", "reference_expires_at", "subject", "filename", "sha256", "presence_observed_at", "absence_observed_at", "receipt_producer", "receipt_version", "receipt_source_sha"]) if (resource[field] !== undefined) assert.ok(typeof resource[field] === "string", "Invalid resource metadata field");
    if (resource.size_bytes !== undefined) assert.ok(Number.isInteger(resource.size_bytes) && resource.size_bytes > 0, "Invalid resource byte length");
    if (resource.public_delete !== undefined) assert.ok(resource.public_delete === false, "Invalid public deletion claim");
    if (resource.expected_count !== undefined) assert.ok(Number.isInteger(resource.expected_count) && resource.expected_count > 0, "Invalid delivery count");
    if (resource.received_ids !== undefined) assert.ok(Array.isArray(resource.received_ids) && resource.received_ids.every(id => typeof id === "string" && id.length > 0), "Invalid received-message IDs");
    if (resource.path) {
      assertKnownFields(resource.path, ["public_id", "key_id", "folder_id", "message_id"]);
      assert.ok(Object.values(resource.path).every(value => typeof value === "string"), "Invalid resource path");
    }
  }
  return ledger;
}

export function finalizeRunWithAttachmentReceipt(result, receipt, { collectorSourceSha, runId, scenarios, sourceSha }) {
  validateRun(result, { runId, sourceSha, scenarios });
  assert.equal(result.run.cleanup.runId, runId, "Attachment finalisation requires a run-bound cleanup ledger");
  assert.equal(result.run.cleanup.sourceSha, sourceSha, "Attachment finalisation requires a source-bound cleanup ledger");
  validateAttachmentReceipt(receipt, { collectorSourceSha, fixtureProof: result.run.fixture_proof, runId, sourceSha });

  const finalized = structuredClone(result);
  const unresolved = finalized.run.cleanup.resources.filter(resource => resource.status === "unverified_retention");
  assert.ok(unresolved.length > 0, "Attachment receipt has no unresolved resources to finalize");
  const resourcesByIdentity = new Map(unresolved.map(resource => [attachmentIdentity(resource), resource]));
  assert.equal(resourcesByIdentity.size, unresolved.length, "Duplicate unresolved attachment identity");
  const observed = new Set();
  for (const observation of receipt.observations) {
    const identity = attachmentIdentity(observation);
    assert.ok(!observed.has(identity), "Duplicate attachment receipt observation");
    observed.add(identity);
    const resource = resourcesByIdentity.get(identity);
    assert.ok(resource, "Attachment receipt does not match an unresolved resource");
    for (const field of ["filename", "size_bytes", "sha256"]) assert.equal(observation[field], resource[field], `Attachment receipt ${field} mismatch`);
    Object.assign(resource, {
      absence_observed_at: observation.absence_observed_at,
      presence_observed_at: observation.presence_observed_at,
      receipt_producer: receipt.producer.name,
      receipt_source_sha: receipt.producer.source_sha,
      receipt_version: receipt.producer.version,
      status: "storage_absent",
      storage_cleanup: observation.cleanup_mode,
      verification: "trusted_storage_receipt",
    });
  }
  assert.equal(observed.size, unresolved.length, "Attachment receipt is missing an unresolved resource");
  finalized.run.cleanup.ok = finalized.run.cleanup.resources.every(resource => ["absent", "restored", "expiry_only", "captured", "storage_absent"].includes(resource.status));
  finalized.errors = (finalized.errors ?? []).filter(error => error !== attachmentRetentionError);
  finalized.ok = !finalized.results.some(item => ["failed", "unmet_precondition"].includes(item.status)) && finalized.run.cleanup.ok && finalized.errors.length === 0;
  validateRun(finalized, { runId, sourceSha, scenarios });
  return finalized;
}

function validateAttachmentReceipt(receipt, { collectorSourceSha, fixtureProof, runId, sourceSha }) {
  assertKnownFields(receipt, ["schema_version", "kind", "run_id", "source_sha", "fixture_proof", "producer", "observations"]);
  assert.equal(receipt.schema_version, 1, "Unsupported attachment receipt schema");
  assert.equal(receipt.kind, "sendmux-attachment-storage-receipt", "Invalid attachment receipt kind");
  assert.equal(receipt.run_id, runId, "Attachment receipt run ID mismatch");
  assert.equal(receipt.source_sha, sourceSha, "Attachment receipt source SHA mismatch");
  assert.deepEqual(receipt.fixture_proof, fixtureProof, "Attachment receipt fixture identity mismatch");
  assertKnownFields(receipt.producer, ["name", "version", "source_sha"]);
  assert.equal(receipt.producer.name, "sendmux-attachment-storage-collector", "Unexpected attachment receipt producer");
  assert.ok(typeof receipt.producer.version === "string" && receipt.producer.version.length > 0, "Missing attachment receipt producer version");
  assert.match(collectorSourceSha, /^[0-9a-f]{40}$/, "Expected collector source SHA is required");
  assert.equal(receipt.producer.source_sha, collectorSourceSha, "Attachment collector source SHA mismatch");
  assert.ok(Array.isArray(receipt.observations) && receipt.observations.length > 0, "Attachment receipt has no observations");
  assert.ok(!/smx_(?:root|mbx|agent)_/.test(JSON.stringify(receipt)), "Attachment receipt contains a credential");
  for (const observation of receipt.observations) {
    assertKnownFields(observation, ["operationId", "adapter", "kind", "id", "filename", "size_bytes", "sha256", "cleanup_mode", "presence", "presence_observed_at", "absence", "absence_observed_at", "runtime"]);
    assert.ok(attachmentKinds.has(observation.kind), "Invalid attachment receipt kind");
    for (const field of ["operationId", "adapter", "id", "filename"]) assert.ok(typeof observation[field] === "string" && observation[field].length > 0, `Invalid attachment receipt ${field}`);
    assert.ok(Number.isInteger(observation.size_bytes) && observation.size_bytes > 0, "Invalid attachment receipt byte length");
    assert.match(observation.sha256, /^[a-f0-9]{64}$/, "Invalid attachment receipt digest");
    assert.ok(["manual_delete", "scheduled_expiry"].includes(observation.cleanup_mode), "Invalid attachment cleanup mode");
    const expectedCleanupMode = observation.kind === "sending_attachment" ? "manual_delete" : "scheduled_expiry";
    assert.equal(observation.cleanup_mode, expectedCleanupMode, "Attachment cleanup mode does not match its storage surface");
    assert.equal(observation.presence, "present", "Attachment receipt lacks a positive presence observation");
    assert.equal(observation.absence, "not_found", "Attachment receipt lacks a privileged absence observation");
    assert.ok(Number.isFinite(Date.parse(observation.presence_observed_at)) && Number.isFinite(Date.parse(observation.absence_observed_at)) && Date.parse(observation.absence_observed_at) > Date.parse(observation.presence_observed_at), "Attachment receipt observation times are invalid");
    assertKnownFields(observation.runtime, ["context", "namespace", "pod_uid", "container", "image_id"]);
    for (const field of ["context", "namespace", "pod_uid", "container", "image_id"]) assert.ok(typeof observation.runtime[field] === "string" && observation.runtime[field].length > 0, `Missing attachment runtime ${field}`);
  }
  return receipt;
}

function validateFinalizedAttachmentResource(resource) {
  assert.ok(attachmentKinds.has(resource.kind), "Storage-absent status is only valid for byte attachments");
  assert.equal(resource.verification, "trusted_storage_receipt", "Storage absence lacks trusted receipt verification");
  assert.ok(["manual_delete", "scheduled_expiry"].includes(resource.storage_cleanup), "Invalid finalized attachment cleanup mode");
  assert.match(resource.sha256, /^[a-f0-9]{64}$/, "Invalid finalized attachment digest");
  assert.ok(Number.isInteger(resource.size_bytes) && resource.size_bytes > 0 && typeof resource.filename === "string" && resource.filename.length > 0, "Invalid finalized attachment metadata");
  assert.ok(Number.isFinite(Date.parse(resource.presence_observed_at)) && Number.isFinite(Date.parse(resource.absence_observed_at)) && Date.parse(resource.absence_observed_at) > Date.parse(resource.presence_observed_at), "Invalid finalized attachment observation times");
  assert.ok(typeof resource.receipt_producer === "string" && resource.receipt_producer.length > 0 && typeof resource.receipt_version === "string" && resource.receipt_version.length > 0, "Missing attachment receipt producer provenance");
  assert.match(resource.receipt_source_sha, /^[a-f0-9]{40}$/, "Invalid attachment receipt source SHA");
}

function attachmentIdentity(value) {
  return JSON.stringify([value.operationId, value.adapter, value.kind, value.id]);
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
