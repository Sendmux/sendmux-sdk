# Combined source release integration

Recorded 2026-09-16 16:08 Australia/Melbourne.

The operator lifted the release hold and approved the bounded documentation manual-finalisation exception. This source integration preserves the combined implementation while keeping unmerged native release metadata out of main. Earlier hold statements in retained evidence are historical; ordinary release, review, deployment and acceptance gates remain required.

## Source identity

- Base: `db132e4d1850fb0b59b8edbbd52b7d796df1ba5e`.
- Reviewed held state: `d77a69b54946acceb0425751278a50227c5c7dde`.
- Adopted source: `a5f52f5`, `24bb686`, `7430a36`, `aeb9f89`, now `103f0c8`, `31b1e48`, `94f52d4`, `cf40dae`.
- Final retained evidence adoption: `33ea7af91ccb57235efd63c9ee53aee796a9d572`.
- Generated docs input is published on docs main at `b5d425cf40d1f1af8add6af446a565a515b40f2d`; Verify docs run `35062152512` succeeded.

The sole cherry-pick conflict was the LangChain changelog. Both the routing feature note and the existing dependency-floor note remain under `Unreleased`; the unmerged `0.3.1` heading and duplicate bot note are omitted. PR227's native version/manifest commits are not ancestors. Package metadata and the release configuration remain identical to actual main. No version is represented as published by this source PR.

## Verification

Fresh exact-byte comparison: 87 paths match the held source, including all five accumulated evidence files. The source delta has 88 paths before this new evidence file; only the intentional LangChain changelog composition differs. The held manifest and project-version bump are excluded. `git diff --check` passes.

`node scripts/release-state.test.mjs` passes: all 21 release-please owners agree with their native metadata, and five PHP packages retain split-tag versioning. Ruby metadata child PIDs 51742, 51753, 51764, 51775 and 51786 were reported absent after their checks.

The comprehensive combined generation, runtime, protocol and installed-candidate checks remain documented in [the preserved combined evidence](mcp-routing-combined-20260916.md). Their source bytes are unchanged; they were not rerun to relabel identical results. Normal CI still runs on this PR and after merge. The LangChain routing coverage correction and its observed RED controls remain documented in [its evidence](langchain-combined-gates-20260916.md).

Tests: none added or removed by source separation. Journeys: no new runtime behavior introduced by separation; production acceptance remains pending. Rules evolution: no new rule needed.

## Remaining release gates

Let Release Please refresh actual candidates after this source merge. Publish dependency producers first, then adopt actual dependency floors in consumers. In particular, the new LangChain routing union requires the next published Sending package, not its existing lower bound. Published versions remain immutable. This source merge is not a native package release, app/proxy deployment, hosted Postman publication or final Atlassian acceptance.

Status at commit: prepared for independent integration review and normal major-PR checks. No task server, browser, container or test process remains active in this source worktree; the unmerged worktree is retained for the release path.
