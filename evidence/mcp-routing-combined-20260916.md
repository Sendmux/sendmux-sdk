# Combined routing and MCP integration — release held

Recorded 2026-09-16 15:33 Australia/Melbourne. Local integration, scoped independent review and code/artifact gates are verified. This is not release approval, publication or production acceptance; the explicit pending release gates below remain open.

## Source adoption

The operator supplied `sendmux-sdk/.claude/coordination/mailbox-variables-routing-handoff-20260916.md` and requested exact reviewed integration, combined regeneration/gates and continued release hold.

| Repository | Integrated local source | Adoption |
| --- | --- | --- |
| App | `29691304c1415ccee287a364c94914479b58e54b` | Fast-forward from held `d33587fc`; exact feature bytes |
| Proxy | `c2633d5bb265f386a994360e54a766827b8501ba` | Isolated integration branch at exact feature; earlier OAuth change is ancestral |
| Docs | `a2fc040521fda6a4233bf3b29b8d5f7a46b80888` | Exact feature merge `5eb97b3`, then one-token link repair; original OAuth draft remains uncommitted |
| SDK | `aeb9f89179a458a21747d1e69088387d2394f0b8` | Feature adoption `7430a36` onto held `bd9df23`, then LangChain verification correction |

SDK verification compared all 75 feature paths: 74 are byte-identical to `c03eda940a2242e01e6498b9797ec1bc8a48457d`; the LangChain changelog matches reviewed SHA-256 `e34b3315239e2d090d33ba1ff2eb90f354311892af547fba8caeb3003139af43`. All 11 prior-only paths remain identical to the held parent, including PHP Mailbox's generator correction/test, release metadata and Windows diagnostic logging. No temporary Windows workflow selectors were adopted.

## Combined contract

Product emission ran from the integrated app and proxy trees. Both outputs exactly match the reviewed handoff and integrated docs snapshots:

