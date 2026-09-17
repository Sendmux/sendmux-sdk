# Final OpenAPI description and provenance adoption

Recorded 2026-09-17 15:05. Status: locally verified source, not committed, merged, published or deployed by this task. ROOT owns integration and release.

## Scope and identity

- Base: `768471f473b30a23edb63b1eb5ff471aba78d27a`; branch `agent/final-openapi-09b`.
- Reviewed source patch: 11 files, +25/-20; SHA256 `003463f67b8604af2f1657d315bcbd2a8d7bf0fe4ba1c65a267c3f498e482bf7` (source diff only, excluding this evidence file). ROOT and an independent reviewer accepted it without findings; independent readback confirmed the same patch before this record was written.
- App snapshot SHA256: `09b00ae13c88fe4ecc1bb3fd965bb30efd79447d5ea68b5334816a7452d40b58`; Sending snapshot unchanged at `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.
- Inputs: docs commit `ad17e9409a8ec668552fcc730828c13d44bcad99`; locally checked docs/main `5d50e2d1d2c9bf1a007a3b3713b22fc210f82b86` contains identical inputs.

The sole App semantic change is `paths./providers/{public_id}.patch.description`: shared Amazon SES variables may be replaced, while connection settings cannot be edited. Generated Go/Python/Ruby/TypeScript management comments/docstrings adopt it; the packaged MCP snapshot and its contract hash follow it. Rust's two App provenance strings follow the measured snapshot because `scripts/check-surface-coverage.mjs:83-90` requires both to match. No operation, schema, permission, executable logic, version, changelog, release configuration or lockfile change remains.

Trace: `packages/python/mcp/sendmux_mcp/openapi/openapi-app.json:16655` → `packages/python/mcp/sendmux_mcp/mcp-contract.json:54`; `rust/operation-decisions.json:3` and `rust/src/generated/mod.rs:25`. Independent review checked all 23 contract source hashes against staged bytes and both Rust hashes against the exact App snapshot.

## Verified local gates

Raw evidence root: `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk/.claude/artifacts/final-openapi-09b/`. The executing agent's final handoff is `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk-final-openapi-09b/.claude/final-openapi-09b-report.md`; terminal log summaries and receipts were read independently for this record.

| Gate | Terminal result | Retained evidence |
| --- | --- | --- |
| `pnpm build` | Exit 0; complete command chain, including fresh drift check | `build-final.log` |
| `pnpm test:publication-guard` | Exit 0; 78/78, zero failures or skips | `publication-guard.log` |
| `pnpm test:runtime-contracts` | Exit 0; 8/8, zero failures or skips | `runtime-contracts-boundary.log` |
| Frozen metadata | All recorded files unchanged | `frozen-metadata-closeout.txt` |

Full build's required MCP conformance multiset passed: protocol 2025-11-25 has 70 SUCCESS/0 INFO/0 SKIPPED; protocol 2026-07-28 has 114 SUCCESS/1 INFO/5 SKIPPED under the existing exact capability exclusions (`scripts/mcp-conformance.mjs:16-19,64-96`). Unsupported/exploratory results remain visible in `mcp-conformance/`; this is not a claim that every capability passed. Static live-E2E coverage is not credentialed production acceptance.

Tests: +0 / -0; existing assertions and test source unchanged. No new behavior or regression fix was introduced, so no added-test red run applies. Journeys: no browser or authenticated production journey run by this source task.

## Explained failures and recovery

1. Initial standalone drift failed only because intended generated changes were unstaged (`scripts/verify-sdk-staleness.mjs:29-43`). Review/staging resolved it; final full build reran drift. Evidence: `drift-check.log`, `generated.patch`.
2. A Python guardrail expected a non-Git fixture, but task TMPDIR nested inside MAIN allowed ancestor discovery. Setting `GIT_CEILING_DIRECTORIES` to that exact TMPDIR corrected isolation; unchanged guardrails passed. Evidence: `build.log`, `git-ceiling-diagnostic.log`, `python-release-guardrails-green.log`.
3. The next build rejected stale Rust App provenance. Only the two identity strings above changed; no Rust generator or operation change was added. Evidence: `build-isolated.log`, `rust-provenance-green.log`, then `build-final.log`.
4. Two runtime attempts correctly failed consumer provenance (`@sendmux/core: not installed in consumer`): pnpm discovered MAIN and shared its lockfile/virtual store. An environment-only `shared_workspace_lockfile=false` retry failed because pnpm lifecycle serialization changed false to an empty variable and child config became undefined. The successful isolation was a task-owned TMPDIR `pnpm-workspace.yaml` containing `packages: []` and `sharedWorkspaceLockfile: false`, alongside the Git ceiling. The minimal real packed-core consumer and unchanged 8/8 runtime gate then passed. Evidence: `runtime-contracts.log`, `runtime-contracts-isolated.log`, `pnpm-lifecycle-probe.log`, `pnpm-fixture-boundary.yaml`, `pnpm-boundary-probe.log`, `pnpm-isolation-consumer.log`.
5. Each failed Node fixture added 228 task-only MAIN lockfile lines. Exact diffs were archived and only those additions reversed; materialised lock and task-only module entries were restored, and each attempt's six task-addressed tarball directories were retained in `recovered-cache/` or `recovered-cache-attempt2/`. MAIN was verified clean with lock blob `8452b1ce92171a6738d47ca3d7a338ea46c0833d`; unrelated cache/link state was preserved. Evidence: `main-accidental-lock.patch`, `main-accidental-lock-attempt2.patch`, recovery receipts in the local handoff.

Commands used the existing bounded `scripts/ci-consumers.mjs:43-114` process runner, `OPENAPI_INPUT_DIR=/Users/rj/Desktop/GIT-REPOS/sendmux-docs-mcp-oauth`, `GOTOOLCHAIN=auto`, and task-owned temporary/conformance paths. No gate, assertion, production source or lockfile was weakened to make the isolation retries pass. Full build and publication guard were not rerun after the final runtime-only isolation correction.

## Remaining release gates and cleanup

- ROOT ran `pnpm canary:openapi --docs-dir packages/python/mcp/sendmux_mcp/openapi` on this candidate: App matched exact 09b; Sending failed because production still omits `delivery_group` before the queued proxy rollout. Publication remains gated on both live snapshots matching and authenticated provider-detail plus both nonempty historical email-log response checks; local fixtures do not close them. Repeat candidate-owned live equality immediately before publication (`docs/native-publication.md:3-19`).
- Published MCP 2.1.0, Python Sending 1.6.0 and the accepted hosted app MCP source pin remain immutable. Retained `verification-only-dists/` archives are verification evidence, not upload candidates. Release Please must supply any refreshed release version; this record authorises no publication or deployment.
- `process-final-receipt.json` records 337 owned process groups and 36 owners checked, none live. Its remaining isolation workspace was subsequently removed with the two exact temporary roots; `temp-cleanup-receipt.json` verifies both absent. Logs, conformance outputs, failed-run diffs and recovered caches remain intentionally retained.
- Status: source and evidence await ROOT's commit/PR, review, integration and applicable release gates. No remote operation or credential access occurred while preparing this record; the worktree remains for ROOT.
