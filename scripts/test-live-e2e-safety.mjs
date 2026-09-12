import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import * as sdk from "@sendmux/sdk";
import { createFixtureRuntime, runAdapterStep, runLanguageSdkOperations, runMcpOperations, fetchWithTimeout, withAbortSignal, runChildHarness, selectOperations, buildOperationPlan, expectedCliErrorMatches, scenarios, operations, fixtures } from "./run-live-e2e.mjs";
import { existsSync, mkdirSync, mkdtempSync as createTempDirectory, readFileSync, rmSync as removePath, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { configurationFromEnv, expectedPairs, validateRun } from "./live-e2e-contract.mjs";

function mkdtempSync(prefix) {
  const path = createTempDirectory(prefix);
  console.log(JSON.stringify({ resource: "temp_directory", path, state: "created" }));
  return path;
}
function rmSync(path, options) {
  removePath(path, options);
  assert.equal(existsSync(path), false);
  console.log(JSON.stringify({ resource: "temp_directory", path, state: "absent" }));
}
function assertProcessGone(pid) {
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  console.log(JSON.stringify({ resource: "child", pid, state: "ESRCH" }));
}

async function withApi(handler, run, runtimeOptions = {}) {
  const ownedDirectory = runtimeOptions.ledgerPath ? undefined : mkdtempSync(join(tmpdir(), "sendmux-api-fixture-"));
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body });
    const result = handler(req, body);
    res.writeHead(result.status ?? 200, { "Content-Type": result.contentType ?? "application/json" });
    res.end(result.contentType === "text/plain" ? result.body : JSON.stringify(result.body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  console.log(JSON.stringify({ resource: "http_server", address, state: "listening" }));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
    await run({ requests, baseUrl, runtime: createFixtureRuntime({
      sdk, operations, fixtures, runId: "local-safety-test",
      ledgerPath: ownedDirectory ? join(ownedDirectory, "resources.json") : runtimeOptions.ledgerPath,
      credentials: { rootApiKey: "smx_root_test", mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl, sendingBaseUrl: baseUrl },
      ...runtimeOptions,
    }) });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(server.listening, false);
    console.log(JSON.stringify({ resource: "http_server", address, state: "closed" }));
    if (ownedDirectory) rmSync(ownedDirectory, { recursive: true });
  }
}
const envelope = data => ({ ok: true, data, meta: { request_id: "req_local_test" } });
const connection = (team = "team_expected", mailboxes = [{ id: "mbx_expected", email: "fixture@example.test" }]) =>
  envelope({ team: { id: team, name: "Local fixture" }, mailboxes, credential: { id: "key_test", type: "api_key", name: null }, permissions: [], label: "Local fixture" });
const expected = { teamId: "team_expected", mailboxId: "mbx_expected", mailboxEmail: "fixture@example.test" };
async function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("wrong team and wrong mailbox fail before fixture discovery or mutation", async () => {
  for (const response of [connection("team_other"), connection("team_expected", [])]) {
    await withApi(() => ({ body: response }), async ({ runtime, requests }) => {
      await assert.rejects(runtime.preflight({ teamId: "team_expected", mailboxId: "mbx_expected", mailboxEmail: "fixture@example.test" }), /identity|mailbox|team/i);
      assert.ok(requests.every(request => request.method === "GET" && ["/api/v1/me", "/api/v1/mailbox/connection"].includes(request.url)));
    });
  }
});

test("created IDs are persisted before a later failure and teardown reports 503 instead of suppressing it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-ledger-test-"));
  const ledgerPath = join(dir, "ledger.json");
  try {
    await withApi(req => {
      if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
      if (req.method === "POST") return { body: envelope({ id: "folder_owned" }) };
      return { status: 503, body: { ok: false, error: { code: "service_unavailable", message: "fixture unavailable", retryable: true }, meta: { request_id: "req_cleanup" } } };
    }, async ({ runtime }) => {
      await runtime.preflight(expected);
      await runtime.runOperation("mailboxCreateFolder", { body: { name: "local-owned" } });
      const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
      assert.equal(ledger.resources[0].id, "folder_owned");
      assert.equal(ledger.resources[0].status, "pending");
      await assert.rejects(runtime.teardown(), /teardown failed/);
      assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).resources[0].status, "failed");
    }, { ledgerPath });
  } finally { rmSync(dir, { recursive: true }); }
  for (const adapter of ["python", "go", "php", "ruby", "mcp"]) {
    const intentDir = mkdtempSync(join(tmpdir(), "sendmux-intent-journal-"));
    try {
      await withApi(req => ({ body: req.method === "GET" ? connection() : envelope({ upload_id: "upload_owned", upload_url: "https://storage.example.test/private-path?signature=private-secret", method: "PUT", expires_at: "2026-09-12T02:00:00Z", headers: { "Content-Type": "text/plain", "Content-Length": "1" }, max_size_bytes: 7500000 }) }), async ({ runtime, requests, baseUrl }) => {
        await runtime.preflight(expected);
        const operation = operations.find(item => item.operationId === "mailboxCreateAttachmentUpload");
        const request = { body: { content_type: "text/plain", filename: "fixture.txt", size_bytes: 1, ...(adapter === "mcp" ? { presign_upload_url: true } : {}) } };
        const journalPath = runtime.journalPath(adapter, operation.operationId);
        const input = { adapter, credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, operations: [operation], requests: new Map([[operation.operationId, { request, journalPath, recoverJournal: () => runtime.recoverJournal(journalPath, operation.operationId, request), afterResult() { throw new Error("later assertion failure"); } }]]) };
        await assert.rejects(adapter === "mcp" ? runMcpOperations(input) : runLanguageSdkOperations(input), /later assertion failure/);
        assert.doesNotMatch(readFileSync(journalPath, "utf8"), /private-path|private-secret|upload_url/);
        assert.doesNotMatch(readFileSync(join(intentDir, "resources.json"), "utf8"), /private-path|private-secret|upload_url/);
        assert.equal(runtime.ledger.resources[0].id, "upload_owned");
        assert.equal(runtime.ledger.resources[0].url_expires_at, "2026-09-12T02:00:00Z");
        assert.equal(runtime.ledger.resources[0].storage_cleanup, "no_uploaded_bytes");
        await runtime.teardown();
        assert.equal(runtime.ledger.resources[0].status, "expiry_only");
        assert.ok(requests.every(item => ["GET", "POST"].includes(item.method)));
      }, { ledgerPath: join(intentDir, "resources.json") });
    } finally { rmSync(intentDir, { recursive: true }); }
  }
});

test("missing expected identity fails without any API request", async () => {
  await withApi(() => ({ body: connection() }), async ({ runtime, requests }) => {
    await assert.rejects(runtime.preflight({}), /expected.*identity/i);
    assert.deepEqual(requests, []);
  });
});

test("every send operation rejects absent send authority and non-allowlisted recipients before HTTP", async () => {
  for (const operationId of ["mailboxSendMessage", "sendingSendEmail", "sendingSendEmailBatch"]) {
    for (const [gate, allowlist] of [["", "fixture@example.test"], ["1", "other@example.test"]]) {
      await withEnv({ SENDMUX_STAGING_SEND: gate, SENDMUX_LIVE_E2E_FIXTURE_SEND_TO: allowlist }, async () => {
        await withApi(req => ({ body: req.method === "GET" ? connection() : envelope({}) }), async ({ runtime, requests }) => {
          await runtime.preflight(expected);
          const body = operationId === "sendingSendEmailBatch" ? { messages: [{ to: { email: expected.mailboxEmail } }] } : { to: [{ email: expected.mailboxEmail }] };
          await assert.rejects(runtime.runOperation(operationId, { body }), /SENDMUX_STAGING_SEND|allowlist/);
          assert.ok(requests.every(request => request.method === "GET"));
        });
      });
    }
  }
});

