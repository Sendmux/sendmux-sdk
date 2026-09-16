# Strict live-publication guard

Recorded 2026-09-17 07:45 Australia/Melbourne. Review evidence for source based on `fc561e3de5cc67999821a53fd0e0044708bef822`; this is not package or production acceptance.

## Correctness

The guard compares complete immutable candidate-owned App and Sending schemas with fixed live endpoints before each source-owned first writer. Canonical object-key order is the only normalisation: descriptions and arrays remain significant. Requests have one attempt, no redirect, a 15-second body-inclusive deadline and an 8 MiB decoded cap. Exact `release-please@17.6.0` supplies release construction; no duplicate version algorithm is introduced.

The preflight binds bounded merged-PR discovery, native tuples and independently resolved tag targets. Automatic, recovery, registry, Snap and Chocolatey entry points retain separate source identity and fresh checks. The PHP split publisher verifies actual Git tree identities, exactly one allowed push destination and matching tag targets before an exact-ref non-force push. Direct credential-holder bypass and point-in-time races remain explicit limitations, not claimed guarantees.

Independent review identified and closed four defects: recovery checkout deleting its guard, unselected Python distributions entering the upload directory, distinct PHP fetch/push destinations, and removal of the Python build selector used by nested dependency-floor checks. A same-cause survey also isolated foreign Git operations from caller repository-local hook variables while preserving global/transport configuration.

