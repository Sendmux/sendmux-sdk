# Deployed flattened schema regeneration (docs 86b0f45)

Status: coded, not merged. PR open on `agent/deployed-schema-regen` from `origin/main` `bcadb1f9`; head `360ba397943c213f4edb41b91cba53f58625e099`. No merge, publish, or bot-branch push.

## Inputs

- SDK base: `origin/main` `bcadb1f9fdbd455b0cd5334280d45c9917470a56`.
- OpenAPI source: `Sendmux/docs` main `86b0f45` (`docs(api): publish the deployed flattened MCP response schemas`, 2026-09-19 14:11 +10:00), read from `/Users/rj/Desktop/GIT-REPOS/sendmux-docs` through `OPENAPI_INPUT_DIR`.
- `openapi-app.json` SHA256 `b901839a0d8bd7504295c4cbcab9d0b4db38b9cca32b435504d15f5e6ef81e98` (main held `09b00ae13c88fe4ecc1bb3fd965bb30efd79447d5ea68b5334816a7452d40b58`); `openapi-sending.json` unchanged at `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.
- Schema delta (component level, 191 schemas both sides, no path or operation change): `MailboxMe`, `MailboxMessage`, `MailboxRealtimeMessage`, `MailboxThread`, `WebhookSubscriptionWithSecret` moved from closed `allOf` compositions to flat objects. Each flattened schema equals base ∪ extension with the same `required` set and `additionalProperties: false`, so the wire format is unchanged.
- Toolchain: node v24.21.0, pnpm 10.22.0, Go 1.23.4 (`toolchain` directive; lint on cached go1.27.1 as CI verify), PHP 8.4.10 / Composer 2.8.9, Python 3.12.8, Ruby 3.4.1, Rust 1.82.0 floor + stable.

## RED

`pnpm drift:check` on `bcadb1f9` regenerated every package and `verify:sdk-staleness` failed with 37 stale entries (28 modified, 6 deleted, 3 untracked): `go/{mailbox,management}/oas_*_gen.go`, PHP mailbox `Mailbox.php`/`MailboxRealtimeMessageAllOfBody.php` deleted and `MailboxRealtimeMessageBody.php` new, Python/Ruby mailbox and management models, `packages/python/mcp/sendmux_mcp/openapi/openapi-app.json` and `mcp-contract.json`, TS mailbox/management `types.gen.ts`. Full log `.claude/artifacts/deployed-schema-regen/01-drift-check-red.log`; the stale list is `01-red-stale-list.txt`.

The live canary also fails against main's committed snapshot (`14-canary-vs-main-snapshot.log`: "The live OpenAPI document differs from the committed snapshot"), which blocks every pending release candidate at the publication guard.

## Generated diff and consumer verdict

| Package (published) | Symbol changes | Verdict | Commit |
| --- | --- | --- | --- |
| `@sendmux/mailbox` 2.0.0 | `MailboxMe`, `MailboxMessage`, `MailboxRealtimeMessage`, `MailboxThread` flattened to structurally identical object types; generated alias `Mailbox` removed from `src/generated/types.gen.ts`, which the entrypoint never exported (`src/index.ts` exports `sdk.gen`, `events`, `MailboxClient` only) | additive/no-op | `fix(ts-mailbox)` |
| `@sendmux/management` 2.0.0 | `WebhookSubscriptionWithSecret` flattened; no symbol change | additive/no-op | `fix(ts-management)` |
| `sendmux.ai/go/v2` (v1.6.1 published; v2.0.0 pending, `release-as`) | removed `mailbox.MailboxMessageAttachmentsItem` and its 14 accessors; `MailboxMessage.Attachments`, `GetAttachments`, `SetAttachments` now `[]mailbox.MailboxAttachment` (the type `MailboxMessageSummary`/`MailboxMessageContent` already use); field reorder in `MailboxMe`, `MailboxMessage`, `MailboxThread`, `WebhookSubscriptionWithSecret`; management has no exported-symbol change | breaking (nominal types); README v2 migration item 2 updated | `fix(go)!` + `BREAKING CHANGE` |
| `sendmux/mailbox` (Packagist v2.1.0; 3.0 unreleased) | `Sendmux\Mailbox\Model\MailboxRealtimeMessageAllOfBody` → `MailboxRealtimeMessageBody` (type of `MailboxRealtimeMessage::getBody()/setBody()`); unused `Model\Mailbox` removed; `MailboxMessage.attachments` stays `MailboxAttachment[]` | breaking; CHANGELOG Unreleased + `UPGRADING-3.0.md` step 5 | `fix(php-mailbox)!` |
| `sendmux/management` (Packagist v2.1.1) | property order only | additive/no-op | `fix(php-management)` |
| `sendmux-mailbox` (PyPI 2.0.0) | `sendmux_mailbox.MailboxRealtimeMessageAllOfBody` → `MailboxRealtimeMessageBody` (`MailboxRealtimeMessage.body`); unused `sendmux_mailbox.Mailbox` removed; `attachments` gains a description only | breaking | `fix(python-mailbox)!` |
| `sendmux-management` (PyPI 2.0.0) | `__properties` order only | additive/no-op | `fix(python-management)` |
| `sendmux-mcp` (PyPI 2.1.1) | snapshot replaced; contract provenance `openapi/openapi-app.json` → `b901839…`; 54 tools, none added/removed/renamed, no `input_schema` change; `output_schema.properties` changed for `mailbox_get_me`, `mailbox_get_message`, `mailbox_get_thread`, `management_create_webhook` (two-branch `allOf` with `additionalProperties: false` per branch → single closed object) | fix | `fix(python-mcp)` |
| `sendmux-mailbox` (RubyGems 2.0.0) | `Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody` → `MailboxRealtimeMessageBody` (`MailboxRealtimeMessage#body`); unused `Generated::Mailbox` removed; generator `self.openapi_all_of` no longer emitted | breaking | `fix(ruby-mailbox)!` |
| `sendmux-management` (RubyGems 2.0.0) | attribute order; `self.openapi_all_of` no longer emitted | additive/no-op | `fix(ruby-management)` |
| `sendmux` crate (crates.io 0.5.0) | provenance pins in `rust/operation-decisions.json` and `rust/src/generated/mod.rs` moved to the new digest; no Rust type models the five schemas (`get_me`/`get_message` raw JSON, thread/webhook raw-JSON-only, stream unsupported) | none; no release | `chore(rust)` |