test("language adapter runs substantive result assertions without cleanup selectors", async () => {
  for (const adapter of ["python", "go", "php", "ruby"]) {
  await withApi(() => ({ body: connection() }), async ({ baseUrl }) => {
    let assertionRan = false;
    const operation = operations.find(item => item.operationId === "managementGetConnection");
    const results = await runLanguageSdkOperations({
      adapter, operations: [operation],
      credentials: { rootApiKey: "smx_root_test", appBaseUrl: baseUrl, sendingBaseUrl: baseUrl },
      requests: new Map([[operation.operationId, { request: {}, afterResult(value) {
        assert.equal(value.data.team.id, "team_expected");
        assertionRan = true;
      } }]]),
    });
    assert.equal(assertionRan, true);
    assert.equal(results[0].status, "passed");
    assert.equal(results[0].result, undefined);
  });
  }
});

test("successful child exit cannot hide missing duplicate unknown or malformed result pairs", async () => {
  const operation = operations.find(item => item.operationId === "managementGetConnection");
  const valid = { adapter: "python", operationId: operation.operationId, status: "passed" };
  for (const results of [[], [valid, valid], [{ ...valid, operationId: "unknown" }], [{ ...valid, adapter: "cli" }], [null], [{ ...valid, status: "invented" }]]) {
    await assert.rejects(runLanguageSdkOperations({
      adapter: "python", credentials: {}, operations: [operation], requests: new Map(),
      command: { bin: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(JSON.stringify({ results }))})`] },
    }), /result|pair/i);
  }
});

test("timeout waits for late operation completion before cleanup can start", async () => {
  const events = [];
  await assert.rejects(withAbortSignal(async signal => {
    signal.addEventListener("abort", () => events.push("abort"));
    await new Promise(resolve => setTimeout(resolve, 40));
    events.push("finished");
  }, 5, "fixture timed out"), /timed out/);
  events.push("cleanup");
  assert.deepEqual(events, ["abort", "finished", "cleanup"]);
  const dir = mkdtempSync(join(tmpdir(), "sendmux-late-create-"));
  try {
    await withApi(req => {
      if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
      if (req.method === "POST") return { status: 201, body: envelope({ id: "folder_late" }) };
      return { status: 404, body: { ok: false, error: { code: "not_found", message: "absent", retryable: false }, meta: { request_id: "req_absent" } } };
    }, async ({ runtime }) => {
      await runtime.preflight(expected);
      await assert.rejects(withAbortSignal(() => runtime.runOperation("mailboxCreateFolder", { body: { name: "late fixture" } }), 5, "late create deadline"), /late create deadline/);
      assert.equal(runtime.ledger.resources[0].id, "folder_late");
      assert.equal(JSON.parse(readFileSync(join(dir, "resources.json"))).resources[0].id, "folder_late");
      await runtime.teardown();
      assert.equal(runtime.ledger.resources[0].status, "absent");
    }, { ledgerPath: join(dir, "resources.json"), sdk: { ...sdk, mailbox: { ...sdk.mailbox, createMailboxClient(options) {
      return sdk.mailbox.createMailboxClient({ ...options, fetch: async (input, init) => {
        const response = await fetch(input, { ...init, signal: new AbortController().signal });
        if (String(input.url ?? input).endsWith("/folders")) await new Promise(resolve => setTimeout(resolve, 40));
        return response;
      } });
    } } } });
  } finally { rmSync(dir, { recursive: true }); }
});

test("aborted child is closed and its exact PID is gone before returning", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  const result = await runChildHarness(process.execPath, ["-e", "console.log(process.pid); setInterval(() => {}, 1000)"], { env: process.env, timeout: 500, signal: controller.signal });
  clearTimeout(timer);
  assert.equal(result.aborted, true);
  const pid = Number(result.stdout.trim());
  assert.ok(Number.isInteger(pid) && pid > 0);
  assertProcessGone(pid);
  const missing = await runChildHarness("/nonexistent/sendmux-local-fixture", [], { env: process.env, timeout: 500 });
  assert.equal(missing.error.code, "ENOENT");
  const tree = await runChildHarness(process.execPath, ["-e", `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(JSON.stringify([process.pid,child.pid])); process.on('SIGTERM',()=>child.once('close',()=>process.exit(0))); setInterval(()=>{},1000);`], { env: process.env, timeout: 250 });
  assert.equal(tree.timedOut, true);
  for (const ownedPid of JSON.parse(tree.stdout)) assertProcessGone(ownedPid);
});

test("leader exit retains ownership until same-group descendants are gone", async () => {
  const observed = [];
  const clean = await runChildHarness(process.execPath, ["-e", "process.exit(0)"], { env: process.env, timeout: 1000 });
  assert.equal(clean.status, 0);
  assertProcessGone(clean.pid);
  for (const mode of ["closed_stdio", "held_stdio", "term_resistant"]) {
    let result;
    let pids;
    try {
      const descendant = `${mode === "term_resistant" ? "process.on('SIGTERM',()=>{});" : ""} setInterval(()=>{},1000); setTimeout(()=>process.exit(0),10000); process.send('ready');`;
      const code = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',${JSON.stringify(mode === "held_stdio" ? "inherit" : "ignore")},'ignore','ipc']}); child.once('message',()=>{console.log(JSON.stringify([process.pid,child.pid]));child.disconnect();process.exit(0);});`;
      result = await runChildHarness(process.execPath, ["-e", code], { env: process.env, timeout: 1000 });
      pids = JSON.parse(result.stdout);
      let descendantAlive = true;
      try { process.kill(pids[1], 0); } catch (error) { if (error.code !== "ESRCH") throw error; descendantAlive = false; }
      observed.push({ mode, descendantAlive, timedOut: result.timedOut });
    } finally {
      if (result?.pid) {
        try { process.kill(-result.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
        for (const pid of pids ?? [result.pid]) {
          for (let attempt = 0; attempt < 100; attempt++) {
            try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") break; throw error; }
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          assertProcessGone(pid);
        }
      }
    }
  }
  assert.deepEqual(observed, ["closed_stdio", "held_stdio", "term_resistant"].map(mode => ({ mode, descendantAlive: false, timedOut: false })));
});

test("all-gates default selects custom MCP operations with mailbox credential requirements", async () => {
  await withEnv({ SENDMUX_STAGING_SEND: "1", SENDMUX_LIVE_E2E_MUTATIONS: "1", SENDMUX_LIVE_E2E_BINARY: "1", SENDMUX_LIVE_E2E_STREAM: "1" }, () => {
    const selected = selectOperations(buildOperationPlan(operations, scenarios, fixtures), []);
    assert.equal(selected.length, 106);
    for (const id of ["mailboxReadAttachment", "mailboxWaitForMessage"]) assert.equal(selected.find(item => item.operationId === id)?.requiredKeyKind, "mailbox");
  });
});

test("local CLI error words never count as an expected API negative", () => {
  assert.equal(expectedCliErrorMatches({ stderr: "local profile conflict; no request sent", stdout: "" }, { expectedErrorCodes: ["conflict"] }), false);
  assert.equal(expectedCliErrorMatches({ stdout: JSON.stringify({ ok: false, error: { code: "conflict" } }) }, { expectedErrorCodes: ["conflict"] }), false);
});

test("expected API negative remains distinct from a successful capability", async () => {
  await withApi(() => ({ status: 409, body: { ok: false, error: { code: "conflict", message: "already exists", retryable: false }, meta: { request_id: "req_negative" } } }), async ({ baseUrl }) => {
    const operation = operations.find(item => item.operationId === "managementCreateDomain");
    const results = await runLanguageSdkOperations({
      adapter: "python", operations: [operation], credentials: { rootApiKey: "smx_root_test", appBaseUrl: baseUrl },
      requests: new Map([[operation.operationId, { expectedErrorCodes: ["conflict"], request: { body: { domain: "fixture.example.test" } } }]]),
    });
    assert.equal(results[0].status, "expected_negative");
  });
});

test("expected API negatives require nonempty request identity in every adapter", async () => {
  const observed = [];
  for (const adapter of ["python", "go", "php", "ruby", "mcp"]) {
    for (const requestId of ["req_negative", ""]) {
      await withApi(() => ({ status: 400, body: { ok: false, error: { code: "invalid_parameter", message: "local negative fixture", retryable: false }, meta: { request_id: requestId } } }), async ({ baseUrl, requests }) => {
        const operation = operations.find(item => item.operationId === (adapter === "mcp" ? "mailboxGetMessage" : "mailboxCreateFolder"));
        const run = adapter === "mcp" ? runMcpOperations : runLanguageSdkOperations;
        const results = await run({ adapter, operations: [operation], credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl },
          requests: new Map([[operation.operationId, { expectedErrorCodes: ["invalid_parameter"], request: adapter === "mcp" ? { path: { message_id: "local-negative" } } : { body: { name: "local-negative" } } }]]),
        });
        assert.equal(requests.length, 1);
        observed.push({ adapter, requestId, status: results[0].status });
      });
    }
  }
  for (const adapter of ["typescript", "cli"]) {
    for (const requestId of ["req_negative", ""]) {
      await withApi(req => ({ status: req.method === "POST" ? 409 : 200, body: req.method === "POST" ? { ok: false, error: { code: "conflict", message: "not requestable", retryable: false }, meta: { request_id: requestId } } : req.url.endsWith("/me") || req.url.endsWith("/connection") ? connection() : envelope({ sending_accounts: { can_request_increase: false } }) }), async ({ runtime, requests, baseUrl }) => {
        await runtime.preflight(expected);
        const results = await runAdapterStep({ adapter, fixtureRuntime: runtime, fixtures, operation: operations.find(item => item.operationId === "managementRequestSendingAccountLimitIncrease"), sdk, credentials: { rootApiKey: "smx_root_test", appBaseUrl: baseUrl } });
        assert.equal(requests.filter(request => request.method === "POST").length, 1);
        observed.push({ adapter, requestId, status: results[0].status });
      });
    }
  }
  assert.deepEqual(observed, ["python", "go", "php", "ruby", "mcp", "typescript", "cli"].flatMap(adapter => [
    { adapter, requestId: "req_negative", status: "expected_negative" },
    { adapter, requestId: "", status: "failed" },
  ]));
});

test("quota missing or requestable preconditions cause no external workflow", async () => {
  for (const flag of [undefined, true]) {
    await withApi(req => ({ body: req.url.endsWith("/me") || req.url.endsWith("/connection") ? connection() : envelope({ sending_accounts: { can_request_increase: flag } }) }), async ({ runtime, requests, baseUrl }) => {
      await runtime.preflight(expected);
      const operation = operations.find(item => item.operationId === "managementRequestSendingAccountLimitIncrease");
      const result = await runAdapterStep({ adapter: "typescript", fixtureRuntime: runtime, fixtures, operation, sdk, credentials: { rootApiKey: "smx_root_test", appBaseUrl: baseUrl } });
      assert.equal(result[0].status, "unmet_precondition");
      assert.ok(requests.every(request => request.method === "GET"));
    });
  }
  for (const adapter of ["typescript", "cli"]) {
    await withApi(req => ({ status: req.method === "POST" ? 409 : 200, body: req.method === "POST" ? { ok: false, error: { code: "conflict", message: "not requestable", retryable: false }, meta: { request_id: "req_quota" } } : req.url.endsWith("/me") || req.url.endsWith("/connection") ? connection() : envelope({ sending_accounts: { can_request_increase: false } }) }), async ({ runtime, requests, baseUrl }) => {
      await runtime.preflight(expected);
      const result = await runAdapterStep({ adapter, fixtureRuntime: runtime, fixtures, operation: operations.find(item => item.operationId === "managementRequestSendingAccountLimitIncrease"), sdk, credentials: { rootApiKey: "smx_root_test", appBaseUrl: baseUrl } });
      assert.equal(result[0].status, "expected_negative");
      assert.equal(requests.filter(request => request.method === "POST").length, 1);
    });
  }
});

test("audit writer refuses successful rows without runner provenance", () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-audit-test-"));
  try {
    const resultPath = join(dir, "result.json");
    writeFileSync(resultPath, JSON.stringify({ ok: true, results: [{ adapter: "typescript", operationId: "managementGetConnection", status: "passed" }] }));
    const result = spawnSync(process.execPath, ["scripts/write-live-e2e-audit-manifest.mjs", "--result", resultPath, "--out", join(dir, "manifest.json")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /provenance|run.id/i);
  } finally { rmSync(dir, { recursive: true }); }
});

test("forever ignored abort exits the CLI owner with durable incomplete ledger and no later work", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-fatal-test-"));
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts/run-live-e2e.mjs")).href;
    const code = `import {withAbortSignal, finishLiveRun} from ${JSON.stringify(moduleUrl)};
      console.log(process.pid);
      const report = {ok:true,run:{id:'fatal-local',cleanup:{ok:true,resources:[{id:'folder_owned',status:'pending'}]}}};
      try { await withAbortSignal(() => new Promise(() => { setInterval(() => {}, 1000); }), 10, 'ignored request timed out');
        console.log('NEXT_OPERATION');
      } catch { await finishLiveRun(report, ${JSON.stringify(dir)}); console.log('CLEANUP'); }`;
    const result = await runChildHarness(process.execPath, ["--input-type=module", "-e", code], { env: process.env, timeout: 8000 });
    assert.equal(result.timedOut, false);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /NEXT_OPERATION|CLEANUP/);
    const pid = Number(result.stdout.trim());
    assertProcessGone(pid);
    const ledger = JSON.parse(readFileSync(join(dir, "resources.json"), "utf8"));
    assert.equal(ledger.status, "incomplete");
    assert.equal(ledger.ok, false);
    assert.equal(ledger.resources[0].id, "folder_owned");
  } finally { rmSync(dir, { recursive: true }); }
});

