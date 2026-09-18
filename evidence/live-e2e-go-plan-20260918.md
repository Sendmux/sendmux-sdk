# Live E2E runner: Go journal path, Go plan failure, deleted tombstone — 2026-09-18

Branch `agent/live-e2e-go-plan` from `origin/main` `cf9aaf9c`. Triage of the L11 built-source live cohorts (source sha `19c06de9`, Personal team fixture mailbox `mbx_wqwng1gynr1lgwrmbccge5at`). No live mutation by this change-set; fixtures untouched.

## Symptom

Every Go adapter failure in all three cohorts (16 read, 17 of 18 mut, 9 of 10 bytes) carried `"error":"Unknown result pair go:go-plan"`. The mut cohort teardown reported 53 `Resource mbx_… remains after cleanup` although every mailbox was deleted.

## Trace

1. `scripts/live-e2e-contract.mjs:205` — `validateResultPairs` keys results as `${adapter}:${operationId}`; `go:go-plan` is a result row with `operationId: "go-plan"`.
2. `go/livee2e/main.go:698-708` (before) — `failPlan` emitted `{adapter: go, operationId: "go-plan", status: failed}` on stdout and exited **0**; called from plan decode (`:62`), `createClients` (`:67`) and every journal I/O error (`:98`, `:106`, `:109`).
3. `scripts/run-live-e2e.mjs:2503` — `ledgerPath` defaults to the cwd-relative `.tmp/live-e2e/<runId>/resources.json`; `:2608` `journalPath()` derived the journal path from it with `join` (relative).
4. `scripts/run-live-e2e.mjs:3522` — Go is the only child launched with a cwd override (`cwd: "go"`), so `os.OpenFile(journal, O_CREATE)` resolved under `go/` where the parent directory does not exist → ENOENT → `failPlan` → `go-plan` row → validator throw → `runAdapterStep` catch → per-op `failed` with the validator's message.
5. Evidence in the L11 read run dir: `php-`/`python-`/`ruby-` journal files exist for exactly the 16 operations Go failed (all return `data.id`, which `journalSelectors` capture); zero `go-*.jsonl` files exist in any run dir. List operations (no `data.id`) passed on Go. Same shape in mut (create/update/delete ops) and bytes (`data.message_id` / `data.blob_id` / `data.attachment_id` / `data.upload_id`).
6. Sibling contract: `scripts/live-e2e-python.py:16`, `scripts/live-e2e-php.php:9`, `scripts/live-e2e-ruby.rb:22` fail the plan with an uncaught exception (non-zero exit); the runner attributes a non-zero exit to the single requested operation via `planFailureOperationId` (`run-live-e2e.mjs:3363`). Go alone exited 0 with a synthetic row.
7. Teardown: `run-live-e2e.mjs:2710-2713` (before) accepted only a structured 404 after DELETE. Management API contract: mailbox `status` is `active | suspended | deleted` (`sendmux` `src/app/api/v1/_lib/schemas/mailboxes.ts:47`); `deleteMailboxForApi` soft-deletes and `getMailboxForApi` returns the row regardless of status (`src/server/api-v1/mailboxes.ts:248-263`, `:620-646`), so GET after DELETE returns a 200 tombstone. ROOT's readback receipt: `.claude/artifacts/live-fixtures-20260918/10-orphan-mailbox-deleted.json` (`GET 200 with data.status="deleted"`).

Both halves entered in `610e283` (2026-09-12): it added the relative journal path and the strict `validateResultPairs` call; the Go `failPlan` shape dates from `f8897ae` when results were consumed unvalidated.

## Fix

- `scripts/run-live-e2e.mjs` `journalPath()` → `resolve(...)`: the path crosses a process boundary, so it is absolute at its origin.
- `go/livee2e/main.go` `failPlan` → message on stderr, `os.Exit(1)`: matches the sibling harness contract; `go-plan` no longer exists.
- `scripts/run-live-e2e.mjs` teardown: after DELETE, a 404 **or** a readback envelope with `data.id === id && data.status === "deleted"` is absence (`verification: "get_deleted_tombstone"`); any other readback still fails with `remains after cleanup`.

## Tests (scripts/test-live-e2e-safety.mjs) — each seen red first

- `Go harness persists its journal under the runner's default relative ledger path` — real `go run ./livee2e` against the local stub with a relative ledger path. RED: `AssertionError [ERR_ASSERTION]: Unknown result pair go:go-plan`. With only the Go exit fix applied it still fails (`error: 'Child exited 1; output withheld from public evidence'`), so it isolates the journal-path root cause.
- `a child-side plan failure is attributed to the requested operation in every language adapter` — blank mailbox credential for python/go/php/ruby. RED on Go: `Unknown result pair go:go-plan`; GREEN: one `failed` row for the requested operation, no HTTP request sent, withheld error text only.
- `mailbox teardown accepts the documented deleted tombstone as absence and nothing weaker` — RED: `Error: Live E2E fixture teardown failed: Resource mbx_owned remains after cleanup`. Boundaries kept red: readback `status: "active"` and a tombstone for another ID still fail teardown.

Runs: `.claude/artifacts/live-fixtures-20260918/l11-triage-{red,green,tombstone-red,tombstone-green}.log`. Baseline suite at `origin/main` with runtimes present: 43/43 (`l11-triage-safety-baseline.log`).

## Gates

- `pnpm check:live-e2e` — passed (`l11-triage-check-live-e2e.log`; safety suite 46/46 inside `check-live-e2e-runner.mjs`).
- `pnpm check:cli` — passed (`l11-triage-check-cli.log`).
- `go vet ./livee2e`, `gofmt -l`, `go test ./livee2e/` — clean.

## Not changed (parked, reported in `l11-triage-report.md`)

- Child stderr/stdout is discarded by `runChildHarness`; plan-level error text (Go, Python tracebacks, MCP tool errors) is undiagnosable from run evidence.
- `errorMessage()` keeps only the first line of an `AssertionError`, dropping actual/expected (bytes-cohort MCP custom-op failures read as `Expected values to be strictly equal:`).
- Sending API `PUT /emails/attachment-uploads/{upload_id}`: runtime requires `Content-Type` to equal the intent's `content_type` while the spec declares a fixed `application/octet-stream` body, so every generated SDK gets 400 `invalid_parameter` (API/spec contract; not fixed here).
- Mut cohort accumulates one owned webhook per adapter until teardown and hits the team cap of 10 (`limit_exceeded` on `managementUpdateWebhook` for all adapters).

## Journeys

None — harness-only change; no user-facing surface.

Completion block is in the PR description.
