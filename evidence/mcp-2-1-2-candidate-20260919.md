# MCP 2.1.2 candidate qualification

Status: candidate qualified locally after generated-contract correction; merge, publication and public acceptance remain pending.

## Source and correction

- Release PR #260 qualified at `7c6e967da2f606b6da245ac4e1a193d6a081a734`, parent `5135eb1c1684add7151d7fc321334e354a22c7b3` (`origin/main`). The earlier qualification at `fe9fbf7db8a6661f08298ef2dca37b8fc03b9433` (parent `b2f10276818dce43ad848fba1f9141ef82df9332`) had the same `packages/python/mcp` tree `9f0b79ad97538023f82f5ab3b27260d137d0c00b` and the same `packages/python/core` tree; every check below was re-run on the regenerated head.
- Release diff is exactly `.release-please-manifest.json`, MCP `CHANGELOG.md`, `pyproject.toml`, and `server.json`. Manifest, pyproject, server root/package and first dated changelog entry all say `2.1.2`; every sibling manifest value is unchanged from the parent.
- Package identity: `packages/python/mcp/sendmux_mcp` tree `b8153ce666d6c4bee49e80dc2a8a0aa88448d423`, equal to `origin/main` `5135eb1c1684add7151d7fc321334e354a22c7b3`.
- Required generation found one stale artifact: `packages/python/mcp/sendmux_mcp/mcp-contract.json` still declared `2.1.1` and the 2.1.1 pyproject hash. The generator output changes only `package.version` (`2.1.2`) and `provenance.build_inputs["pyproject.toml"]` (`5fc12ff664fea7f9418ef7c625177c311eca3ecb93a7a56c4d576db1180f38fb`). No runtime code, schema, dependency constraint or tool contract changed.
- Contract SHA256: committed `6dd64f09cf493b04baaf53a71506af5435de96b24c2b1a0a2f221dfd264d92ac`; generated `80bc0082106791e432aa6351a06436300f6b83579b82f7023fba5a4aeb856f56`.
- App snapshot SHA256 `b901839a0d8bd7504295c4cbcab9d0b4db38b9cca32b435504d15f5e6ef81e98`; sending snapshot SHA256 `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`. Both equal `Sendmux/docs` main `86b0f456a9da81222df163f31c3bd4727a81df5a`, the deployed app v1.8.248 schema.

## What 2.1.2 changes for a 2.1.1 user

- 54 tools, none added, removed or renamed; no `input_schema`, description or annotation changed.
- `output_schema` changed for exactly `mailbox_get_me`, `mailbox_get_message`, `mailbox_get_thread` and `management_create_webhook`: `result.data` was an `allOf` of two closed objects (each `additionalProperties: false`), which no real response satisfies; each is now one flat closed object whose `properties` and `required` equal the union of the former branches. After the change no tool carries a closed `allOf` anywhere in its `output_schema`.
- Live `tools/list` over streamable-http against the built candidate (`serverInfo.version` `2.1.2`, 48 mailbox+management tools) returned `inputSchema`/`outputSchema` equal to the candidate contract for every tool.

## Candidate checks (docs-main inputs, `OPENAPI_INPUT_DIR=/Users/rj/Desktop/GIT-REPOS/sendmux-docs`)

- `pnpm install --frozen-lockfile`: exit 0.
- Candidate-owned `pnpm canary:openapi`: exit 0; "Live OpenAPI specs match committed snapshots."
- `pnpm drift:check`: exit 1 at `verify:sdk-staleness` with the single stale contract above; the generated correction is retained rather than suppressing the gate.
- `node scripts/check-mcp.mjs`: exit 0; `sendmux_mcp.contract --check` clean; mypy "no issues found in 30 source files"; pytest 158 passed; Twine 2/2 PASSED; installed-wheel contract verified `sendmux-mcp 2.1.2` outside the checkout; fixture removed.
- `pnpm conformance:mcp`: exit 0; 2025-11-25 84 passed / 0 failed; 2026-07-28 181 passed / 9 failed, all failures in unscored `tasks-*` extension scenarios; "MCP required scenarios passed".
- `pnpm build:python:dists`: exit 0; 153/153 shared Python tests (143 native + 10 LangChain), 0 skipped/xfailed/xpassed; mypy clean (55, 1, 4 source files); 14/14 wheel/sdist Twine checks; installed MCP contract verified.
- `PYTHON_PATHS_RELEASED='["packages/python/mcp"]' pnpm prepare:publish:pypi`: exit 0; exactly two MCP artifacts selected.
- `node scripts/publication-guard.mjs candidate --sha 7c6e967da2f606b6da245ac4e1a193d6a081a734`: exit 0; "Live OpenAPI specs match committed snapshots." with the two snapshot hashes above.
- `pnpm test:release-state` 29/29, `pnpm test:publication-guard` 84/84, `pnpm test:mcp-registry-version` 5/5, `pnpm test:python-release-guardrails` passed.
- MCP core floor remains `sendmux-core>=1.3.1,<2.0.0`; manifest core is `1.3.1`.
- `python-mcp-v2.1.2` absent locally and on `origin`; PyPI `sendmux-mcp==2.1.2` HTTP 404 (latest 2.1.1); MCP Registry latest `2.1.1`.

## Retained artifacts and next gate

- Wheel `sendmux_mcp-2.1.2-py3-none-any.whl`: 150530 bytes; SHA256 `539a7ae2e2f8d84d4f7abc900a462c6f5bded4679ede64d9b7ccb12da1dd56d4`.
- Sdist `sendmux_mcp-2.1.2.tar.gz`: 136346 bytes; SHA256 `69fd78df47474cc0704197aed3b05016615dfa99479ebc521543f15a19c1a401`.
- Two independent builds (`check-mcp` and `build:python:dists`) produced byte-identical archives. The wheel embeds the generated contract (`80bc0082…`) and both snapshots (`b901839a…`, `c1f82f9b…`).
- Local bulk evidence: `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk/.claude/artifacts/l15c/` (first qualification: `05-generated-drift.diff`, `08-tools-list-before-after.log`, `09-live-tools-list.json`, `candidate-dist/`) and `…/l15c/v2/` (regenerated head: `02-candidate-preflight.log`, `03-guard-bot-head.log`, `04-drift-check.log`, `05-check-mcp.log`, `06-conformance-mcp.log`, `07-build-python-dists.log`, `08-publish-dist.sha256`, `10-live-tools-list.log`).
- Mandatory pre-commit regeneration verifies the staged correction; settled PR review, guarded publication, exact public-source identity, fresh public-installed acceptance and the hosted image release remain separate gates.
- No published version was modified, and no credentials or production fixtures were used by candidate qualification.