test("signal denial preserves a bounded fatal report with the exact unconfirmed child", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-signal-denial-"));
  const pidPath = join(dir, "owned-child.pid");
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts/run-live-e2e.mjs")).href;
    const childCode = `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const code = `import {withAbortSignal, finishLiveRun, runChildHarness} from ${JSON.stringify(moduleUrl)};
      const originalKill = process.kill;
      process.kill = (pid, signal) => {
        if (pid < 0 && signal !== 0) throw Object.assign(new Error('private OS detail smx_agent_canary'), {code:'EPERM'});
        return originalKill(pid, signal);
      };
      console.log(process.pid);
      try { await withAbortSignal(signal => runChildHarness(process.execPath, ['-e', ${JSON.stringify(childCode)}], {env:process.env, timeout:60000, signal}), 100, 'owned child timed out');
        console.log('NEXT_OPERATION');
      } catch { await finishLiveRun({ok:true,run:{id:'signal-denied',cleanup:{ok:true,resources:[{id:'folder_owned',status:'pending'}]}}}, ${JSON.stringify(dir)}); console.log('CLEANUP'); }`;
    const result = await runChildHarness(process.execPath, ["--input-type=module", "-e", code], { env: process.env, timeout: 8000 });
    assertProcessGone(Number(result.stdout.trim()));
    assert.equal(result.timedOut, false);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /NEXT_OPERATION|CLEANUP/);
    const pid = Number(readFileSync(pidPath, "utf8"));
    const reportText = readFileSync(join(dir, "result.json"), "utf8");
    const report = JSON.parse(reportText);
    assert.equal(report.ok, false);
    assert.equal(report.run.cleanup.ok, false);
    assert.equal(report.run.cleanup.status, "blocked_active_work");
    assert.ok(report.errors.some(error => error.includes(String(pid)) && error.includes("EPERM")));
    assert.ok(report.errors.some(error => error.includes(String(pid)) && error.includes("unconfirmed")));
    assert.doesNotMatch(reportText, /private OS detail|smx_agent_canary/);
    const ledger = JSON.parse(readFileSync(join(dir, "resources.json"), "utf8"));
    assert.equal(ledger.status, "incomplete");
    assert.equal(ledger.resources[0].status, "pending");
  } finally {
    if (existsSync(pidPath)) {
      const pid = Number(readFileSync(pidPath, "utf8"));
      process.kill(-pid, "SIGTERM");
      for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") break; throw error; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assertProcessGone(pid);
    }
    rmSync(dir, { recursive: true });
  }
});

test("a child-owned timeout bounds signal denial without an outer operation deadline", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-own-timeout-"));
  const pidPath = join(dir, "child.pid");
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts/run-live-e2e.mjs")).href;
    const code = `import {runChildHarness,finishLiveRun} from ${JSON.stringify(moduleUrl)};
      const kill=process.kill; process.kill=(pid,signal)=>{if(pid<0&&signal!==0)throw Object.assign(new Error('private detail'),{code:'EPERM'});return kill(pid,signal);};
      console.log(process.pid);
      try {await runChildHarness(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{},1000);`)}],{env:process.env,timeout:100});console.log('NEXT_OPERATION');}
      catch {await finishLiveRun({ok:true,run:{id:'child-deadline',cleanup:{ok:true,resources:[]}}},${JSON.stringify(dir)});console.log('CLEANUP');}`;
    const result = await runChildHarness(process.execPath, ["--input-type=module", "-e", code], { env: process.env, timeout: 8000 });
    assertProcessGone(Number(result.stdout.trim()));
    assert.equal(result.timedOut, false);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /NEXT_OPERATION|CLEANUP/);
    const report = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    assert.equal(report.run.cleanup.status, "blocked_active_work");
    assert.ok(report.errors.some(error => error.includes("EPERM") && error.includes(readFileSync(pidPath, "utf8"))));
  } finally {
    if (existsSync(pidPath)) {
      const pid = Number(readFileSync(pidPath, "utf8"));
      try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") break; throw error; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assertProcessGone(pid);
    }
    rmSync(dir, { recursive: true });
  }
});

