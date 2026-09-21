# MCP 2.1.3 candidate qualification

Status: candidate qualified locally after the release-branch contract refresh; merge, publication and public acceptance remain pending.

## Source and correction

- Release PR #284 bot head `7de2a71e2e51bd01583be4241f44c24adf89a0ef`, parent `8fadb32df10f5e20d33a576a4b98639c6347c95a` (`origin/main` after #297). The release diff is exactly `.release-please-manifest.json`, MCP `CHANGELOG.md`, `pyproject.toml` and `server.json`; manifest, pyproject, server root/package and the dated changelog entry all say `2.1.3`; every sibling manifest value is unchanged from the parent.
- Required generation found one stale artifact: `packages/python/mcp/sendmux_mcp/mcp-contract.json` still declared `2.1.2` and the 2.1.2 pyproject hash (`5fc12ff664fea7f9418ef7c625177c311eca3ecb93a7a56c4d576db1180f38fb`). `pnpm generate:mcp` changes only `package.version` (`2.1.3`) and `provenance.build_inputs["pyproject.toml"]` (`f241bf566ef9b315d7db50df900a4e0150d9cbcf6917c4328072749da860794f`); no runtime code, schema, dependency constraint or tool contract changed. Committed as `b9cb22a` (`chore(mcp): refresh 2.1.3 release contract`).
- Contract SHA256: committed by the bot `e7a0e915a9ad6775e44aad48853b9e1cd46f6204e4c54790ce4a7c13e226163f`; regenerated `e225f0225b0d92563229f265366a611e6784d19332314a252271c4a9c49d7d7d`.
- CI on the unrefreshed head (run 35558752931): `verify` and `python-runtime` 3.10 to 3.14 red with `Error: Generated SDK package directories are stale.` and `ValueError: MCP contract is stale for the installed package or runtime` (`contract.py:173`); `test:release-state` 28/29 (`MCP contract version must match native project version`, actual `2.1.2`, expected `2.1.3`).
- Changelog: `894d5b5` opens the generated 2.1.3 section with the tool result schema fix; `0496214` drops the stale `## Unreleased` block that 26d4fc7 added and `python-mcp-v2.1.1` already shipped.
- App snapshot SHA256 `b42ce87003ae8d4ac80024ce9796cd96db97c5439c5e99d957682f6b6a1f5999`; sending snapshot SHA256 `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`. Both equal `Sendmux/docs` main `f7925f22a71e7d4151dfd10ebd8089b9a07f8a92`, the deployed app v1.8.250 schema.

## What 2.1.3 changes for a 2.1.2 user

The output schema of ten tools (`mailbox_batch_get_messages`, `mailbox_get_message`, `mailbox_get_thread`, `mailbox_list_body`, `mailbox_list_content`, `mailbox_list_messages`, `mailbox_list_thread_messages`, `mailbox_list_threads`, `management_create_mailbox`, `management_create_mailbox_key`) describes nullable references as `anyOf: [{ object }, { type: "null" }]`, so a JSON `null` validates; `mailbox_get_message` result data declares `message_id`, `in_reply_to`, `references` and `reply_to`. 54 tools, none added, removed or renamed; no input schema changed (2b9b2a5).

## Candidate checks (docs-main inputs from `Sendmux/docs` `f7925f22a71e7d4151dfd10ebd8089b9a07f8a92`; L19 worktree detached at the bot head with the identical refresh applied)

- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm canary:openapi`: exit 0; "Live OpenAPI specs match committed snapshots."
- `pnpm drift:check`: exit 1 only on the uncommitted refresh; staged, "Generated SDK package directories have no uncommitted drift." The same gate ran green as the pre-commit hook on `b9cb22a`, `894d5b5` and `0496214`.
- `pnpm conformance:mcp`: exit 0; 2025-11-25 84 passed / 0 failed; 2026-07-28 181 passed / 9 failed, all in unscored `tasks-*` extension scenarios; "MCP required scenarios passed".
- `pnpm build:python:dists`: exit 0; pytest 163 native + 10 LangChain passed; mypy clean (57, 1, 4 source files); 14/14 wheel/sdist Twine checks; "Installed contract verified: sendmux-mcp 2.1.3".
- `PYTHON_PATHS_RELEASED='["packages/python/mcp"]' pnpm prepare:publish:pypi`: exit 0; "Prepared 2 PyPI distribution file(s)".
- `node scripts/publication-guard.mjs candidate --sha 7de2a71e2e51bd01583be4241f44c24adf89a0ef`: exit 0 with the two snapshot hashes above.
- `pnpm test:release-state` 29/29, `pnpm test:publication-guard` 84/84, `pnpm test:mcp-registry-version` 5/5, `pnpm test:python-release-guardrails` passed.
- Unrefreshed head, for the record: `canary:openapi`, `conformance:mcp`, the publication guard and the three guard/registry/guardrail suites already passed; only the contract-dependent gates were red.
- `python-mcp-v2.1.3` absent on `origin`; PyPI `sendmux-mcp==2.1.3` HTTP 404 (latest 2.1.2); MCP Registry 2.1.3 HTTP 404 (latest `io.github.Sendmux/sendmux-mcp` 2.1.2).

## Retained artifacts and next gate

- Wheel `sendmux_mcp-2.1.3-py3-none-any.whl`: 150977 bytes; SHA256 `0b2579bf4c9f176b5896efda45905d5c633cd01e4f0ee4922b705e190d439458`.
- Sdist `sendmux_mcp-2.1.3.tar.gz`: 136811 bytes; SHA256 `66ad1c0514640b9ba5c74ac9fa2bd94e2bac4dcf901b62b0de906bc1a0f66f69`.
- Both embed `mcp-contract.json` `e225f0225b0d92563229f265366a611e6784d19332314a252271c4a9c49d7d7d`, `openapi-app.json` `b42ce870…` and `openapi-sending.json` `c1f82f9b…` (full values above).
- Local bulk evidence: `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk/.claude/artifacts/l19/` (unrefreshed head), `…/l19/v2/` (refreshed, `candidate-dist/`), `…/python-mcp-2-1-3/` (regeneration and commit hook logs).
- Remaining gates: CI green on the release-branch head that carries the refresh, merge, the Release Please tag, guarded publication, PyPI and registry readback whose member hashes equal the three above, hosted image v1.0.17, and the MCP cohort re-run.
- No published version was modified, and no credentials or production fixtures were used by candidate qualification.
