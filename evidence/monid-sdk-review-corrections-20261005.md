# Monid SDK review corrections

Status: corrective source batch for SDK PR #313; not merged or published.

Seven reviewed findings affect timestamps, a deprecated import, migration notes and live-test prerequisites. Corrections stay in the canonical generators and fixture planner; generated clients are outputs.

- Python management cost bounds reject missing timezones and excessive precision before coercion, then emit UTC timestamps with millisecond precision. All three public call variants share validation. Raw strings are checked before validation can discard extra fractional digits.
- Ruby body timestamps preserve their UTC instant and reject precision the serialiser cannot represent. Cost-query timestamps retain the stricter millisecond limit. Unusual timezone offsets use UTC rather than losing offset seconds.
- Deprecated Python model modules re-export through the existing warning and alias resolver, preserving deep imports until the declared removal release.
- Go migration notes name operation-specific error responses and the `ApiErrorHeaders.Response` conversion without rewriting the published v3.0.0 identity.
- Draft reads require an explicit existing `SENDMUX_LIVE_E2E_DRAFT_ID`. Usage reads require `SENDMUX_LIVE_E2E_USAGE_START` and `SENDMUX_LIVE_E2E_USAGE_END`. Missing values gate the operation; no draft creation or ungated mutation was added.

Public regression evidence:

- Python timestamps: 13 genuine failures before generation; 13 passed after generation, zero skips. Covered timezone offsets, both bounds, naive values, sub-millisecond values and raw string precision.
- Deprecated deep import: `ModuleNotFoundError` before the generator fix; all four cross-language compatibility cases passed afterwards, zero skips.
- Fixture selection: actual `["executable", "executable"]` instead of required `["gated", "gated"]` before correction; both new selection and existing all-gates tests passed afterwards. All-gates total remains 119. Default plan now has 59 executable and 60 gated operations because two reads gained prerequisites.
- Ruby original timestamp cases failed before generation. The final audit also reproduced a sub-nanosecond value that did not raise and two second-offset timestamps that changed the instant. All six focused public cases passed after correction; the canonical Ruby gate passed 45 tests / 271 assertions, zero failures or skips, with lint and gem builds successful.
- The complete related live E2E safety suite passed 47 tests, zero failures or skips. Static coverage and runner contract checks passed for 117 API operations plus two custom MCP operations; the retained historical audit was checked as historical, not relabelled as current acceptance.
- Independent source audit mapped all seven findings to their corrections and found no remaining concrete defect.
- Canonical SDK build completed core verification and Go checks, then stopped at the Python test-file inventory: the new datetime file was not yet declared in `sharedTests`. The inventory now includes it, preserving the exact ownership assertion and mandatory execution checks. Failure retained. The subsequent sequential affected/remaining gates completed with exit 0: Python (175 native and 10 LangChain cases), PHP (76 tests / 367 assertions), MCP (161 Python tests and required conformance scenarios), folder-delete compatibility (four cases), static coverage/runner/audit checks, and connection adapters (four cases). Existing conformance exclusions and non-scored results remain visible; this is not a claim that every upstream runner case passed. Normal hook results remain pending before commit.

Current source inputs are the matching Docs snapshots: App SHA256 `90143520564077283dddf9bcc7d11d73083befd7873107138cf64fa4d1a24bcf`; Sending SHA256 `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`. Commands use the supported `OPENAPI_INPUT_DIR` override. An initial Ruby generation using a stale sibling Docs checkout failed; its log and diff remain preserved. Corrected generation reproduces clients from the current inputs.

Existing assertion changes follow the intentional fixture-gating change. Existing all-gates assertions remain unchanged, with their fake environment extended to supply the required fixtures. No test, deadline, conformance exclusion, version or lockfile was weakened.

Detailed command logs and diagnostics: Sendmux MAIN `.claude/artifacts/monid-readiness/release-current-prep/current-main-merge-preflight-20261004/sdk-source-pr-readiness-20261005/{runtime-pin-ci-review,review-datetime-fix}/`.

Normal hook, exact-head CI and settled review remain source gates. Source merge, immutable package releases, matching Skills evidence and independent public readback remain separate release gates. No credentialed live run, customer email, production mutation or publication occurred in this batch.