test("a timed-out child cannot certify success or an API negative by exiting zero", async context => {
  const originalDirectory = process.cwd();
  const observed = [];
  for (const mode of ["normal", "timeout"]) {
    for (const adapter of ["python", "mcp", "cli", "cli_negative"]) {
      const dir = mkdtempSync(join(tmpdir(), "sendmux-child-timeout-"));
      const pidPath = join(dir, "child.pid");
      let pending;
      let timerMock;
      try {
        await withApi(req => ({ body: req.url.endsWith("/me") || req.url.endsWith("/connection") ? connection() : envelope({ sending_accounts: { can_request_increase: false } }) }), async ({ runtime, baseUrl }) => {
          await runtime.preflight(expected);
          const negative = adapter === "cli_negative";
          const cli = adapter.startsWith("cli");
          const operation = operations.find(item => item.operationId === (negative ? "managementRequestSendingAccountLimitIncrease" : "managementGetConnection"));
          const output = negative ? { error: { name: "SendmuxApiError", code: "conflict", status: 409, requestId: "req_negative", body: { ok: false, error: { code: "conflict", message: "not requestable", retryable: false }, meta: { request_id: "req_negative" } } } } : cli ? connection() : { results: [{ adapter, operationId: operation.operationId, status: "passed" }] };
          const executable = join(dir, cli ? "packages/ts/cli/bin/run.js" : ".tmp/python-venv/bin/python");
          mkdirSync(join(dir, cli ? "packages/ts/cli/bin" : ".tmp/python-venv/bin"), { recursive: true });
          writeFileSync(executable, `#!${process.execPath}\nconst finish=()=>{console.log(${JSON.stringify(JSON.stringify(output))});process.exit(${negative ? 1 : 0});}; process.on('SIGTERM',finish); require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid)); ${mode === "normal" ? "finish();" : "setInterval(()=>{},1000);"}`, { mode: 0o700 });
          process.chdir(dir);
          const originalSetTimeout = globalThis.setTimeout;
          let triggerDeadline;
          if (mode === "timeout") timerMock = context.mock.method(globalThis, "setTimeout", (callback, milliseconds, ...args) => {
            const timer = originalSetTimeout(callback, milliseconds, ...args);
            if (milliseconds === (cli ? 30_000 : 90_000)) triggerDeadline = () => { clearTimeout(timer); callback(...args); };
            return timer;
          });
          const credentials = { rootApiKey: "smx_root_test", appBaseUrl: baseUrl };
          pending = cli ? runAdapterStep({ adapter: "cli", credentials, fixtureRuntime: runtime, fixtures, operation, sdk }) : (adapter === "mcp" ? runMcpOperations : runLanguageSdkOperations)({ adapter, credentials, operations: [operation], requests: new Map() });
          const readyDeadline = Date.now() + 5000;
          while (!existsSync(pidPath) && Date.now() < readyDeadline) await new Promise(resolve => originalSetTimeout(resolve, 10));
          assert.equal(existsSync(pidPath), true, "Owned child did not report readiness");
          if (mode === "timeout") { assert.equal(typeof triggerDeadline, "function"); triggerDeadline(); }
          const results = await pending;
          observed.push({ mode, adapter, status: results[0].status });
        });
      } finally {
        timerMock?.mock.restore();
        process.chdir(originalDirectory);
        if (existsSync(pidPath)) {
          const pid = Number(readFileSync(pidPath, "utf8"));
          try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
          await pending;
          assertProcessGone(pid);
        }
        rmSync(dir, { recursive: true });
      }
    }
  }
  assert.deepEqual(observed, ["normal", "timeout"].flatMap(mode => ["python", "mcp", "cli", "cli_negative"].map(adapter => ({ mode, adapter, status: mode === "timeout" ? "failed" : adapter === "cli_negative" ? "expected_negative" : "passed" }))));
});

