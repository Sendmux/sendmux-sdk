# L17e — nullable-reference normaliser rule and deprecated model aliases (2026-09-20)

PR https://github.com/Sendmux/sendmux-sdk/pull/277 (`agent/nullable-ref-normaliser-and-aliases`, base `origin/main`
`86d7174`, label `major`). Code commits: `0f692c5` (normaliser rule + test), `1b396a4` (alias tables, writers, tests,
generated Go alias files), `d33be31` (review fixes: PHP generator fixture import, Go block spacing, planner message). Raw logs: `.claude/artifacts/l17e/` in the main checkout (gitignored, machine-local).

## Why

The app (lane L17d) is moving nullable references to `anyOf: [{ $ref: X }, { type: "null" }]`, keeping the canonical
component as the field type everywhere (L17c, variant B3). Before the SDKs are regenerated from that schema, `main` needs
(1) a normaliser that accepts the shape and (2) deprecated aliases for the synthesised classes the old unsatisfiable
`allOf` shape produced, so the regeneration ships as patch releases.

## Deliverable 1 — normaliser rule

`scripts/normalize-openapi-for-codegen.mjs:164-217`: `normalizeComposedNullBranches(schema, document)` turns a bare
`$ref` `anyOf`/`oneOf` with a null branch into `{ allOf: [{ $ref }], nullable: true, type: <component type> }`;
`referencedComponentType` throws `Cannot normalize nullable reference <ref> because the referenced component has no
single OAS 3.0 type` otherwise. The 3.1 document is untouched (its existing `allOf` rule already produced this idiom).

RED first (`02-normaliser-test-red.log`, all three tests):

```
✖ a bare $ref anyOf/oneOf with a null branch becomes the OAS 3.0 nullable reference idiom
  Error: Cannot convert null branch because no sibling schema has an explicit OAS 3.0 type
      at markComposedSchemaNullable (scripts/normalize-openapi-for-codegen.mjs:191:11)
  1 !== 0
ℹ pass 0  ℹ fail 3
```

GREEN after the rule (`03-normaliser-test-green.log`): `ℹ pass 3 ℹ fail 0`. The parity test asserts the anyOf input and
the historical `allOf: [{ $ref }, { type: ["object","null"] }]` input produce byte-identical `.codegen.json` and
`.openapi-generator.codegen.json` files. The test file runs inside `normalize:check` (package.json).

Scratch proof on L17c's B3 spec (`05-normalise-B3.log`, `codegen-B3/`): `normalize:codegen` + `verify:codegen` pass; 15
nullable-reference sites all read `{"allOf":[{"$ref":…}],"nullable":true,"type":"object"}`; versus L17c's hand-patched
codegen-B the only 19 differing nodes are the trio (`MailboxSendScope`, `MailboxSubmissionEnvelope`,
`MailboxRealtimeMessage`) B3 deliberately keeps nullable at definition (`05b-B3-vs-l17c-B-303-diff.txt`).

## Deliverable 2 — deprecated aliases

`scripts/deprecated-model-aliases.mjs`: `planDeprecatedModelAliases` — replacement must be generated (throws
`<label> does not generate <replacement>; update the <deprecated> alias`), a still-generated deprecated name is
`pending`, otherwise `active`. Unit test `scripts/deprecated-model-aliases.test.mjs` (3 cases; under a mutation that
swaps active/pending and drops the throw all three fail — `07-planner-mutation-red.log`). Wired into `pnpm build` as
`test:deprecated-model-aliases`.

Tables (data-driven, one per language, replacements verified against generated output on every run):

