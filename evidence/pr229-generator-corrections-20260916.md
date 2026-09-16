# PR229 generator corrections — 2026-09-16

## Status

⏸ Coded and verified locally from parent `f8a4d6b7ef1675f74ac09928aa208ad611b920a3`; this evidence is included in the correction commit. The batch is not pushed, merged, published, or deployed. ROOT owns independent review and release coordination.

All generation used `OPENAPI_INPUT_DIR=/Users/rj/Desktop/GIT-REPOS/sendmux-docs-mcp-oauth`:

- App SHA-256: `2e32e665c99d26d47b4c208ee2de76b6249a47129afdecab19ccf8f50712d409`
- Sending SHA-256: `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`
- OpenAPI Generator: repository-pinned `7.22.0`

Raw receipts are under `.claude/artifacts/pr229-generator-corrections-20260916/` in MAIN.

## Root causes and corrections

- PHP generated an inline primitive `oneOf` as an empty object model. The Sending spec transform now marks the exact string/list union and the PHP template emits a bounded raw-value wrapper plus raw request getter/setter. Standalone, single-request and batch JSON now preserve the string/list wire value; invalid IDs and list sizes are rejected.
- Python runtime accepted the string/list union, but generated `from_dict` advertised `str | dict`. The existing fail-loud post-generation correction now emits `Union[List[str], str]`, and the ordinary source-cohort mypy registry includes the new consumer test.
- Ruby generated public validators dereferenced nil after nullable fields were accepted, and after `ProviderItem.variables` had already recorded a missing-value error. A version-matched narrow template override guards the marked constraints. Generation marks every confirmed sibling: both delivery-log models, both SES limit models, and `ProviderItem`.
- The old feature-worktree gate counts remain intact but are explicitly marked historical and linked to `evidence/mcp-routing-combined-20260916.md#verified-checks`.

## Red evidence

- PHP `php-red.log`: 7 tests produced 1 error and 5 failures. Scalar construction raised `TypeError`; list/requests serialized empty values; empty, 51-item and invalid-ID inputs were accepted.
- Python `python-red.log`: mypy reported `Argument 1 to "from_dict" ... has incompatible type "str | list[str]"; expected "str | dict[str, Any]"` and exited 1. The initial ordinary gate registry omitted this file; `scripts/check-python.mjs` now includes it.
- Ruby `ruby-red.log`: 4 focused runs produced 3 errors: `ProviderItem` called `nil.length`, `DeliveryLogItem` compared nil with `>`, and `SharedAmazonSesLimit` compared nil with `<`.

These are public-behaviour tests. No source-text assertion, internal-call assertion, mock of the subject, snapshot, duplicate, skip, or timeout widening was added.

## Tests

- `packages/php/tests/SendingDeliveryGroupTest.php`
  - `testDeliveryGroupSerializesAsItsWireValue`: scalar/list standalone plus real single/batch bodies and adjacent attachment serialization.
  - `testOmittedDeliveryGroupStaysOmitted`: optional field boundary.
  - `testInvalidDeliveryGroupIsRejected`: empty/51-item lists and invalid scalar/list IDs.
- `packages/python/tests/test_sending_delivery_group.py::test_delivery_group_from_dict_round_trips_supported_values`: mypy-checked scalar/list calls and runtime `actual_instance`, dict and JSON round trips.
- `packages/ruby/tests/test_management_validation.rb`
  - nullable delivery-log and SES-limit fields pass both public validators;
  - explicit nil/non-Hash provider variables return invalid reasons without raising;
  - a non-null recipient count of 51 remains rejected;
  - exactly two existing deprecation warnings are captured per two-method validation call.
- Removed tests: none.

Final focused receipt `focused-final.log`:

- PHP: 7 tests, 26 assertions, no failures/errors/skips.
- Python: mypy clean for the generated source plus consumer; pytest 2 passed.
- Ruby: 5 runs, 26 assertions, no failures/errors/skips.

Full affected-language receipts:

- `check-php.log`: syntax and PHPStan clean; PHPUnit 65 tests/282 assertions; OAuth Node checks 10/10.
- `check-python.log`: mypy/source provenance/package checks green; 146 shared tests (136 native, including both new cases; 10 LangChain), zero skipped/xfail/xpass.
- `check-ruby.log`: syntax and RuboCop clean; four test commands total 31 runs/209 assertions, zero failures/errors/skips.

