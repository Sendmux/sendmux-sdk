# Native Management major release preparation

Checkpoint: 2026-09-17 19:06 AEST. Status: prepared locally, uncommitted; no publication or remote mutation.
Correction: 2026-09-17 19:09 AEST — Ruby tag identity and absence evidence corrected from ROOT's fresh release-history check; no configuration change or repeated suite.

## Source and change

Fresh worktree `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk-native-management-majors`, branch `agent/native-management-majors`, starts at `a9bdaf58f0db684328458e269ba8aff515334d0b`. `git fetch origin main`, `git rev-parse origin/main` and `git ls-remote origin refs/heads/main` agreed on that SHA before worktree creation.

`release-please-config.json` gains exactly four `release-as` entries:

| Owner | Intended version | Exact tag |
| --- | --- | --- |
| `packages/ts/management` | `2.0.0` | `ts-management-v2.0.0` |
| `packages/ruby/management` | `2.0.0` | `ruby-management/v2.0.0` |
| `packages/python/management` | `2.0.0` | `python-management-v2.0.0` |
| `packages/python/sdk` | `3.0.0` | `python-sdk-v3.0.0` |

Canonical mechanism: existing `release-as` package overrides in this config, consumed by `.github/workflows/release-please.yml:68–73`. This prepares Release Please candidate selection; it does not itself advance a package version or publish an artifact. ROOT owns later review and combination with the MCP correction into one remote batch.

Compatibility authority: ROOT already established Python Management2/SDK3. The completed TS/Ruby survey compared published npm Management1.4.0 and Ruby Management1.3.0 with final source `77dc354fbecc9459d8f4f1c49d36ea129b4bfd90`: TypeScript public list-to-detail assignment changed from zero diagnostics to TS2741 (required `variables`); Ruby list-element class changed from `ProviderItem` to `ProviderListItem`, changing `is_a?(ProviderItem)` from true to false. Its exact repros are retained locally at `../sendmux-sdk-combined-native-release/.claude/native-ts-ruby-management-major-survey-20260917.md`; they were not rerun for this metadata preparation.

## Unused-version evidence

The registry observations below were collected on 2026-09-17 before the config edit; ROOT's later Ruby tag correction is attributed separately. These are dated absence observations, not reservations or future publication certificates:

| Read-only query | Actual result |
| --- | --- |
| `https://registry.npmjs.org/@sendmux%2fmanagement/2.0.0` | HTTP404, `"version not found: 2.0.0"` |
| `https://pypi.org/pypi/sendmux-management/2.0.0/json` | HTTP404, `{"message": "Not Found"}` |
| `https://pypi.org/pypi/sendmux-sdk/3.0.0/json` | HTTP404, `{"message": "Not Found"}` |
| `https://rubygems.org/api/v1/versions/sendmux-management.json` | HTTP200; `2.0.0` absent; returned versions `1.3.0,1.2.0,1.1.1,1.1.0,1.0.0` |

Correct exact remote-tag selectors, including the verified Ruby slash form (reference command corrected here, not rerun during this correction):

```sh
git ls-remote --tags origin \
  refs/tags/ts-management-v2.0.0 'refs/tags/ts-management-v2.0.0^{}' \
  refs/tags/ruby-management/v2.0.0 'refs/tags/ruby-management/v2.0.0^{}' \
  refs/tags/python-management-v2.0.0 'refs/tags/python-management-v2.0.0^{}' \
  refs/tags/python-sdk-v3.0.0 'refs/tags/python-sdk-v3.0.0^{}'
```

The original bulk probe mistakenly used `ruby-management-v2.0.0`, not the Ruby tag above. It exited0 with empty stdout/stderr (`"matchedRefs":[]`, receipt `528132`), establishing the TS/Python target-tag absence only; it did not establish Ruby slash-tag absence. Registry tool receipt `9fe186` remains valid.

ROOT then ran `git ls-remote --tags origin '*ruby-management*'`. ROOT reported only `ruby-management/v1.0.0`, `/v1.1.0`, `/v1.1.1`, `/v1.2.0` and `/v1.3.0`; the latest ref was `eff88554a081f9af2b84bf1757b19498025aa854`. No `ruby-management/v2.0.0` was returned. That fresh history check, supplied by ROOT during review, establishes the Ruby target-tag absence; this delegate did not repeat it.

Lesson: derive exact native tag identities from real release history before querying target absence; a global separator setting or an empty query for a guessed spelling is insufficient.

## Validation and preservation

`pnpm exec node scripts/release-state.test.mjs` exited0:

```text
TypeScript release state matches package metadata.
Native release state matches 21 release-please owners; 5 PHP packages retain manual split-tag versioning. Go published tags and PHP published versions are not checked here.
```

The existing checker also confirmed its five Ruby metadata children ended with ESRCH (PIDs 14938, 14954, 14968, 14988, 15030). Receipt `a0d226`. No new tests, dependency install, full build, broad suite, consumer-floor change or source change was performed.

One-off semantic JSON comparison against HEAD confirmed exactly the four intended new overrides and deep equality of every remaining config value. All seven prior overrides remain: TS Mailbox2.0.0, TS SDK2.0.0, TS AI SDK0.5.0, Go2.0.0, Rust0.5.0, Ruby Mailbox2.0.0 and Ruby SDK2.0.0. `git diff --check` passed; the config diff is four added lines.

`.release-please-manifest.json` remains byte-identical to HEAD, SHA256 `1f68e857fd91cd792d3844cf3be629a72295def7a241e980bf716cf70f466b34`. Package versions, dependencies and lockfiles are unchanged. Producer publication must precede any consumer-floor advancement. Each override remains one-time and must be retired in its own verified release slice under the existing release procedure.

Handoff: ROOT reviews these two deliverable files and performs the combined remote batch. No commit, push, PR mutation, tag or publication occurred here. Local worktree retained for that handoff; file claims are released when editing finishes. The configured release-state fixture suite and unrelated MCP contract tests were not run; only the existing native metadata checker applies to this bounded config preparation.