- App: `2e32e665c99d26d47b4c208ee2de76b6249a47129afdecab19ccf8f50712d409`.
- Sending: `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.

Every SDK generation/build command used the explicitly selected sibling checkout, `OPENAPI_INPUT_DIR=../sendmux-docs-mcp-oauth`. Generated outputs passed drift checks; Postman emission made no changes. Candidate artifacts use local source metadata and must not be confused with immutable already-published artifacts bearing those versions.

## Verified checks

SDK raw output directory: `sendmux-sdk/.claude/artifacts/combined-sdk-integration-20260916/`.

| Check | Result | Receipt |
| --- | --- | --- |
| App unit / disposable integration | 579 files / 4,473 tests; 58 files / 355 tests; no skips | App `combined-app-integration` artifacts and private report |
| App type / worker / lint / formatting / pinned card | Pass | Same app artifacts |
| Proxy full suite | 121 suites / 1,454 tests; no skips | Proxy `combined-proxy-integration-20260916` artifacts |
| Proxy lint / formatting / snapshot | Pass | Same proxy artifacts |
| Docs tooling | 37/37 with explicit combined SDK; no skips | Docs `combined-docs-integration-20260916` artifacts |
| Docs confidentiality / external links / Postman / Mintlify | Pass, with producer-pin exception below | Same docs artifacts |
| SDK regeneration / drift / TypeScript / CLI / static contracts | Pass before native Go-linter environment failure | `build.log` |
| SDK local release-state / Python release guardrails | 27 release-state/contract cases and guardrail controls pass; not registry or new-version certification | `build.log` |
| SDK runtime-contract regression suite | 8/8, no skips | `contracts.log` |
| Go tests / vet / pinned lint | Pass with compatible toolchain selection | `native.log` |
| PHP generator / split composition / PHPUnit | Pass; 58 tests / 256 assertions | `native.log` |
| Ruby source suite | 27 runs / 188 assertions, no failures/errors/skips | `native.log` |
| MCP Python package tests | 156 passed; 22 warnings | `native.log` |
| MCP frozen required conformance | Legacy 70 SUCCESS; modern 114 SUCCESS, one INFO and five capability-based SKIPPED | `root-conformance-required.json`, `native.log` |
| Static live-E2E coverage / runner / adapters | Pass; no credentialed live E2E invoked | `native.log` |
| Rust floor / stable / package / floor consumer | Each source toolchain 36 tests; installed floor consumer one test; no ignored cases | `rust.log` |
| Packed Node / twelve AI-peer consumers | Pass, including routing forwarding and provenance | `node-consumers.log` |
| Go consumer | Pass | `go-ruby-consumers.log` |
| Ruby installed-gem consumer | Pass; same 27 runs / 188 assertions, no skips | `ruby-consumer.log` |
| Python combined source / final distribution build | 144 source tests (134 native + 10 LangChain), no skips/xfails/xpasses; 14 archives validated | `langchain-combined-gates/final-build.log` |
| Python installed candidate wheels / sdists | Fresh integrated 197 native + 10 LangChain wheel tests pass; sdist install, dependency/import/byte provenance passes (no behavioral pytest on sdist) | `root-python-consumers.log` |
| Integrated consumer harness | 6/6, no skips, including sequential-release isolation and missing/changed candidate rejection | `root-python-fixtures.log` |

The original aggregate build exited at pinned Go lint: inherited `GOTOOLCHAIN=local` selected Go 1.23.4 while the linter requires at least 1.26. No source requirement was weakened. A per-process `GOTOOLCHAIN=auto` selected 1.26.8 for the tool and the full remaining native sequence passed; the SDK minimum-version consumer still used local 1.23.4. Canonical mechanism: [Go toolchain selection](https://go.dev/doc/toolchain).

The first Ruby-consumer wrapper failed before any Ruby test with `rbenv: node: command not found`. The private runner now launches the actual Node executable with the selected `.ruby-version` Ruby binary directory first in its child PATH; Ruby 3.4.1 and the existing installed-gem tests pass. User/global defaults and tracked runtime configuration were not changed. See [rbenv environment selection](https://github.com/rbenv/rbenv/blob/master/README.md).

MCP's complete upstream output still records nine failures in non-scored task extensions; these are not suppressed or advertised as implemented. The required-result gate checks the exact pinned result multiset and capability evidence. This is not a claim that every upstream scenario passes.

## Integration findings and preservation

- Docs `changelog.mdx:15` linked to nonexistent `#per-message-routing`; target heading is `sending/accounts/delivery-groups.mdx:29`. The isolated one-token fix uses `#restrict-one-message`. Mintlify did not catch the old fragment; a native browser click verified the repaired destination and visible heading. Original 442-byte OAuth draft and all 82,710 prior-history bytes remain unchanged.
- Independent SDK review found that `scripts/check-python.mjs:100-104` and `scripts/ci-consumers.mjs:304-306` omitted the new `packages/python/langchain/tests/test_delivery_group.py`. Local correction `aeb9f89` includes the package-local directory in both gates, installs candidate Sending in the isolated LangChain cohort and checks executed test receipts. Its test observes actual serialized HTTP bodies for scalar/list/omitted routing. No runtime API redesign or speculative version change is included.
- Original-state control at exact `7430a36` passed nine old LangChain cases, then failed `Pre-fix escape proof: LangChain delivery-group routing test must be collected and executed`. Source and freshly built installed-candidate routing-loss controls both failed `KeyError: 'delivery_group'` (one failed, nine passed); installed byte provenance passed before that failure. The first patch was authored before the original-state control; no chronological RED-first claim is made. See `evidence/langchain-combined-gates-20260916.md`.
- ROOT independently matched all 428 recorded Python/source inputs across the candidate and integrated worktrees and all 14 final archive hashes (manifest `5d9d4e1bb43ca4c5bab674efd259871eb0f1e24c9f8a474760c356865ddcaa14`). Fresh integrated wheel/sdist certification used those exact archives; the six-case harness also passes with the integrated checkout's built TypeScript artifacts, resolving the isolated verifier worktree's missing-dist setup failure.
- Final independent LangChain review is READY with no Critical/Important/Minor findings. ROOT read the complete report and matched the integrated source to the reviewed source. Private report `.claude/combined-langchain-gates-review.md`, SHA-256 `fd165a1b30d683e06e57e311d363e18c502e0a1615cb3ccdb8e87b12ed31c37a`; the reviewer also compared all 3 LangChain and 42 Sending payload files in both final archive formats to restored source. Earlier combined SDK review's sole finding is closed by this correction, not waived.
- ROOT independently rehashed 621 proxy source files and 24 adopted receipts. Proxy performance/import evidence is adopted against identical reviewed source, not described as a fresh rebuild; the historical Docker build lacks a separate full build-context manifest.
- ROOT reran the read-only docs preservation verifier: 134 unrelated held files, 15 exact feature paths, all 33 original editorial receipt files and all 17 blocked source units remain intact. Feature prose ledgers remain separate historical records, not exemptions for earlier blocked work.