## Determinism and scope

- `deterministic-regeneration.log` reran PHP, Python and Ruby generation from the explicit snapshots. `generated-before.sha256`, `generated-after.sha256`, and final `generated-final.sha256` are identical for all eight affected generated outputs. `python-final-regeneration.log` additionally proves the final existing-helper refactor remains stable.
- Generated churn is limited to two PHP Sending models, one Python Sending model, and five Ruby Management models.
- `git diff --check` passed.
- Package/native versions, release metadata, dependency floors, lockfiles, Python provider models, Ruby Sending models, and Rust are unchanged.
- The existing PHP Sending changelog already describes scalar/list delivery-group input; no extra README source was needed.

## Review dispositions

- Fixed: historical evidence ambiguity; PHP primitive-union wire loss; Python `from_dict` typing; Ruby DeliveryLogDetail nil validation; Ruby DeliveryLogItem nil validation; Ruby ProviderItem invalid-property crash.
- Same-root fixed: nullable delivery-log counts/recipients, nullable SES daily/threshold/approved limits.
- No change, confirmed false positives: Python-only provider-variable eager validation; Ruby Sending eager union validation; Rust validated-newtype/builder redesign.

## Attempts, warnings, and cleanup

- PHP generation attempt 1 applied the Sending-only assertion to every surface; mailbox generation failed loud. The transform was scoped to `surface.name === "sending"`, then generation passed.
- The first full-pass invocation used nonexistent `pnpm check:php`; the canonical `node scripts/check-php.mjs` was then run. PHPStan found test-only mixed-value annotations; the test retained every assertion and was typed precisely before the green full pass.
- Ruby's first full pass found only new-test ClassLength/keyword-order offenses. The fixture layout was shortened without lint suppression or assertion removal; the rerun passed.
- OpenAPI Generator emitted its existing example/content warnings; no build-script approval or global setting changed.
- Every recorded ownership-wrapper child has a matching `child_closed`, including final full-pass PIDs `78050`, `80969`, `98389`, deterministic generator PIDs `6293`, `7443`, `7737`, final Python generator `10469`, and focused PIDs `11389`, `11390`, `11621`, `11624`. Python temporary cohort workspaces were reported removed. No server, browser, container, or remote resource was started.

## Completion

⏸ coded, not merged

Correctness: Generator-origin fixes preserve PHP raw string/list wire values, align Python public typing with runtime, and make every confirmed Ruby public validator nil-safe without weakening non-null bounds.

Tests: Added the three language regression files/sections above; each observed the quoted red behaviour; no tests removed.

Journeys: N/A — SDK model/serializer seams are the approved public journey; no browser surface changed.

Evidence: `evidence/pr229-generator-corrections-20260916.md`; raw receipts in the MAIN artifact directory above.

Status: Locally committed correction batch; awaiting ROOT's independent scoped review, push, review replies, merge, publication and deployment gates.

Torn down: All owned command children and temporary Python cohort workspaces verified closed/removed by the ownership wrapper.

Parked: The three rejected eager-validation/public-API redesign findings remain unchanged by design; broader integration/release verification belongs to ROOT.

## Scoped review follow-up — PHP serializer contract

Base: `dd31abed8e264e05f4717388a0d4ada83e47d7e3`. ROOT accepted review findings I1/I2 after tracing the generated serializer. No Python or Ruby source/test/gate was changed or rerun.

### Added RED evidence

- `php-serializer-red.log`: the 11-case focused suite produced 2 failures and 2 errors. `ObjectSerializer::sanitizeForSerialization()` returned empty `stdClass` values for scalar/list wrappers; direct union deserialization raised `ArgumentCountError` from the zero-argument model construction path.
- `php-null-red.log`: the isolated explicit-null constructor test raised `TypeError` when the constructor passed null to the non-null setter.

### Source correction

- The generated request metadata now uses the serializer's supported `mixed` vocabulary for this marked raw primitive union; the public setter remains the schema-validation boundary.
- A fail-loud Sending-only generator transform adds exact `EmailSendRequestDeliveryGroup` handling to generated `ObjectSerializer.php`: wrappers serialize through their raw representation and direct wrapper deserialization constructs the validated union.
- The marked request constructor calls its setter only for a supplied non-null value. Absence and explicit null both retain the established omitted-field sentinel; direct setter null remains rejected.