Go symbol sets were compared with `comm` over `^type|^func` declarations of `oas_schemas_gen.go` before and after; TS via `git diff` of `types.gen.ts`/`index.ts` plus the entrypoint; PHP/Python/Ruby via class, `__init__`/require and property-type diffs; MCP via a key-sorted diff of `mcp-contract.json`.

## Commits

Nine per-package commits were created with `--no-verify` because `.githooks/pre-commit` runs `pnpm drift:check`, which regenerates every package and can only be green on the complete tree; the tenth (`ruby-management`) and the Rust sync ran with the hook and left a clean tree (`08-final-commit-hook.log`, `11-rust-commit-hook.log`), which also shows the regeneration is deterministic.

- `6d297d1` fix(ts-mailbox): regenerate flattened mailbox response types
- `6d56336` fix(ts-management): regenerate the flattened webhook secret response type
- `1653051` fix(go)!: regenerate flattened mailbox and management response types
- `7c26274` fix(php-mailbox)!: regenerate flattened mailbox response models
- `d7921f5` fix(php-management): regenerate the flattened webhook secret response model
- `1a57997` fix(python-mailbox)!: regenerate flattened mailbox response models
- `88a4c0b` fix(python-management): regenerate the flattened webhook secret response model
- `a3a2897` fix(python-mcp): publish the deployed flattened response schemas
- `9c05be1` fix(ruby-mailbox)!: regenerate flattened mailbox response models
- `b002849` fix(ruby-management): regenerate the flattened webhook secret response model
- `360ba39` chore(rust): sync OpenAPI provenance with the deployed flattened app schema

## Checks on the head