test("CLI interruption retains available created IDs without certifying output or leaking stderr", async context => {
  const originalDirectory = process.cwd();
  const observed = [];
  for (const mode of ["normal", "interrupted", "malformed", "stderr"]) {
    const dir = mkdtempSync(join(tmpdir(), "sendmux-cli-recovery-"));
    const pidPath = join(dir, "child.pid");
    const removed = new Set();
    let pending;
    let timerMock;
    try {
      await withApi(req => {
        if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
        if (req.method === "POST") return { status: 201, body: envelope({ id: "folder_cli_owned", name: "private-body-canary smx_agent_canary https://uploads.example.test/signed", can_add_items: true, parent_id: null, role: null, sort_order: 0, total_messages: 0, unread_messages: 0 }) };
        if (req.method === "DELETE") { removed.add(req.url.split("/").at(-1)); return { body: envelope({ deleted: true, id: "folder_cli_owned" }) }; }
        return { status: 404, body: { ok: false, error: { code: "not_found", message: "absent", retryable: false }, meta: { request_id: "req_absent" } } };
      }, async ({ runtime, baseUrl, requests }) => {
        await runtime.preflight(expected);
        mkdirSync(join(dir, "packages/ts/cli/bin"), { recursive: true });
        const code = `const fs=require('node:fs'); (async()=>{
          let output='not-json';
          if(${JSON.stringify(mode)}==='normal'||${JSON.stringify(mode)}==='interrupted') output=await (await fetch(process.env.SENDMUX_BASE_URL+'/mailbox/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'fixture'})})).text();
          const finish=()=>{if(${JSON.stringify(mode)}==='stderr'){console.error('private-stderr-canary: confidential fixture body');process.exit(17);}console.log(output);process.exit(0);};
          process.on('SIGTERM',finish);fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));
          ${mode === "interrupted" ? "setInterval(()=>{},1000);" : "finish();"}
        })();`;
        writeFileSync(join(dir, "packages/ts/cli/bin/run.js"), code);
        process.chdir(dir);
        const originalSetTimeout = globalThis.setTimeout;
        let triggerDeadline;
        if (mode === "interrupted") timerMock = context.mock.method(globalThis, "setTimeout", (callback, milliseconds, ...args) => {
          const timer = originalSetTimeout(callback, milliseconds, ...args);
          if (milliseconds === 30_000) triggerDeadline = () => { clearTimeout(timer); callback(...args); };
          return timer;
        });
        pending = runAdapterStep({ adapter: "cli", credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, fixtureRuntime: runtime, fixtures, operation: operations.find(item => item.operationId === "mailboxCreateFolder"), sdk });
        const readyDeadline = Date.now() + 5000;
        while (!existsSync(pidPath) && Date.now() < readyDeadline) await new Promise(resolve => originalSetTimeout(resolve, 10));
        assert.equal(existsSync(pidPath), true);
        if (mode === "interrupted") { assert.equal(typeof triggerDeadline, "function"); triggerDeadline(); }
        const results = await pending;
        const beforeCleanup = runtime.ledger;
        if (mode === "interrupted") assert.equal(requests.filter(request => request.method === "DELETE").length, 0);
        await runtime.teardown();
        observed.push({ mode, status: results[0].status, knownId: beforeCleanup.resources[0]?.id ?? null, removed: [...removed], publicLeak: /private-body-canary|private-stderr-canary|smx_agent_canary|https:/.test(JSON.stringify({ results, ledger: runtime.ledger })) });
      }, { ledgerPath: join(dir, "resources.json") });
    } finally {
      timerMock?.mock.restore();
      process.chdir(originalDirectory);
      if (existsSync(pidPath)) {
        const pid = Number(readFileSync(pidPath, "utf8"));
        try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
        await pending;
        assertProcessGone(pid);
      }
      rmSync(dir, { recursive: true });
    }
  }
  assert.deepEqual(observed, ["normal", "interrupted", "malformed", "stderr"].map(mode => ({ mode, status: mode === "normal" ? "passed" : "failed", knownId: ["normal", "interrupted"].includes(mode) ? "folder_cli_owned" : null, removed: ["normal", "interrupted"].includes(mode) ? ["folder_cli_owned"] : [], publicLeak: false })));
});

test("malformed CLI JSON fails without publishing its private parser excerpt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-cli-malformed-"));
  const originalDirectory = process.cwd();
  try {
    mkdirSync(join(dir, "packages/ts/cli/bin"), { recursive: true });
    writeFileSync(join(dir, "packages/ts/cli/bin/run.js"), `require('node:fs').writeFileSync(${JSON.stringify(join(dir, "child.pid"))},String(process.pid));console.log('private-parser-canary confidential response');`);
    process.chdir(dir);
    const fixtureRuntime = createFixtureRuntime({ credentials: {}, fixtures, operations, runId: "parser-local", sdk, ledgerPath: join(dir, "resources.json") });
    const result = await runAdapterStep({ adapter: "cli", credentials: {}, fixtureRuntime, fixtures, operation: operations.find(item => item.operationId === "sendingGetOpenApiSpec"), sdk });
    assertProcessGone(Number(readFileSync(join(dir, "child.pid"), "utf8")));
    assert.equal(result[0].status, "failed");
    assert.doesNotMatch(JSON.stringify(result), /private-pa|confidential response/);
  } finally { process.chdir(originalDirectory); rmSync(dir, { recursive: true }); }
});

