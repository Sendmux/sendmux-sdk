# Mailbox variables and delivery-group routing SDK evidence — 2026-09-16

## Status

⏸ Local source handoff prepared and verified on `agent/mailbox-variables-routing`; unmerged, unpushed, untagged, unversioned, unpublished, and undeployed. The coordinated release hold in `.claude/coordination/mcp-release-hold-20260916.md` remains binding.

Combined source snapshots:

- App SHA-256: `2e32e665c99d26d47b4c208ee2de76b6249a47129afdecab19ccf8f50712d409`
- Sending SHA-256: `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`

## Prepared behavior

- Regenerated affected TypeScript, Python, Go, PHP, and Ruby Management and Sending clients from the explicit combined snapshots.
- Management clients expose provider variables and delivery-group log fields. Sending clients accept one delivery group or a list of groups that narrows the eligible provider pool.
- Rust exposes an untagged `DeliveryGroup` string/list union and forwards it through single and batch payloads.
- AI SDK and LangChain `send_email` tools accept and forward one group or a list of groups that narrows the eligible provider pool.
- CLI single and batch JSON bodies preserve `delivery_group`.
- MCP tools/list exposes the Sending union; `email.send` permissions remain required; hosted proxy forwarding preserves the group list in the operation envelope.
- ProviderVariables in the packaged MCP OpenAPI has `maxProperties: 50`, key `maxLength: 64`, key pattern `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`, and string value `maxLength: 4096`.
- Affected package changelogs contain Unreleased entries. Release/version metadata is unchanged.

## Red evidence

- Rust public contract before implementation: `error[E0599]: no method named 'delivery_group' found for struct 'EmailSendRequest'`.
- LangChain first union forwarding attempt: Pydantic rejected the raw group list because the generated client requires its union wrapper.
- Python source-cohort gate caught an eager import against the currently published Sending SDK: `ModuleNotFoundError: No module named 'sendmux_sending.models.email_send_request_delivery_group'`; the import is now lazy on feature use.
- Python typing then caught the new fixture: `test_delivery_group.py:10: error: Function is missing a type annotation [no-untyped-def]`.
- Initial affected drift rerun used the generator's default sibling snapshot and reverted generated feature models. Final generation exports `OPENAPI_INPUT_DIR` for the whole pipeline and two consecutive explicit-input passes produced identical diff hashes.
- Surface coverage caught stale Rust snapshot provenance: `Rust openapi-app.json provenance hash drift`; both recorded hashes now match the combined snapshots.
- Rust transport mutation control temporarily disabled `delivery_group` serialization on the actual request model. The loopback single/batch test failed with captured `Null` instead of `["dgrp_primary", "dgrp_backup"]` (`rust-delivery-group-negative-control-red.log`). This is a mutation-control red, not a pre-feature failure; `rust/src/sending.rs` was restored from the retained source copy before the green run.

## Green evidence

Raw logs are under `.claude/artifacts/mailbox-variables-routing/`.

- TypeScript Sending, Management, and AI SDK builds; AI SDK: 3 passed, 0 skipped (`check-ts-final.log`).
- Python complete consumer gate: 143 shared/native plus 9 LangChain passed, 0 skipped (`check-python.log`).
- LangChain group-list forwarding: 1 passed (`check-langchain-focused.log`).
- MCP complete gate: 155 passed; wheel/sdist and installed contract verified (`check-mcp.log`).
- MCP hosted tools/list, permissions, and forwarding: 48 passed (`check-mcp-hosted-focused.log`).
- Go generated checks and `go test ./...` passed (`check-go-final.log`).
- PHP syntax/static analysis, 47 tests/234 assertions, OAuth consumers, and split dry-run passed (`check-php-final.log`).
- Ruby generated checks and tests passed with zero failures/skips (`check-ruby-final.log`).
- Rust full tests and doc tests passed (`check-rust.log`). The focused loopback transport test additionally passed 1/1 after capturing `delivery_group` in both real single and batch HTTP request bodies; the redundant serialization-only test was removed under the duplicate-test rule.
- CLI real single and batch forwarding gate passed (`check-cli.log`).
- `normalize:check` passed for all four normalized artifacts (`check-contract-drift.log`, before the expected unstaged-tree staleness stop).
- `verify:sdk-staleness` passed with generated paths temporarily staged, then the index was reset (`check-sdk-staleness.log`).
- Surface coverage passed against the explicit combined snapshots (`check-surface-coverage.log`).
- Explicit affected regeneration was idempotent: `explicit-drift-before.sha256` equals `explicit-drift-after.sha256`.
- `git diff --check` and Rust format check passed.

## Scope preservation

- No PHP Mailbox, TypeScript Mailbox, Python Mailbox, Ruby Mailbox, package version, dependency, lockfile, release, or publication path changed.
- The reviewed PHP Mailbox corrections at release-worktree HEAD `9c7036a2c661b9f03ae658f3494507533ef87404` were not overwritten.
- No commit, push, merge, tag, package publication, or deployment was performed.
