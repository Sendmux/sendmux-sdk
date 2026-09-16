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