## Journeys and cleanup

App production-build browser receipt: 21/21 passed in 36.2 seconds at the reviewed source, adopted after source/hash comparison. This uses local fixtures, including a stubbed absent mailbox event stream; it is not live production-delivery acceptance. The docs preview walked both dated changelog blocks and the corrected fragment; no mobile or signed-in production docs journey was claimed.

ROOT verified app runner PIDs 29974/91520 absent, disposable project resources gone and temporary pinned SDK fixture absent. Proxy cleanup recheck confirms 16 containers, eight volumes, nine PIDs, seven process groups and two temporary roots absent (`root-proxy-adoption.json`). Docs recheck confirms 80 temporary paths and all three preview PIDs/group absent. SDK non-Python structured receipts yield 254 PIDs, 238 groups and 24 paths absent, plus 75 release-checker/metadata PIDs and 19 fixture paths. Final integrated Python checks yield 78 PIDs, 73 groups and 11 paths absent; agent cleanup independently rechecked 184 PIDs and 29 paths absent. Counts come from separate manifests and are not claimed to be disjoint. Candidate archives, build artifacts and unmerged worktrees are intentionally retained; no live test runtime remains.

## Remaining release gates

The operator's hold remains binding even after preparation passes. No release PR merge, package publication, tag, app/proxy deployment, hosted Postman write or live canary occurred. Published versions/tags stay immutable; affected packages require new versions and coherent dependent floors through the later release process.

Still required: combined new-version selection and LangChain's new Sending dependency floor; actual app/docs/skills MCP producer-pin adoption; external major PR review; original 17 blocked editorial units; rollback-safe app/worker/schema/proxy deployment; production provider/MIME/log/OAuth/attachment checks, cleanup and manual Atlassian acceptance. The docs check against the actual combined SDK correctly fails its obsolete `46c36fe` pin; its old-fixture pass is not a waiver.

Preserved limitations: the earlier interrupted development-cluster run did not retain identities for every parallel fixture, so unidentified shared fixtures cannot be ruled out; no speculative deletion was attempted. The unrelated generic docs scanner issue and five existing docs-lock advisories remain parked. The original intermittent Windows failure remains unreproduced rather than declared fixed; temporary diagnostic-only workflow commits remain excluded.

## Held preparation handoff

- Status: coded locally, not merged or deployed. The original full modernisation goal is not complete.
- Correctness: reviewed feature identities preserved; combined producer/client hashes match; LangChain coverage escape corrected and independently reviewed.
- Tests: changed `packages/python/langchain/tests/test_delivery_group.py::test_send_email_serializes_scalar_list_and_omitted_delivery_group`, observed failing on actual source and installed routing loss; replaces the internally mocked case with scalar/list/omitted transport coverage. No unrelated tests removed.
- Journeys: local app production-build 21/21 and docs fragment preview; production/manual acceptance remains open.
- Evidence: this file and `evidence/langchain-combined-gates-20260916.md`, committed locally; raw receipts stay in the named artifact directories.
- Torn down: exact runtime and temporary-workspace absences verified as above; all command sessions terminal. Unmerged worktrees, candidate archives, evidence and original docs stash intentionally retained.
- Parked: generic docs scanner defect, five existing docs-lock advisories; other qualifications and original-goal gates remain explicitly recorded above.

All source claims are released. The evidence claim is released immediately after its local commit; retained worktrees are not reservations.