| Language | Table | Deprecated → replacement |
| --- | --- | --- |
| Python | `scripts/generate-python.mjs` `deprecatedModelAliases` | mailbox: `MailboxMessageContentResponseAllOfData`→`MailboxMessageContent`, `MailboxRawBodyResponseAllOfData`→`MailboxRawBody`, `MailboxSubmissionEnvelopeRcptToInner`→`MailboxSubmissionEnvelopeAddress`, `MailboxThreadContentResponseAllOfData`→`MailboxMessageContent`; management: `MailboxAppPasswordResultCredential`→`MailboxCredential`, `ProviderCreateBodyQuotasPerDayAnyOf`→`ProviderQuotaRange` |
| Ruby | `scripts/generate-ruby.mjs` `deprecatedModelAliases` | the same six (`deprecate_constant`) |
| PHP | `scripts/generate-php.mjs` `deprecatedModelAliases` | the same six as `src/Model/<Deprecated>.php` `class_alias` shims (`sendmux/mailbox 4.0` / `sendmux/management 3.0`) |
| Go | `scripts/generate-go.mjs` `deprecatedTypeAliases` | 25 mailbox + 18 management identifiers from L17c `12-surface-delta-B3.txt` (`MailboxMessageContentResponseData*`→`MailboxMessageContent*`, `MailboxRawBodyResponseData*`→`MailboxRawBody*`, `MailboxSubmissionEnvelopeRcptToItem*`→`MailboxSubmissionEnvelopeAddress*`, `MailboxThreadContentResponseDataItem*`→`MailboxMessageContent*`, their `Nil…` forms, `MailboxAppPasswordResultCredential`→`MailboxCredential`, `Provider{Create,Update}BodyQuotasPer{Day,Hour,Minute,Second}1`→`ProviderQuotaRange`, `Nil…1`→`NilProviderQuotaRange`) |
| TypeScript | none | L17c B3 delta removes no TS export (`12-surface-delta-B3.txt` ts: removed 0; `13-ts-build-and-guard-B3.log` `verify-ts-public-api exit=0`) |

The removed Python/Ruby/PHP classes carry exactly the fields of their replacements (L17c `09-surface-main.json`, all 18
pairs identical), so the alias is the class that types the same field.

Today's generated output (`08-generate-today-vendored.log`, generators run from the vendored MCP snapshot `b901839…`
that `main`'s packages were generated from): every table entry is reported pending (61 lines), and the only files
under a generated directory that differ from `origin/main` are the two new `go/{mailbox,management}/deprecated_aliases.go`
(header + comment, no alias) — `packages/*` unchanged.

Scratch proof on the B3 regeneration (`09-chain-b3.log`, `09c-chain-b3-part3.log`, `09d-chain-b3-part4.log`,
`11-go-consumer-b3.log`; scratch copy `scratch-b3/`, nothing committed):

- Go: `go build ./...` + `go vet` clean; `deprecated_aliases.go` 239 / 176 lines with 25 / 18 `type Old = New`,
  7 / 9 `NewNil…` constructors, 7 / 0 enum constants; consumer program referencing every declared alias, constructor and
  constant builds (`consumer build ok`; `missing: []`, `extra: []` against the L17c list).
- Python: pytest 27 passed (`test_mailbox_deprecated_aliases.py` + `test_management_deprecated_aliases.py`, alias
  branch exercised: warns once, `is` the replacement, absent from `__all__`); mypy clean on both packages + tests.
- Ruby: 5 runs / 28 assertions + 3 runs / 11 assertions, 0 failures (deprecated constants warn once, `equal?` the class
  typing the attribute).
- PHP: `php -l` + phpcs clean, phpstan level max `[OK] No errors`, phpunit `OK (6 tests, 39 assertions)` with the shims
  loaded through PSR-4 and the `E_USER_DEPRECATED` message asserted.
- `grep -rl OrNull` over every generated tree: none.

## Gates

- Baseline (`01-drift-check-baseline-docs-main.log`): on `origin/main` `86d7174`, before any change, `pnpm drift:check`
  against `../sendmux-docs` `main` (`efed582`, the transitional v1.8.249 `…OrNull` shape the SDK never regenerates
  from) is RED — `verify:sdk-staleness`, 110 stale entries — the same failure L17b recorded. CI's `verify` job checks
  out that docs `main`, so it is red on this PR for the same root cause, one step earlier: under the `…OrNull` shape
  the Go generation emits `NilMailboxMessageContentOrNull` (PR #276's `go/mailbox/oas_schemas_gen.go` at
  `f1f0656`, generated from that snapshot) and the alias table's
  replacement check fires as designed — `go/mailbox does not generate NilMailboxMessageContent …`
  (`17-ci-verify-job.log:933`). The language runtime jobs do not regenerate and are green.