### GREEN and drift evidence

- `php-followup-focused-green.log`: 12 tests/60 assertions, zero failures/errors/skips. Coverage includes scalar/list wrappers, public serializer and direct union deserializer, raw single/batch request round trips, adjacent attachment serialization, omitted input, and explicit null.
- `check-php-followup.log`: syntax and PHPStan clean; PHPUnit 70 tests/328 assertions; OAuth Node checks 10/10, zero skipped.
- `php-followup-before.sha256` equals `php-followup-after.sha256` for all 337 generated PHP source files after `php-followup-idempotence.log`; `git diff --check` passed.
- Exact input hashes remain App `2e32e665c99d26d47b4c208ee2de76b6249a47129afdecab19ccf8f50712d409` and Sending `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.

### Accepted warning baseline

The PHP generator warning categories are pre-existing and repeat unchanged in both `php-generation-attempt-2.log` and the follow-up `php-null-generation.log`/`php-followup-idempotence.log`:

- `InlineModelResolver`: `allOf schema \`null\` containing multiple types (not model) is not supported at the moment.`
- `ExamplesUtils`: `No application/json content media type found in response. Response examples can currently only be generated for application/json media type.`
- `ModelUtils`: `Failed to get the schema name: null`.

They are retained verification noise, not waived failures or newly introduced warnings. No warning suppression, dependency upgrade, or global build setting changed.

### Cleanup and release boundary

Ownership-wrapper children `44709`, `45322`, `46294`, `46550`, `46952`, `48060`, `48756`, and `50481` each have `child_closed` receipts. No runtime service or remote resource was started. ROOT's incomplete `root-integration-build.log` was preserved and not treated as a passing gate; its interrupted exact handles were independently verified absent by ROOT.

## Independent review and combined verification

Recorded 2026-09-16 17:42 Australia/Melbourne against source `acb46253db6130ae5f0e0ccb5aa1c38487e9734f`.

The independent scoped re-review is spec compliant and approved, with zero remaining Critical, Important or Minor findings. ROOT read the complete correction diff and checked the referenced red/green receipts. The Ruby template, after removing its 14 marked guards, is byte-identical to `ruby-client/partial_model_generic.mustache` in the installed, pinned OpenAPI Generator 7.22.0 JAR.

ROOT's final `pnpm build` exited 0 in session `85809`. It used the exact two snapshot hashes recorded here and `GOTOOLCHAIN=auto` for the local development-tool invocation; no supported Go floor changed. `root-integration-final.log` has SHA-256 `9c2974ff600b1528ae5b95de164d3a0381bd214ca5aa52b30d135e1797f29d55`.

- All generated clients have no uncommitted drift; TypeScript build, public API, layout, tree-shaking, release-state and CLI checks pass.
- Go generation, tests, vet and lint pass. Python passes 136 native plus 10 LangChain tests, with source provenance and mypy checks.
- PHP passes three generator/package-composition tests, 70 tests/328 assertions, 10 OAuth checks, static analysis and independent split installation.
- Ruby passes 31 runs/209 assertions with zero failures/errors/skips, lint and five gem builds.
- MCP passes 156 runtime tests with 22 retained upstream warnings. Required conformance is 70 SUCCESS for `2025-11-25`; `2026-07-28` has 114 SUCCESS, one INFO and five exact advertised-capability SKIPPED checks. The nine non-scored extension-check failures remain visible, not relabelled as passing.
- Static live-E2E coverage passes for 104 OpenAPI operations and two custom MCP operations; runner-contract and four connection-adapter tests pass. This is not credentialed production acceptance.

`root-final-verification.json` records fresh absence checks for 221 exact PID/process-group handles and 11 temporary workspaces. All 110 ownership-wrapper child starts have matching closure records. The checkout was clean after the build, and `git diff --check` passed.

These results close the local correction/integration gate only. Normal PR CI/review settlement, native publication, app/proxy deployment, production canaries and manual Atlassian acceptance remain required. Previously published versions remain immutable.