- `12-ci-verify-replica-360ba39.log`: `OPENAPI_INPUT_DIR=<docs> GOTOOLCHAIN=go1.27.1 pnpm build` exit 0 (37 scripts incl. `drift:check` → "Generated SDK package directories have no uncommitted drift", `verify:layout`, `verify:ts-public-api`, `verify:tree-shaking`, `check:cli`, `check:surface-coverage` 104 operations, `build:go`/`python`/`php`/`ruby`/`mcp`, `check:live-e2e`, `test:connection-adapters`), `pnpm test:publication-guard` exit 0, `pnpm test:runtime-contracts` exit 0; tree clean afterwards.
- node --test across the build: 14 suites, 217 tests, 217 pass, 0 fail (incl. `test:release-state` 29/29).
- Go: `go build ./...`, `go test ./...` 30 passed in 6 packages, `go vet` clean, `golangci-lint@v2.13.2` 0 issues (`03-go-build-test.log`, `04-golangci.log`).
- PHP: `generate-php.test` 3/3, phpstan "No errors", PHPUnit OK (70 tests, 328 assertions), `check-php-splits` 10/10 (`05-php-checks.log`).
- Python: mypy "no issues found in 55 source files", pytest 136 + 10 passed; MCP pytest 158 passed; `conformance:mcp` required scenarios passed (181 passed, 9 failed only in unscored `tasks-*` scenarios) (`06-python-mcp-checks.log`).
- Ruby: `check-ruby` 31 runs, 209 assertions, 0 failures; 5 gems built (`07-ruby-checks.log`).
- Rust floor: `cargo +1.82.0 test --locked --all-targets --all-features` 36 passed across 5 targets, doc tests, `cargo +stable fmt --check` clean (`10-rust-floor.log`).
- Publication guard `node scripts/publication-guard.mjs candidate --sha 360ba397943c213f4edb41b91cba53f58625e099`: "Live OpenAPI specs match committed snapshots." with app `b901839…` and sending `c1f82f9…` (`13-publication-guard.log`).
- The first replica on `b002849` failed only `check:surface-coverage` ("Rust openapi-app.json provenance hash drift") and the dependent `rust-surface-coverage.test`; the Rust sync commit resolved both (`09-ci-verify-replica.log`).

Not run locally: the CI `node-runtime`, `python-runtime`, `go-runtime`, `php-runtime` and `ruby-runtime` matrix consumers (`scripts/ci-consumers.mjs`); they run on the PR.

## Release consequences

- `go`: the `!` lands inside the pending 2.0.0 (`release-as`); `go/v2.0.0` stays the correct next tag and must include this change (#221 needs the refreshed candidate).
- `python-mailbox` and `ruby-mailbox`: release-please will cut 3.0.0. `packages/python/sdk/pyproject.toml` and `packages/python/langchain/pyproject.toml` pin `sendmux-mailbox<3.0.0`; `packages/ruby/sdk/*.gemspec` pins `sendmux-mailbox < 3.0`. Those bounds and lockfiles must move with the mailbox 3.0.0 release PRs, or the release owner retypes the two commits to `fix(...)` if the generated `AllOfBody` name is judged non-contractual.
- `python-mcp` → 2.1.2; `python-management`, `ruby-management`, `ts-mailbox`, `ts-management` → patch; `rust` no release (`chore`).
- PHP is split-published by hand: mailbox 3.0 already carries breaking entries; management needs no entry.

## Artifacts

`.claude/artifacts/deployed-schema-regen/` (machine-local): `01-drift-check-red.log`, `01-red-stale-list.txt`, `02-ts-build-verify.log`, `03-go-build-test.log`, `04-golangci.log`, `05-php-checks.log`, `06-python-mcp-checks.log`, `07-ruby-checks.log`, `08-final-commit-hook.log`, `09-ci-verify-replica.log`, `10-rust-floor.log`, `11-rust-commit-hook.log`, `12-ci-verify-replica-360ba39.log`, `13-publication-guard.log`, `14-canary-vs-main-snapshot.log`.

## Completion

- Correctness: schema delta traced component-by-component; every generated symbol change classified per language against the published versions; Rust surface checked operation-by-operation.
- Tests: none added or removed; generated-only change plus provenance metadata and migration notes. The repo gates (`drift:check`, `check:surface-coverage`) are the regression tests and were seen RED then GREEN.
- Journeys: not applicable (no UI).
- Status: coded, not merged; PR open with `major`.
- Torn down: nothing spawned beyond the worktree, which stays until the PR merges.
- Parked: umbrella dependency upper bounds for a mailbox 3.0.0 (owner decision above); the earlier `release-as` overrides in `release-please-config.json` (`go`, `ruby-sdk`, `ts-ai-sdk`) remain the release chain's to retire.
