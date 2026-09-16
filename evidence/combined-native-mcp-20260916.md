# Native MCP 2.1.0 local preparation evidence

Status: local preparation complete; publication, production, and manual acceptance remain open.

## Scope and trace

- Base candidate: `23b6224a655abbfa848c61654d0be473224f0571`.
- `packages/python/mcp/pyproject.toml` and `server.json` already declare `2.1.0`.
- Before regeneration, `verifyRegistryVersion()` failed as required: `MCP contract version must match native project version` (`2.0.0 !== 2.1.0`).
- `checkPythonMcpDependencyFloors({ changedPackages: new Set(['mcp']) })` passed with `sendmux-core>=1.3.1,<2.0.0`; the floor was not changed.
- `pnpm generate:mcp` regenerated the contract from `OPENAPI_INPUT_DIR=../sendmux-docs-mcp-oauth`. Input/output hashes: App `2e32e665c99d26d47b4c208ee2de76b6249a47129afdecab19ccf8f50712d409`; Sending `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.
- Contract diff is limited to `package.version: 2.0.0 -> 2.1.0` and `provenance.build_inputs.pyproject.toml: 41696df... -> b3838c1a8c7c6505b555688af89da9c75100eb0f04b23e914e9d08b8d281b566`. Tool catalogue, schemas, runtime provenance, source hashes, and OpenAPI bytes are unchanged.
- The exact existing delivery-group entry moved from `Unreleased` to `2.1.0`; content was not rewritten. `README.md:121-125` is a Connection checks compatibility list, not a latest-release inventory, so it remains unchanged. Immutable `python-mcp-v1.7.0` already includes `mailbox_get_connection`, `management_get_connection`, and `sending_get_connection` in `curation.py:26`, `:205`, and `:340`.

## Commands and receipts

- `pnpm install --frozen-lockfile`: pass; lockfile unchanged. Warning: pnpm ignored build scripts for `@nestjs/core`, `@openapitools/openapi-generator-cli`, and `esbuild`.
- Native identity/dependency gates: pass after regeneration.
- `OPENAPI_INPUT_DIR=... pnpm drift:check`: pass; staged generated contract accepted. PHP generator emitted transient workspace changes, then post-processing left no sibling tracked drift.
- `pnpm build:python:dists`: pass. Local `sendmux_mcp-2.1.0-py3-none-any.whl` (`16d63be88feca67fde5c177fa51c2da4704c6a62fcecadbc0d04576644318fcc`) and `sendmux_mcp-2.1.0.tar.gz` (`65281234e5d1ca7e0f8577ae37152df8625cc04149fd7dcd4dd948bddaae8719`) passed Twine/artifact checks and installed-contract verification.
- `node scripts/check-mcp.mjs`: pass; 156 pytest cases passed. Warning: 22 upstream A2A `label()` deprecation warnings.
- `pnpm test:python-release-guardrails`: pass.
- `pnpm test:mcp-registry-version`: pass, 5/5.
- `pnpm test:release-state`: pass.
- `pnpm prepare:publish:pypi`: read-only selector pass; `.tmp/python-publish` contains exactly the MCP 2.1.0 wheel and sdist, no other files. No publication occurred.
- ROOT's preceding main CI run `35073891703` succeeded 29/29; Release Please `35073891701` and CodeQL `35073891162` also succeeded.
- ROOT's installed-candidate consumer: terminal 0, 97/97 tests, zero skips, own-site-packages `sendmux-mcp 2.1.0` plus `sendmux-core 1.3.1` provenance, and `pip check` all passed. Its six exact child PIDs/process groups and temporary fixture were verified absent.
- ROOT's conformance run: terminal 0; required legacy `70` successful/`0` skipped, modern `114` successful plus `1` INFO and `5` capability skips. Nine non-scored task-extension failures remain explicitly retained.

## Raw artifacts and cleanup

- Raw logs: `.claude/artifacts/native-mcp-2.1.0/` (`pnpm-install.log`, `pre-generation-gates.log`, `generate-mcp.log`, `post-generation-gates.log`, `drift-check.log`, `build-python-dists.log`, `check-mcp.log`, `python-release-guardrails.log`, `mcp-registry-version.log`, `release-state.log`, `prepare-pypi-publish.log`, `root-local-consumer.log`, `root-conformance.log`, `prepublish-live-canary.log`, and preceding CI receipts).
- Bounded owner PIDs `91222`, `91785`, `92241`, `92694`, `93633`, `93642`, `96202`, `98673`, and `1130` were all verified absent. Generator/test child PIDs recorded in the raw logs were also verified absent.

## Remaining gates

- ROOT owns remote writes, merge, tags, publication, deployment, registry confirmation, and manual acceptance.
- The prepublish live OpenAPI canary is red for both combined APIs and remains OPEN; this local package preparation does not resolve that release gate.