test("unsupported live platforms fail before execution while plans remain available", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-platform-"));
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts/run-live-e2e.mjs")).href;
    const code = `import {runLiveE2E,runChildHarness} from ${JSON.stringify(moduleUrl)};
      Object.defineProperty(process,'platform',{value:'win32'});
      await runLiveE2E(['--plan','--json']);
      let liveError,childError;
      try { await runLiveE2E([]); } catch(error) { liveError=error.message; }
      try { await runChildHarness(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(join(dir, "spawned"))},'unexpected')`)}],{env:process.env,timeout:1000}); } catch(error) {childError=error.message;}
      console.log(JSON.stringify({liveError,childError}));`;
    const result = await runChildHarness(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, SENDMUX_LIVE_E2E: "1", SENDMUX_LIVE_E2E_ROOT_API_KEY: "", SENDMUX_LIVE_E2E_MAILBOX_API_KEY: "" }, timeout: 5000 });
    assertProcessGone(result.pid);
    assert.equal(result.status, 0);
    const lines = result.stdout.trim().split("\n");
    const outcome = JSON.parse(lines.pop());
    assert.ok(JSON.parse(lines.join("\n")).selectedOperationIds.length > 0);
    assert.match(outcome.liveError ?? "", /requires Linux or macOS/);
    assert.match(outcome.childError ?? "", /requires Linux or macOS/);
    assert.equal(existsSync(join(dir, "spawned")), false);
  } finally { rmSync(dir, { recursive: true }); }
});

test("failed submission polling retains sender and delivered self-message cleanup without deleting unrelated mail", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-delivery-test-"));
  const deleted = new Set();
  const subject = "Sendmux live E2E submission local-safety-test";
  try {
    await withEnv({ SENDMUX_STAGING_SEND: "1", SENDMUX_LIVE_E2E_FIXTURE_SEND_TO: expected.mailboxEmail }, async () => {
      await withApi(req => {
        if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
        if (req.method === "POST") return { body: envelope({ message_id: "sent_owned" }) };
        if (req.url.includes("/submissions")) return { status: 503, body: { ok: false, error: { code: "service_unavailable", message: "poll failed", retryable: true }, meta: { request_id: "req_poll" } } };
        if (req.url.startsWith("/api/v1/mailbox/messages?")) return { body: { ...envelope([
          { id: "received_owned", subject, from: { email: expected.mailboxEmail }, to: [{ email: expected.mailboxEmail }] },
          { id: "unrelated", subject: "other subject", from: { email: expected.mailboxEmail }, to: [{ email: expected.mailboxEmail }] },
        ]), pagination: { next_cursor: null } } };
        const id = req.url.split("/").at(-1).split("?")[0];
        if (req.method === "DELETE") { deleted.add(id); return { body: envelope({}) }; }
        return deleted.has(id) ? { status: 404, body: { ok: false, error: { code: "not_found", message: "absent", retryable: false }, meta: { request_id: "req_absent" } } } : { body: envelope({ id }) };
      }, async ({ runtime }) => {
        await runtime.preflight(expected);
        await runtime.runOperation("mailboxSendMessage", { body: { subject, to: [{ email: expected.mailboxEmail }], text_body: "fixture" } });
        await assert.rejects(runtime.runOperation("mailboxListSubmissions", { query: { email_ids: "sent_owned" } }), /poll failed/);
        await runtime.teardown();
        assert.deepEqual([...deleted].sort(), ["received_owned", "sent_owned"]);
        assert.ok(runtime.ledger.resources.filter(row => row.id === "sent_owned" || row.id === "received_owned").every(row => row.status === "absent"));
      }, { ledgerPath: join(dir, "resources.json") });
    });
  } finally { rmSync(dir, { recursive: true }); }
});

test("signal cancellation leaves report persistence to the CLI owner after cleanup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-signal-test-"));
  try {
    const moduleUrl = pathToFileURL(join(process.cwd(), "scripts/run-live-e2e.mjs")).href;
    const code = `import {withAbortSignal, finishLiveRun, installTeardownSignalHandlers} from ${JSON.stringify(moduleUrl)};
      console.log(process.pid);
      let once; const cleanup = () => once ??= new Promise(resolve => setTimeout(() => { console.log('CLEANUP'); resolve(); }, 10));
      const remove = installTeardownSignalHandlers(cleanup);
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 100);
      try { await withAbortSignal(signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))), 3000, 'timeout'); }
      catch {} finally { remove(); await cleanup(); }
      await finishLiveRun({ok:false,run:{id:'signal-local',cleanup:{ok:true,resources:[]}}}, ${JSON.stringify(dir)});`;
    const result = await runChildHarness(process.execPath, ["--input-type=module", "-e", code], { env: process.env, timeout: 4000 });
    assert.equal(result.timedOut, false);
    assert.equal(result.status, 143);
    assert.equal(JSON.parse(readFileSync(join(dir, "result.json"), "utf8")).ok, false);
    const pid = Number(result.stdout.split("\n")[0]);
    assertProcessGone(pid);
  } finally { rmSync(dir, { recursive: true }); }
});

test("MCP text results reach substantive callbacks without cleanup selectors", async () => {
  await withApi(() => ({ body: "example.test. IN TXT fixture", contentType: "text/plain" }), async ({ baseUrl }) => {
    const operation = operations.find(item => item.operationId === "managementGetDomainZoneFile");
    let called = false;
    const results = await runMcpOperations({ credentials: { rootApiKey: "smx_root_test", appBaseUrl: baseUrl }, operations: [operation], requests: new Map([[operation.operationId, {
      request: { path: { public_id: "dom_owned" } }, afterResult(value) { assert.equal(value, "example.test. IN TXT fixture"); called = true; },
    }]]) });
    assert.equal(results[0].status, "passed");
    assert.equal(called, true);
  });
  await withApi(() => ({ body: envelope([]) }), async ({ baseUrl }) => {
    let called = false;
    const operation = operations.find(item => item.operationId === "mailboxWaitForMessage");
    const results = await runMcpOperations({ credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, operations: [operation], requests: new Map([[operation.operationId, {
      request: { query: { timeout_seconds: 1, subject: "fixture" } }, afterResult(value) { assert.equal(value.ok, true); assert.equal(value.data.message, null); called = true; },
    }]]) });
    assert.equal(results[0].status, "passed");
    assert.equal(called, true);
  });
});

test("Python and PHP changes certification uses typed public JSON results", async () => {
  for (const adapter of ["python", "php"]) {
    const operation = operations.find(item => item.operationId === "mailboxGetChanges");
    await withApi(() => ({ body: envelope({ invalid_schema: true }) }), async ({ baseUrl }) => {
      const results = await runLanguageSdkOperations({ adapter, operations: [operation], credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, requests: new Map([[operation.operationId, { request: {} }]]) });
      assert.equal(results[0].status, "failed", `${adapter} must reject a body matching neither public response model`);
    });
    for (const data of [
      { created: [], destroyed: [], updated: [], has_more: false, old_state: null, new_state: "state_fixture" },
      { types: { messages: { created: [], destroyed: [], updated: [], has_more: false, old_state: null, new_state: "state_fixture" } } },
    ]) {
      await withApi(() => ({ body: envelope(data) }), async ({ baseUrl }) => {
        let called = false;
        const results = await runLanguageSdkOperations({ adapter, operations: [operation], credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, requests: new Map([[operation.operationId, { request: {}, afterResult(value) { assert.deepEqual(value.data, data); called = true; } }]]) });
        assert.equal(results[0].status, "passed");
        assert.equal(called, true);
      });
    }
  }
  for (const async of [false, true]) {
    for (const data of [
      { created: [], destroyed: [], updated: [], has_more: false, old_state: null, new_state: "state_fixture" },
      { types: { messages: { created: [], destroyed: [], updated: [], has_more: false, old_state: null, new_state: "state_fixture" } } },
    ]) {
      await withApi(() => ({ body: envelope(data) }), async ({ baseUrl }) => {
        const code = `require 'vendor/autoload.php'; $api=Sendmux\\Mailbox\\ClientFactory::createMailboxAPIApi(getenv('FIXTURE_KEY'),getenv('FIXTURE_URL')); $value=$api->${async ? "mailboxGetChangesAsync()->wait()" : "mailboxGetChanges()"}; echo json_encode($value);`;
        const result = await runChildHarness("php", ["-r", code], { env: { ...process.env, FIXTURE_KEY: "smx_mbx_test", FIXTURE_URL: baseUrl }, timeout: 2000 });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout).data, data);
      });
    }
    await withApi(() => ({ status: 400, body: { ok: false, error: { code: "validation_error", message: "Fixture error", retryable: false }, meta: { request_id: "req_error" } } }), async ({ baseUrl }) => {
      const code = `require 'vendor/autoload.php'; $api=Sendmux\\Mailbox\\ClientFactory::createMailboxAPIApi(getenv('FIXTURE_KEY'),getenv('FIXTURE_URL')); try {$api->${async ? "mailboxGetChangesAsync()->wait()" : "mailboxGetChanges()"}; exit(2);} catch (Sendmux\\Mailbox\\ApiException $e) {echo $e->getCode();}`;
      const result = await runChildHarness("php", ["-r", code], { env: { ...process.env, FIXTURE_KEY: "smx_mbx_test", FIXTURE_URL: baseUrl }, timeout: 2000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "400");
    });
  }
});

test("HTTP deadlines include body consumption and abort stalled bodies before cleanup", async () => {
  let closedBody;
  let streamHandshake = false;
  let closedStream;
  const closed = new Promise(resolve => { closedBody = resolve; });
  const server = createServer((req, res) => {
    if (req.url.startsWith("/api/v1/mailbox/events")) {
      res.once("close", () => closedStream());
      if (!streamHandshake) { res.writeHead(200, { "Content-Type": "text/event-stream" }); res.write(": fixture heartbeat\n\n"); }
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("first-");
    if (req.url === "/complete") setTimeout(() => res.end("last"), 25);
    else res.once("close", closedBody);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await withAbortSignal(() => fetchWithTimeout(`${base}/complete`, "complete body"), 500, "body deadline");
    assert.equal(await response.text(), "first-last");
    const started = Date.now();
    await assert.rejects(withAbortSignal(() => fetchWithTimeout(`${base}/stall`, "stalled body"), 50, "body deadline"), /body deadline/);
    await closed;
    assert.ok(Date.now() - started < 1000, "stalled response must close within the cancellation budget");
    for (const handshake of [false, true]) {
      streamHandshake = handshake;
      const streamClosed = new Promise(resolve => { closedStream = resolve; });
      const dir = mkdtempSync(join(tmpdir(), "sendmux-sse-deadline-"));
      try {
        const credentials = { mailboxApiKey: "smx_mbx_test", appBaseUrl: `${base}/api/v1` };
        const runtime = createFixtureRuntime({ credentials, fixtures, operations, runId: "sse-fixture", sdk, ledgerPath: join(dir, "resources.json") });
        await assert.rejects(withAbortSignal(() => runAdapterStep({ adapter: "typescript", credentials, fixtureRuntime: runtime, fixtures, operation: operations.find(item => item.operationId === "mailboxStreamEvents"), sdk }), 100, "SSE fixture deadline"), /SSE fixture deadline/);
        await streamClosed;
        await runtime.teardown();
      } finally { rmSync(dir, { recursive: true }); }
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(server.listening, false);
  }
});

test("fresh provenance refuses pending cleanup and secret-bearing fixture configuration", () => {
  const configuration = configurationFromEnv({ SENDMUX_LIVE_E2E_WEBHOOK_URL: "https://user:password@example.test/hook/private-token?signature=signed-secret" });
  assert.doesNotMatch(JSON.stringify(configuration), /password|private-token|signed-secret/);
  assert.equal(typeof configuration.SENDMUX_LIVE_E2E_WEBHOOK_URL, "string");
  const sourceSha = "a".repeat(40);
  const pairs = expectedPairs(["managementGetConnection"], ["typescript"], scenarios);
  const result = { ok: true, results: [{ adapter: "typescript", operationId: "managementGetConnection", status: "passed" }], run: {
    id: "fresh-run", source_sha: sourceSha, started_at: "2026-09-12T00:00:00.000Z", ended_at: "2026-09-12T00:01:00.000Z",
    operation_ids: ["managementGetConnection"], adapters: ["typescript"], applicable_pairs: pairs.map(({ applicable, ...pair }) => pair),
    configuration, fixture_proof: { teamId: "team_expected", surfaces: ["management"] }, cleanup: { ok: true, resources: [] },
  } };
  assert.equal(validateRun(result, { runId: "fresh-run", sourceSha, scenarios }), result);
  for (const mutate of [
    value => { value.run.id = "old-run"; },
    value => { value.run.source_sha = "b".repeat(40); },
    value => { value.run.ended_at = "invalid"; },
    value => { value.run.applicable_pairs = []; },
    value => { value.run.cleanup.resources = [{ id: "folder_owned", status: "pending" }]; },
    value => { value.run.fixture_proof = {}; },
    value => { value.run.configuration.SENDMUX_LIVE_E2E_FIXTURE_SEND_TO = true; },
    value => { value.run.fixture_proof.response_body = { secret: "private" }; },
    value => { value.run.cleanup.resources = [{ id: "owned", status: "absent", upload_url: "https://example.test/signed?secret=private" }]; },
    value => { value.run.fixture_proof.mailboxEmail = { body: "private-message" }; },
    value => { value.run.cleanup.resources = [{ id: { body: "private-message" }, status: "absent" }]; },
    value => { value.run.cleanup.resources = [{ id: "smx_agent_private_canary", status: "absent" }]; },
    value => { value.run.cleanup.resources = [{ id: "owned", status: "captured" }]; },
    value => { value.run.cleanup.resources = [{ id: "owned", kind: "mailbox_blob", status: "expiry_only", public_delete: false, storage_cleanup: "unverified" }]; },
  ]) {
    const invalid = structuredClone(result); mutate(invalid);
    assert.throws(() => validateRun(invalid, { runId: "fresh-run", sourceSha, scenarios }));
  }
});

test("workflow runner or writer failure cannot authorize a historical audit upload", () => {
  const parsed = spawnSync(".tmp/python-venv/bin/python", ["-c", "import json,yaml; print(json.dumps(yaml.safe_load(open('.github/workflows/live-e2e.yml'))))"], { encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
  const steps = JSON.parse(parsed.stdout).jobs["read-only"].steps;
  const certification = steps.find(step => step.id === "certification");
  const dir = mkdtempSync(join(tmpdir(), "sendmux-workflow-test-"));
  try {
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, "docs"));
    const historical = join(dir, "docs", "live-e2e-audit-manifest.json");
    writeFileSync(historical, "historical evidence");
    writeFileSync(join(dir, "bin", "node"), "#!/bin/sh\nexit 27\n", { mode: 0o700 });
    const output = join(dir, "output");
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-e", "-c", certification.run], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, SENDMUX_LIVE_E2E_ADAPTERS: "sdk", SENDMUX_LIVE_E2E_OPERATIONS: "", SENDMUX_LIVE_E2E_RUN_ID: "fresh-run", GITHUB_OUTPUT: output, GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "fixture" } });
    assert.equal(result.status, 27);
    assert.equal(readFileSync(output, "utf8"), "");
    assert.equal(readFileSync(historical, "utf8"), "historical evidence");
    assert.equal(existsSync(join(dir, ".tmp", "live-e2e", "fresh-run", "audit-manifest.json")), false);
    const upload = steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
    assert.equal(upload.if, "${{ always() && steps.certification.outputs.manifest_written == 'true' }}");
    assert.equal(upload.with.path, ".tmp/live-e2e/${{ env.SENDMUX_LIVE_E2E_RUN_ID }}/audit-manifest.json");
  } finally { rmSync(dir, { recursive: true }); }
});

test("audit writer defaults to a fresh run path and refuses overwrites", () => {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-writer-path-"));
  try {
    for (const folder of ["docs", "scripts"]) mkdirSync(join(dir, folder));
    for (const folder of ["packages", "test"]) symlinkSync(join(process.cwd(), folder), join(dir, folder), "dir");
    for (const file of ["run-live-e2e.mjs", "live-e2e-contract.mjs"]) writeFileSync(join(dir, "scripts", file), readFileSync(join("scripts", file)));
    const historical = join(dir, "docs", "live-e2e-audit-manifest.json");
    writeFileSync(historical, "historical evidence");
    const resultPath = join(dir, "result.json");
    writeFileSync(resultPath, JSON.stringify({ ok: true, results: [{ adapter: "typescript", operationId: "managementGetConnection", status: "passed" }], run: {
      id: "fresh-run", source_sha: "a".repeat(40), started_at: "2026-09-12T00:00:00.000Z", ended_at: "2026-09-12T00:01:00.000Z",
      operation_ids: ["managementGetConnection"], adapters: ["typescript"], applicable_pairs: [{ adapter: "typescript", operationId: "managementGetConnection" }],
      configuration: configurationFromEnv({}), fixture_proof: { teamId: "team_expected", surfaces: ["management"] }, cleanup: { ok: true, resources: [] },
    } }));
    const args = [join(process.cwd(), "scripts/write-live-e2e-audit-manifest.mjs"), "--result", resultPath, "--run-id", "fresh-run", "--commit", "a".repeat(40)];
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(historical, "utf8"), "historical evidence");
    const fresh = JSON.parse(readFileSync(join(dir, ".tmp/live-e2e/fresh-run/audit-manifest.json"), "utf8"));
    assert.equal(fresh.run.id, "fresh-run");
    assert.notEqual(spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" }).status, 0);
    assert.notEqual(spawnSync(process.execPath, [...args, "--out", historical], { cwd: dir, encoding: "utf8" }).status, 0);
    assert.equal(readFileSync(historical, "utf8"), "historical evidence");
    const unsafeResult = JSON.parse(readFileSync(resultPath, "utf8"));
    unsafeResult.run.cleanup.resources = [{ id: "smx_agent_private_canary", status: "absent" }];
    writeFileSync(resultPath, JSON.stringify(unsafeResult));
    const unsafePath = join(dir, "unsafe-audit.json");
    const refused = spawnSync(process.execPath, [...args, "--out", unsafePath], { cwd: dir, encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.equal(existsSync(unsafePath), false);
    assert.doesNotMatch(refused.stdout + refused.stderr, /smx_agent_private_canary/);
  } finally { rmSync(dir, { recursive: true }); }
});

test("a child success cannot masquerade as expected-negative and its created ID survives assertion failure", async () => {
  for (const adapter of ["python", "php", "ruby"]) {
  const dir = mkdtempSync(join(tmpdir(), "sendmux-child-journal-"));
  let removed = false;
  try {
    await withApi(req => {
      if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
      if (req.method === "POST") return { status: 201, body: envelope({ id: "folder_journal", can_add_items: true, name: "fixture", parent_id: null, role: null, sort_order: 0, total_messages: 0, unread_messages: 0 }) };
      if (req.method === "DELETE") { removed = true; return { body: envelope({}) }; }
      return { status: 404, body: { ok: false, error: { code: "not_found", message: "absent", retryable: false }, meta: { request_id: "req_absent" } } };
    }, async ({ runtime, baseUrl }) => {
      await runtime.preflight(expected);
      const operation = operations.find(item => item.operationId === "mailboxCreateFolder");
      const request = { body: { name: "fixture" } };
      const journalPath = runtime.journalPath(adapter, operation.operationId);
      await assert.rejects(runLanguageSdkOperations({ adapter, operations: [operation], credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, requests: new Map([[operation.operationId, {
        request, expectedErrorCodes: ["conflict"], journalPath, recoverJournal: () => runtime.recoverJournal(journalPath, operation.operationId, request),
      }]]) }), /classification/);
      assert.equal(runtime.ledger.resources[0].id, "folder_journal");
      assert.equal(runtime.ledger.resources[0].status, "pending");
      await runtime.teardown();
      assert.equal(removed, true);
      assert.equal(runtime.ledger.resources[0].status, "absent");
    }, { ledgerPath: join(dir, "resources.json") });
  } finally { rmSync(dir, { recursive: true }); }
  }
});

test("JSON plans bind explicit selection to exactly its applicable pairs", () => {
  const result = spawnSync(process.execPath, ["scripts/run-live-e2e.mjs", "--plan", "--json", "--adapter", "typescript", "--operation", "managementGetConnection"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.selectedOperationIds, ["managementGetConnection"]);
  assert.deepEqual(plan.applicablePairs, [{ adapter: "typescript", operationId: "managementGetConnection" }]);
  assert.equal(plan.summary.total, 106);
});

test("mailbox key cleanup verifies the exact revocation receipt without inventing a read endpoint", async () => {
  for (const receipt of [{ deleted: true, id: "key_owned" }, { deleted: false, id: "key_owned" }, { deleted: true, id: "key_other" }]) {
    const dir = mkdtempSync(join(tmpdir(), "sendmux-key-cleanup-"));
    try {
      await withApi(req => {
        if (req.method === "GET") return { body: connection() };
        if (req.method === "DELETE") return { body: envelope(receipt) };
        return { status: 201, body: envelope({ credential: { public_id: "key_owned", secret: "smx_mbx_private_test" } }) };
      }, async ({ runtime }) => {
        await runtime.preflight(expected);
        await runtime.runOperation("managementCreateMailboxKey", { path: { public_id: "mailbox_owned" }, body: { app_name: "fixture" } });
        if (receipt.deleted && receipt.id === "key_owned") {
          await runtime.teardown();
          assert.equal(runtime.ledger.resources[0].status, "absent");
          assert.equal(runtime.ledger.resources[0].verification, "exact_revocation_receipt");
        } else {
          await assert.rejects(runtime.teardown(), /revocation receipt/);
          assert.equal(runtime.ledger.resources[0].status, "failed");
        }
        assert.doesNotMatch(readFileSync(join(dir, "resources.json"), "utf8"), /smx_mbx_private_test/);
      }, { ledgerPath: join(dir, "resources.json") });
    } finally { rmSync(dir, { recursive: true }); }
  }
});

test("cleanup requires nonempty request identity for delete and absence readback", async () => {
  const observed = [];
  for (const boundary of ["folder_delete", "folder_read", "key_delete"]) {
    for (const requestId of ["req_absent", ""]) {
      await withApi(req => {
        if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
        if (req.method === "POST") return { status: 201, body: envelope(boundary === "key_delete" ? { credential: { public_id: "key_owned", secret: "smx_mbx_private_test" } } : { id: "folder_owned", name: "Fixture", can_add_items: true, parent_id: null, role: null, sort_order: 0, total_messages: 0, unread_messages: 0 }) };
        if (req.method === "DELETE" && boundary === "folder_read") return { body: envelope({ deleted: true, id: "folder_owned" }) };
        return { status: 404, body: { ok: false, error: { code: "not_found", message: "Fixture is absent", retryable: false }, meta: { request_id: requestId } } };
      }, async ({ runtime }) => {
        await runtime.preflight(expected);
        await runtime.runOperation(boundary === "key_delete" ? "managementCreateMailboxKey" : "mailboxCreateFolder", boundary === "key_delete" ? { path: { public_id: "mailbox_owned" }, body: { app_name: "Fixture" } } : { body: { name: "Fixture" } });
        try { await runtime.teardown(); } catch (error) { assert.match(error.message, /teardown failed/); }
        observed.push({ boundary, requestId, status: runtime.ledger.resources[0].status });
      });
    }
  }
  assert.deepEqual(observed, ["folder_delete", "folder_read", "key_delete"].flatMap(boundary => [
    { boundary, requestId: "req_absent", status: "absent" },
    { boundary, requestId: "", status: "failed" },
  ]));
});

test("known upload intent IDs survive missing expiry without claiming retention proof", async () => {
  for (const expiresAt of ["2026-09-12T13:00:00Z", undefined]) {
    const dir = mkdtempSync(join(tmpdir(), "sendmux-intent-expiry-"));
    try {
      await withApi(req => ({ body: req.method === "GET" ? connection() : envelope({ upload_id: "upload_owned", expires_at: expiresAt, upload_url: "https://uploads.example.test/private-signature", method: "PUT", headers: { "Content-Type": "text/plain", "Content-Length": "1" }, max_size_bytes: 1 }) }), async ({ runtime, requests }) => {
        await runtime.preflight(expected);
        const operation = runtime.runOperation("mailboxCreateAttachmentUpload", { body: { filename: "fixture.txt", content_type: "text/plain", size_bytes: 1 } });
        if (expiresAt) await operation; else await assert.rejects(operation, /retention expiry/);
        const ledgerText = readFileSync(join(dir, "resources.json"), "utf8");
        const resource = JSON.parse(ledgerText).resources[0];
        assert.equal(resource.id, "upload_owned");
        assert.equal(resource.status, expiresAt ? "expiry_only" : "pending");
        assert.equal(resource.storage_cleanup, "no_uploaded_bytes");
        if (expiresAt) await runtime.teardown(); else await assert.rejects(runtime.teardown(), /verification remains unmet/);
        assert.doesNotMatch(ledgerText, /private-signature|https:/);
        assert.ok(requests.every(request => request.method !== "PUT"));
      }, { ledgerPath: join(dir, "resources.json") });
    } finally { rmSync(dir, { recursive: true }); }
  }
});

test("dedicated identity restoration verifies readback and keeps signature snapshots out of public errors", async () => {
  for (const mode of ["wrong_identity", "restored", "wrong_readback", "unavailable"]) {
    const dir = mkdtempSync(join(tmpdir(), "sendmux-restore-"));
    const original = { id: "identity_owned", email: expected.mailboxEmail, name: "Fixture", text_signature: "private-signature", html_signature: "<p>private-signature</p>", bcc: [], reply_to: [], may_delete: false };
    let current = { ...original };
    let patches = 0;
    try {
      await withEnv({ SENDMUX_LIVE_E2E_DEDICATED_MAILBOX_ID: mode === "wrong_identity" ? "other" : expected.mailboxId }, async () => withApi((req, body) => {
        if (req.url.endsWith("/me") || req.url.endsWith("/connection")) return { body: connection() };
        if (req.method === "PATCH") {
          patches++;
          if (patches > 1 && mode === "unavailable") return { status: 503, body: { ok: false, error: { code: "service_unavailable", message: "private-signature", retryable: true }, meta: { request_id: "req_restore" } } };
          if (!(patches > 1 && mode === "wrong_readback")) current = { ...current, ...JSON.parse(body) };
        }
        return { body: envelope(current) };
      }, async ({ runtime, baseUrl }) => {
        await runtime.preflight(expected);
        const results = await runAdapterStep({ adapter: "typescript", credentials: { mailboxApiKey: "smx_mbx_test", appBaseUrl: baseUrl }, fixtureRuntime: runtime, fixtures, operation: operations.find(item => item.operationId === "mailboxUpdateIdentity"), sdk });
        if (mode === "wrong_identity") { assert.equal(results[0].status, "failed"); assert.equal(patches, 0); return; }
        assert.doesNotMatch(JSON.stringify(results), /private-signature/);
        assert.doesNotMatch(readFileSync(join(dir, "resources.json"), "utf8"), /private-signature/);
        assert.match(readFileSync(join(dir, "mailboxIdentity-mbx_expected-restore.json"), "utf8"), /private-signature/);
        if (mode === "restored") {
          assert.equal(results[0].status, "passed");
          await runtime.teardown();
          assert.deepEqual(current, original);
          assert.equal(runtime.ledger.resources[0].status, "restored");
        } else {
          assert.equal(results[0].status, "failed");
          await assert.rejects(runtime.teardown(), /teardown failed/);
          assert.equal(runtime.ledger.resources[0].status, "failed");
        }
      }, { ledgerPath: join(dir, "resources.json") }));
    } finally { rmSync(dir, { recursive: true }); }
  }
});
