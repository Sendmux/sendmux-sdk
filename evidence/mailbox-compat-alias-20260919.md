# Mailbox compat alias: `MailboxRealtimeMessageAllOfBody` kept as a deprecated alias, 2.0.1 patches instead of majors

Status: coded, not merged. PR open on `agent/mailbox-compat-alias` from `origin/main` `0c8f9675`; code head `7394f92bff82c1d96906d8d945de083f80773b0e` (evidence commit follows). No merge, publish, tag, or bot-branch push.

## Decision and inputs

- Operator decision 2026-09-19 16:05: keep the old generated name as a deprecated alias of the new one and ship `sendmux-mailbox` 2.0.1 on PyPI and RubyGems instead of the 3.0.0 majors that #258 / #262 currently cut from the `fix(python-mailbox)!` (`1a57997`) and `fix(ruby-mailbox)!` (`9c05be1`) commits of #257 (`628b161`). The alias is removed in the next planned major. Umbrella bounds (`sendmux-sdk`, `langchain-sendmux`: `sendmux-mailbox>=2.0.0,<3.0.0`; Ruby `sendmux-sdk`: `>= 2.0.0, < 3.0`) are unchanged.
- OpenAPI source: `Sendmux/docs` main `86b0f45` at `/Users/rj/Desktop/GIT-REPOS/sendmux-docs` through `OPENAPI_INPUT_DIR` on every generator run; `openapi-app.json` `b901839a…`, `openapi-sending.json` `c1f82f9b…` (the committed MCP snapshots, per the publication guard below).
- Published baselines inspected: `sendmux_mailbox-2.0.0-py3-none-any.whl` (`pip download --no-deps`) exports `Mailbox` and `MailboxRealtimeMessageAllOfBody` in `__all__` and ships `models/mailbox.py` + `models/mailbox_realtime_message_all_of_body.py`; `sendmux-mailbox-2.0.0.gem` ships `models/mailbox.rb` + `models/mailbox_realtime_message_all_of_body.rb`.
- Reference sweep: no README, guide, test, `sendmux-docs` page or non-generated source in this repo references `MailboxRealtimeMessageAllOfBody` or the removed `Mailbox` model (grep over `*.py *.rb *.md *.mjs *.ts *.json *.php *.go` and the docs checkout; only `evidence/deployed-schema-regen-20260919.md`, the PHP 3.0 changelog/UPGRADING and the Ruby management `Mailbox` model, which is a different class, match).
- `Mailbox` model: no same-field replacement exists. `MailboxMe` is a strict superset (adds optional `quota_used_bytes`, different `__properties`/`to_dict` shape), so per the brief the removal is documented as a deprecation-free removal of a never-referenced artefact in the 2.0.1 leads rather than aliased.
- Toolchain: node v24.21.0, pnpm 10.22.0, Python 3.12.8 (venv `.tmp/python-venv`), Ruby 3.4.1 (rbenv), openapi-generator-cli 2.32.0.

## Shape

Both aliases are emitted by the generator post-processors, never hand-edited into generated files, and both post-processors fail loud when the replacement leaves the generated exports/requires or the deprecated name reappears (the table then needs updating or removal):

