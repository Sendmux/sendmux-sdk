# Release Please zero-file commit fence

Status: coded, not merged. release-please 17.6.0 assigns a commit that carries no files to every package, so the empty `fix(go)!` commit 628561d on main 9ceeb115 proposed a major for all 21 packages (#248, #259, #261, #263, #280-#296). Nothing was tagged or published; every release PR stayed unmerged.

## Cause and correction

The pinned Action `googleapis/release-please-action@0dfd8538845b8e92600d271a895a5372865d4062` resolves `release-please` 17.6.0 in its package-lock, and the 2026-09-21T02:49:22Z workflow run logs `Running release-please version: 17.6.0`. Trace in that version:

- `build/src/manifest.js:310` constructs `CommitSplit` with `includeEmpty: true`.
- `build/src/util/commit-split.js:83-88` pushes a commit with `files.length === 0` into every configured package path.
- `build/src/util/commit-exclude.js` `shouldInclude` keeps a commit only when `!files.filter(inPackage).every(inExcludePath)` once `exclude-paths` is declared; an empty file set makes `every` true, so the commit is dropped. A real commit attributed to a package carries at least one in-package file and none of those lie under `evidence/`, so real commits are unaffected.
- `git rev-list --no-merges origin/main -n 800` holds exactly two zero-file commits: 628561d (`fix(go)!`, 2026-09-21) and 7c2c40b (`chore: bootstrap sdk monorepo skeleton`, 2026-05-30, non-releasable and older than every first release).

Correction in `release-please-config.json`: `"exclude-paths": ["evidence"]` on every package except `go`. `go` keeps 628561d because its breaking note (quota union member fields removed, five nullable fields de-wrapped) is true for the Go module and go 3.0.0 is the intended release; the same fence goes onto `go` once 3.0.0 has shipped. History was not rewritten.

Rejected: `Release-As` footers or per-package `release-as` fix the version but keep the false BREAKING CHANGES note in every changelog and release body; `last-release-sha` stops the commit walk at one sha for all packages (`build/src/manifest.js:285-287`) and would also drop the regeneration commits that drive the intended patch releases.

## Verification

Both runs: `pnpm exec release-please release-pr --repo-url=Sendmux/sendmux-sdk --target-branch=<branch> --dry-run` from the fence worktree, using the repo's 17.6.0 devDependency.

RED, `main` at 9ceeb115 (`.claude/artifacts/rp-empty-commit-fence/dry-run-main-baseline.log`), 21 pull requests:

- go 3.0.0
- python-core 2.0.0
- python-langchain 1.0.0
- python-mailbox 3.0.0
- python-management 3.0.0
- python-mcp 3.0.0
- python-sdk 4.0.0
- python-sending 2.0.0
- ruby-core 2.0.0
- ruby-mailbox 3.0.0
- ruby-management 3.0.0
- ruby-sdk 3.0.0
- ruby-sending 2.0.0
- rust 1.0.0
- ts-ai-sdk 1.0.0
- ts-cli 2.0.0
- ts-core 2.0.0
- ts-mailbox 3.0.0
- ts-management 3.0.0
- ts-sdk 3.0.0
- ts-sending 2.0.0

GREEN, `agent/rp-empty-commit-fence` at babe5344 (`.claude/artifacts/rp-empty-commit-fence/dry-run-fenced.log`), 13 pull requests:

- go 3.0.0
- python-mailbox 2.0.2
- python-management 2.0.1
- python-mcp 2.1.3
- python-sdk 3.0.1
- ruby-mailbox 2.0.2
- ruby-management 2.0.1
- rust 0.5.1
- ts-ai-sdk 0.5.2
- ts-cli 1.7.2
- ts-mailbox 2.0.2
- ts-management 2.0.2
- ts-sdk 2.0.2

Only the go body carries a BREAKING CHANGES section. python-sdk 3.0.1 is driven by 912dfcf and rust 0.5.1 by 628b161, the candidates already open as #248 and #261 before the incident. No pull request is proposed for ts-core, ts-sending, python-core, python-sending, python-langchain, ruby-core, ruby-sending or ruby-sdk.

Pre-commit `pnpm drift:check` passed on the config commit (`.claude/artifacts/rp-empty-commit-fence/commit1-hook.log`: "Generated SDK package directories have no uncommitted drift.").

## After merge

Release Please recomputes the 13 candidates on the next push to main. The eight stale major PRs are not updated because no candidate exists for them (`createOrUpdatePullRequest` only touches candidates); ROOT closes them with a comment. This change produces no tag, package or image.

Tests: none added. The fence is configuration verified against the real tool above; a test asserting the config's shape would be a source-text assertion under the Prune kill-list.

## Completion

- Status: coded, not merged; awaiting PR review and merge.
- Correctness: trace above; dry run RED 21 majors to GREEN 13 intended candidates.
- Tests: none added, none removed.
- Journeys: none, no user-facing surface.
- Evidence: this file; raw logs under `.claude/artifacts/rp-empty-commit-fence/`.
- Torn down: nothing spawned.
- Parked: add `exclude-paths` to `go` after go 3.0.0 ships.