- Pre-commit hook (`.githooks/pre-commit` = `pnpm drift:check`, run with `OPENAPI_INPUT_DIR` at the vendored snapshot):
  clean on both commits (`12-commit-resplit.log`, `13-amend-tests.log`, `13b-amend-php-test.log`).
- CI replica against the vendored snapshot on `1b396a4` (`14-ci-replica.log`): `pnpm build` ran green through
  `drift:check`, the workspace builds, every `verify:*`/`test:*`/`check:*` step and `build:go`'s generate + check-go +
  `go test` + `go vet`, then stopped at golangci-lint only because this machine runs Go 1.23.4 with `GOTOOLCHAIN=local`
  (golangci-lint v2.13.2 needs ≥ 1.26; CI's `verify` job pins 1.27) — re-run with `GOTOOLCHAIN=auto`: `0 issues`
  (`15-golangci.log`). The steps after it ran individually (`16-build-tail.log`): `build:python` 0 (173 shared tests,
  0 skipped), `build:ruby` 0 (alias suites 5 + 3 runs), `build:mcp` 0, `check:live-e2e` 0, `test:connection-adapters` 0,
  `build:php` 1 — `generate-php.test.mjs` copies a fixed list of scripts into its fixture and the new
  `./deprecated-model-aliases.mjs` import was missing (`ERR_MODULE_NOT_FOUND`); fixed by adding it to the fixture
  list, `node --test scripts/generate-php.test.mjs` 3/3 green afterwards (`18-generate-php-test-green.log`).
  `test:publication-guard` exit 0, `test:runtime-contracts` exit 0.
- CI on #277 head `1b396a4` (run 35507457244): 37 checks pass — CodeQL + 6 Analyze, go-runtime ×3, node-runtime ×9,
  php-runtime ×4, python-runtime ×5, ruby-runtime ×5, rust-floor, rust-latest-package, package; `verify` fails at
  `generate:go` for the docs-snapshot root cause above (`17-ci-verify-job.log:933`); ownership-diagnostic skipped
  (Windows-only conditional job).
- Review: independent reviewer over the full diff and the B3 scratch outputs — one defect, `renderDeprecatedTypeAlias`
  opened every block with a blank line while `writeDeprecatedTypeAliases` joined blocks with `"\n"`, so an active alias
  file carried two blank lines between blocks (`gofmt -l` listed both B3 files, `19-gofmt-fix-and-red-proof.log`);
  fixed with `blocks.join("")` (today's zero-block files are unchanged), verified by regenerating Go from B3 in the scratch copy with the fix: `gofmt -l` lists neither file, 0 double-blank runs, `go build`/`go vet` clean and the consumer program still builds (`19-gofmt-fix-and-red-proof.log`). Two observations
  answered: the language tests branch on whether a name is aliased yet, but once the regeneration lands a matcher that
  never flips leaves the name absent and the real-class branch (`resolved.__name__ == name`) fails — red proof:
  with the `MailboxRawBodyResponseAllOfData` entry deleted from the regenerated scratch `sendmux_mailbox/__init__.py`, pytest reports `2 failed, 17 passed` — `AttributeError: module 'sendmux_mailbox' has no attribute 'MailboxRawBodyResponseAllOfData'` — and `19 passed` once restored (`20-alias-branch-red-proof.log`); the PHP per-day quota alias carries no property-typing assertion because php-nextgen flattens that
  union and nothing in `packages/php/management/src` references the class, so loading + alias target + deprecation
  message is the whole contract there (Ruby asserts union membership because its union model keeps the member).
  CodeRabbit: one finding (the OAS 3.1 parity assertion "cannot hold") refuted in-thread (reply `4056836022`): the 3.1
  rule `normalizeOpenApi31NullableAllOfBranches` rewrites the historical `allOf` into the identical `anyOf` idiom and
  the test passes in CI's own `normalize:check` log (`17-ci-verify-job.log:798,813`); CodeRabbit re-verified, withdrew
  the finding and resolved the thread (`4056836868`).
- CI on the review-fix head `d33be31` (run 35508242428): 37 checks pass again; `verify` fails at the same `generate:go`
  step, now with the planner's fuller message (`go/mailbox does not generate NilMailboxMessageContent, the replacement
  for NilMailboxMessageContentResponseData; regenerate from the schema this table targets or update the alias`);
  CodeRabbit status context `success`, no new finding. Settle sweep at 21:43 over checks, check-runs, status contexts,
  issue comments, review threads and reviews (`22-sweep-d33be31.log`): no finding without a reply, no reviewer check
  pending — 1 fixed (independent review) / 1 refuted (CodeRabbit, withdrawn) / 0 parked.

## Tests

Added: `scripts/normalize-openapi-for-codegen.test.mjs` (3, seen red), `scripts/deprecated-model-aliases.test.mjs` (3,
seen red under mutation), `packages/python/tests/test_mailbox_deprecated_aliases.py` (+2 parametrised),
`packages/python/tests/test_management_deprecated_aliases.py` (new, registered in `scripts/check-python.mjs`),
`packages/ruby/tests/test_mailbox_deprecated_aliases.rb` (+2), `packages/ruby/tests/test_management_deprecated_aliases.rb`
(new, registered in `scripts/check-ruby.mjs`), `packages/php/tests/DeprecatedModelAliasesTest.php` (new). Removed: none.
The language tests assert the compatibility contract in both states — a name that is still a real generated class
resolves silently under its own name; a name that has become an alias warns exactly once and is the class typing the
same field — so they pass today and exercise the alias branch after the regeneration (proved on the B3 scratch above).

## Expected per-package outcome of a plain regeneration after the v1.8.250 deploy

Commit typed `fix` → ts-mailbox 2.0.1→2.0.2, ts-management 2.0.1→2.0.2 (node-workspace cascade ts-sdk 2.0.2, ts-cli
1.7.2, ts-ai-sdk 0.5.2), python-mailbox 2.0.1→2.0.2, python-management 2.0.0→2.0.1, python-mcp 2.1.2→2.1.3, ruby-mailbox
2.0.1→2.0.2, ruby-management 2.0.0→2.0.1, rust unchanged (provenance digests only, `chore`), PHP by hand (management
2.1.1→2.1.2; mailbox already heads to 3.0.0 on `main`). Go: the 43 identifiers keep compiling; the residual member
renames on the eight `Provider*BodyQuotasPer*` unions and the five `Nil…`→component field retypes remain the owner's
call between `fix(go)` 2.0.1 and a `/v3` major (L17c).

## Completion

⏸ coded, not merged — PR #277 open for ROOT; never published, tagged or merged here.
Correctness: rule traced normaliser → 3.0.3 document → four generators on L17c's B3 spec; alias planner → four writers → generated
output today (byte-identical `packages/*`) and after B3 (aliases active, consumers compile / import / load).
Tests: listed above, each new suite seen red (normaliser: old rule; planner: mutation; alias branch: one alias entry deleted from the regenerated package → 2 failed with `AttributeError`, restored → green); removed none.
Journeys: not applicable (build-time codegen; no user-facing surface).
Status: coded, not merged.
Torn down: scratch copy `scratch-b3/` and `go-consumer/out` are artefacts under `.claude/artifacts/l17e/`, not worktrees; no
containers or servers spawned.
Parked: docs `main` ahead of the packages (CI `verify` red until the regeneration lane lands); PHP mailbox 3.0 may drop its
four shim entries outright; root `Gemfile.lock` rewritten by bundler during `pnpm build` (pre-existing, reverted locally).