- Python (`scripts/generate-python.mjs`, `writeDeprecatedModelAliases`, driven by `surfaces[mailbox].deprecatedModelAliases`): appends a PEP 562 module `__getattr__` to `sendmux_mailbox/__init__.py` and `sendmux_mailbox/models/__init__.py`. `MailboxRealtimeMessageAllOfBody` resolves to `MailboxRealtimeMessageBody` and emits `DeprecationWarning("MailboxRealtimeMessageAllOfBody is deprecated; use MailboxRealtimeMessageBody. It will be removed in sendmux-mailbox 3.0.")` with `stacklevel=2` (attributed to the caller's line). Unknown names still raise `AttributeError`. The alias is absent from `__all__` and `dir()`.
- Ruby (`scripts/generate-ruby.mjs`, `writeDeprecatedModelAliases`, driven by `surfaces[mailbox].deprecatedModelAliases`): appends `MailboxRealtimeMessageAllOfBody = MailboxRealtimeMessageBody` + `deprecate_constant :MailboxRealtimeMessageAllOfBody` inside `module Sendmux::Mailbox::Generated` to the generated entry `lib/sendmux_mailbox_generated.rb` (rubocop-excluded, staleness-tracked). Ruby 3.4.1 probe: one warning per call site (inline constant cache suppresses repeats), `equal?` holds, `const_get` warns each time.
- Go/TS/PHP: no change. The Go rename sits inside the pending v2.0.0 major (`release-as`), PHP mailbox 3.0 is already a breaking split release with `UPGRADING-3.0.md`, and the TS entrypoint never exported the removed alias.
- `release-please-config.json`: `"release-as": "2.0.1"` on `packages/python/mailbox` and `packages/ruby/mailbox`, mirroring the existing override shape (two inserted lines, `git diff --numstat` 2/0). Retire both after 2.0.1 ships (precedent `a88a851`).

## RED then GREEN (TDD)

Python, `packages/python/tests/test_mailbox_deprecated_aliases.py` (registered in `check-python.mjs` `sharedTests`, whose coverage assertion pins the file list). RED on `0c8f967` before the generator change (`.claude/artifacts/l15d/01-python-red.log`, 3 failed / 4 passed):

```
>           alias = module.MailboxRealtimeMessageAllOfBody
E           AttributeError: module 'sendmux_mailbox' has no attribute 'MailboxRealtimeMessageAllOfBody'. Did you mean: 'MailboxRealtimeMessageBody'?
E           ImportError: cannot import name 'MailboxRealtimeMessageAllOfBody' from 'sendmux_mailbox' (...sendmux_mailbox/__init__.py). Did you mean: 'MailboxRealtimeMessageBody'?
```

GREEN after `pnpm generate:python` (`04-python-green.log`): `7 passed`, run with `-W error::DeprecationWarning` so nothing warns outside `pytest.warns`. Cases: old name `is` new name with exactly one `DeprecationWarning` carrying the exact message (both modules); `from sendmux_mailbox import MailboxRealtimeMessageAllOfBody` warns and resolves; unknown attribute still `AttributeError` (both modules); alias not in `__all__` while the new name is; `MailboxRealtimeMessage.from_dict(...).body` is `MailboxRealtimeMessageBody` and the field annotation is that class, with `DeprecationWarning` escalated to an error.

Ruby, `packages/ruby/tests/test_mailbox_deprecated_aliases.rb` (registered in `check-ruby.mjs`). RED on `0c8f967` (`05-ruby-red.log`, 3 runs, 1 error):

```
NameError: uninitialized constant Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody
```

GREEN after `pnpm generate:ruby` (`07-ruby-green.log`): `3 runs, 8 assertions, 0 failures, 0 errors, 0 skips`. Cases: with `Warning[:deprecated] = true` (restored in `teardown`), one literal access yields exactly one stderr line containing `warning: constant Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody is deprecated` and `assert_same` the new class; the new constant emits nothing; `MailboxRealtimeMessage.build_from_hash(...).body` is a `MailboxRealtimeMessageBody`.

Value test: each red is the realistic regression (the alias table dropped or the generator not re-run); the `__all__`/unknown-attribute cases fail if the alias is added as a plain module attribute or the `__getattr__` swallows misses.

## Gates on the head

- `17-drift-check-head-7394f92.log`: `OPENAPI_INPUT_DIR=<docs> pnpm drift:check` exit 0 on `7394f92` ("Generated SDK package directories have no uncommitted drift"), tree clean. The first run on the uncommitted tree (`10-drift-check.log`) listed exactly the three post-processed files as stale and nothing else, so every other generated package (Go, PHP, TS, MCP, CLI, Python/Ruby sending and management) regenerates byte-identical from the snapshot.
- `12-check-python.log`: `node scripts/check-python.mjs` exit 0; mypy "no issues found" in 56 (native), 1 (sdk) and 4 (langchain) source files; pytest 143 native + 10 langchain = 153 shared tests, 0 skipped/xfailed.
- `11-check-ruby.log`: `RUBY_PATHS_RELEASED='["packages/ruby/mailbox"]' node scripts/check-ruby.mjs` exit 0; rubocop 31 files no offences; 34 runs, 217 assertions, 0 failures across the five suites; 5 gems built.
- `08-test-release-state.log` `pnpm test:release-state` 29/29; `09-test-publication-guard.log` `pnpm test:publication-guard` 81/81.
- `16-publication-guard-candidate.log`: `node scripts/publication-guard.mjs candidate --sha 7394f92…` → "Live OpenAPI specs match committed snapshots." with the hashes above.
- Every commit ran `.githooks/pre-commit` (`pnpm drift:check`); the Ruby + config parts were stashed while committing the Python change (and the config while committing Ruby) because the hook checks staleness against git's temporary index, so a pathspec commit reports the other staged generated file as stale.

## Commits

- `e0b3456` fix(python-mailbox): keep MailboxRealtimeMessageAllOfBody as a deprecated alias
- `f1108bf` fix(ruby-mailbox): keep MailboxRealtimeMessageAllOfBody as a deprecated constant
- `7394f92` chore(release): pin python-mailbox and ruby-mailbox to 2.0.1

## Release follow-through (Deliverable 2, after ROOT merges)

Release Please regenerates #258 / #262 as 2.0.1 with the `!` commits still rendered as "⚠ BREAKING CHANGES". The drafted leads in `.claude/artifacts/l15d/lead-python-mailbox-2.0.1.md` and `lead-ruby-mailbox-2.0.1.md` replace that block with `### Deprecated` (old name aliases the new one; removed in the next major) and `### Changed` (models regenerated from the deployed flattened schemas; wire format unchanged; `Mailbox` removed without a deprecation period), keep the generated Bug Fixes bullets, and add no Unreleased block (#253). The alias PR's merge-commit title lands as an unscoped Bug Fixes bullet in both changelogs, as `628b161` did.

## Parked

- Deep import path `sendmux_mailbox.models.mailbox_realtime_message_all_of_body` is not shimmed; only the package-level names are aliased, per the brief.
- Retire the two `release-as: 2.0.1` overrides once both 2.0.1 releases exist.
- The sendmux app project's Claude Code PreToolUse hook (`.claude/hooks/pre-commit-gate.sh`) greps each command line for `^git commit` and runs `pnpm tsc --noEmit` in the session cwd; with `sendmux-sdk` as cwd (no root `tsconfig.json`) that exits 1 and blocks any line-initial `git commit` regardless of code (`.claude/artifacts/l15d/00-hook-tsc-in-session-cwd.log`). Commits here used the ordinary single-line `cd <worktree> && git commit …` form; the SDK repo's own hook still ran. Suggest the hook exit 0 unless the cwd is the sendmux app checkout.