Source traces: `scripts/publication-guard.mjs`, `scripts/check-openapi-canary.mjs`, `scripts/prepare-pypi-publish.mjs`, `scripts/publish-php-split.mjs`, and the corresponding workflow first-write boundaries. Canonical references: [Git hook environment](https://git-scm.com/docs/githooks#_description), [Git remote destinations](https://git-scm.com/docs/git-remote), and the [pinned checkout directory lifecycle](https://github.com/actions/checkout/blob/de0fac2e4500dabe0009e67214ff5f5447ce83dd/src/git-directory-helper.ts).

## Tests and observed failures

The final focused suite passed **71/71, zero failures or skips**, including execution under an owned foreign Git caller. Principal tests invoke public commands/helpers, real temporary Git repositories and loopback HTTP; the pinned upstream release constructor is not mocked. Ten actual workflow commands are followed by harmless next-write recorders. No existing assertion was loosened, skipped, removed or timeout widened.

Tests added: eight transport/format cases in `scripts/check-openapi-canary.test.mjs`, candidate/provenance/workflow/recovery/Git cases in `scripts/publication-guard.test.mjs`, split/tag/destination cases in `scripts/publish-php-split.test.mjs`, and selection/dependency-floor cases in `scripts/prepare-pypi-publish.test.mjs`. Tests removed: none. The existing scheduled issue-close test retains its sole recovery coverage. Workflow text supplies commands/environment; behavior, artifacts and actual refs determine the outcome.

Retained RED evidence includes:

- Missing guard or swallowed exit: `Missing expected rejection`; a writer recorder was reached.
- Redirect/oversize response: `Missing expected rejection`; stalled response bodies timed out until explicit reader cancellation.
- Recovery checkout: actual relative command failed with `ERR_MODULE_NOT_FOUND` after its control directory was deleted.
- Python preparation: 14 artifacts copied instead of the permitted two; malformed selections failed to reject.
- Python dependency selection: all four public consumers reported `Missing expected rejection` for stale floors before restoration.
- PHP multiple push destinations: unexpected refs appeared in an unapproved owned remote; distinct fetch/push fixtures exposed false successful retries and late conflict rejection.
- Foreign Git: the requested foreign SHA returned the caller SHA, foreign config changed caller config, and diagnostic commits targeted the caller. The corrected full run preserved caller config/index/refs.

Initial scaffolding failures and the first Python fixture-isolation mutation escape remain recorded separately; they are not behavioral RED proof. Corrected mutations caught all three fixture files. Four early-failing mutant directories were recovered by their exact logged paths and removed.

## Full build and qualifications

Canonical `pnpm build` completed in **621,926 ms** against the immutable baseline snapshots: App `2e32e665c99d26d47b4c208ee2de76b6249a47129afdecab19ccf8f50712d409`, Sending `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`. These are this guard-only change's inputs, not the later combined release snapshots.

Generated drift, workspace builds, public API/layout/tree-shaking, release tooling, CLI/surface coverage, Go test/vet/lint, Python/native/MCP, PHP, Ruby, static live-E2E coverage and connection adapters completed. Individual language counts remain in the raw log rather than an invented combined total. Dependency audits reported zero advisories. Existing generation notices and 22 upstream MCP protobuf warnings remain retained.

Required conformance assertions accepted both protocols: legacy has 70 SUCCESS results; modern has 114 SUCCESS, one INFO and five capability-excluded SKIPPED results. Across all modern checks the runner reports 181 passed and nine failed within eight non-scored task-extension scenarios. These optional failures and exclusions are not represented as zero-failure conformance. No authenticated live acceptance is inferred.

The private wrapper exited **1 after the successful build**, solely because it required byte-identical Git index hashes. All 19 source hashes, HEAD, config, staged/tracked differences and status were unchanged; all 1,669 semantic index entries matched HEAD. An owned reproduction confirmed ordinary `git diff` refreshes stat-only index metadata after identical generation. The original failure receipt is preserved. No binary pre-build index was retained, so individual historical stat/extension bytes and the precise refreshing command are not asserted. No build retry or index restoration was used.

Independent final source review approved the original review corrections and the separate foreign-Git delta with no remaining source findings. Final 19-file manifest SHA-256: `6d218dc2e6ef62b7da6ad3b94d0385b401faba3d8c0e09eeffb9896593d78b8a`.

## Resources and remaining acceptance

Focused Git correction receipts verified 354 exact directory/PID/port handles plus four recovered directories absent. Full-build terminal audit verified 236 PIDs, 42 groups, 38 fixture paths and MCP port 63284 absent/refused. Synchronous children without emitted PIDs are not claimed individually inventoried. Conformance server teardown was awaited; the owned process group and advertised port were independently checked. Build outputs and dependency caches remain intentionally retained; no live service remains from these checks.

Raw evidence: this worktree's `.claude/live-publication-guard-report.md`, its named RED/GREEN logs and independent reviews; MAIN `.claude/artifacts/live-publication-guard-full-build-20260917/{before.json,after.json,result.json,terminal-audit.json,cleanup-readback.json,mcp-conformance/}`. Historical failed receipts are unchanged.

Journeys: No UI behavior changed; real Actions negative diagnostics and positive published-consumer checks remain separate gates.

Status: Locally reviewed and verified source, pending normal commit/PR/CI. The credential-free Actions diagnostic must prove failed guards and genuinely skipped writer sentinels after merge. Final combined generation, compatible backend deployment, sequential native publication and exact public readback remain required. Already-published versions remain immutable. No new parked implementation work.

## PR236 correction checkpoint — 2026-09-17 08:07

The initial source is committed as `9a8acae91452ba0724a39d96ff5968723d8c654c`. Its hosted CI, native runtime matrix, CodeQL and both Snap builds passed; the non-publishing ownership diagnostic was intentionally skipped. Those results precede the following review correction and do not qualify its new head.

Five accepted findings are corrected in one batch:

- Dynamic test checkout paths pass through a quoted environment reference, not interpolation into Bash source. A harmless path containing quotes, command substitution and backticks reproduced `ERR_MODULE_NOT_FOUND` after the old shell altered its filename; all ten real workflow boundary cases now preserve it.
- Chocolatey's guard checkout uses `github.workflow_sha`, binding it to the executing workflow rather than mutable `main`. Existing immutable old tags retain their old workflows; recovery for an older producer uses the reviewed control revision's existing manual-dispatch path.
- All four diagnostic writer sentinels exit 1 if reached. Four actual YAML-command tests each failed with `Missing expected rejection` before this correction, then passed. Aggregate workflow failure alone remains insufficient: the hosted diagnostic must show the guard failed and its writer was skipped.
- All three diagnostic checkouts disable credential persistence. This does not claim GitHub has no initial read token or other credential context.
- Snap instructions distinguish pre-upload source verification, post-upload revision recording and exact-revision verification before manual stable promotion. The guard does not inspect store revisions, and the npm source checksum is not a snap artifact checksum.

CodeQL's separate PyPI test-path finding was independently traced and refuted: the cited paths enter direct Node argv or a JSON-encoded JavaScript import, not the Bash command source. No unrelated launcher rewrite or alert dismissal was performed.

Final focused verification: **75/75, zero failures or skips**, including the four added sentinel cases and preserved negative/positive publication controls. Chocolatey order and LF/CRLF checks, Snap checks, JavaScript syntax, both changed YAML parses and diff checks pass. No test was removed, weakened or given a wider timeout. The prior full build remains applicable to unchanged production helpers and package inputs; this bounded correction changes only test, workflow and engineering-documentation surfaces.

ROOT read the actual five-file delta, independent review, original REDs and final results, then verified all five source hashes and freshly rechecked 89 PIDs, seven groups, 30 directories and 20 ports absent/refused. Older synchronous children without recorded handles retain the earlier qualification. Manifest SHA-256: `c397ea468f6b6877ae873b7231fe137d4a2471f2d52b877a7fe240926b110915`.

Receipts: `.claude/guard-pr236-review-{red,green}.log`, `.claude/guard-pr236-review-independent.md`, `.claude/guard-pr236-correction-report.md`, and `.claude/guard-pr236-correction-{sentinel-red,sentinel-green,focused,workflows,yaml,root-cleanup}.log`. No production or public package mutation occurred. The correction still requires normal commit/push, fresh hosted checks and review settlement; actual Actions-negative, combined regeneration, deployments, publications and live acceptance remain open.

The first correction commit attempt omitted `OPENAPI_INPUT_DIR`; the normal hook selected default sibling docs snapshots and failed with `Unexpected EmailSendRequest delivery_group primitive union`, after regenerating 17 unstaged client files. No commit or push occurred. The failed log and generated patch are retained as `.claude/guard-pr236-correction-commit.log` and `.claude/guard-pr236-correction-wrong-input.patch`. Recovery uses normal generation with the verified immutable inputs named in the full-build section, not manual generated-file edits or a hook bypass; its outcome is recorded separately.
