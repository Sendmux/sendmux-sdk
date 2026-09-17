# MCP 2.1.1 candidate qualification

Status: candidate qualified locally after generated-contract correction; publication and public acceptance remain pending.

## Source and correction

- Release PR239 starts at `14518515cdb24f2a7450148d72e6c1dc9ed39d29`, parent `535060586283912ce322551ed3a2b22e4fde8108`.
- Manifest, package metadata, server manifest and changelog agree on `2.1.1`; sibling manifest values remain unchanged.
- Required generation found one stale artifact: `packages/python/mcp/sendmux_mcp/mcp-contract.json` still declared `2.1.0` and its previous pyproject hash.
- Committed generator output changes only that package version and build-input hash. No runtime code, schemas, dependency constraints or tool contracts changed.
- Generated contract SHA256: `2f675ba9e07d9afc5da94c0109c85ce38b38280b8281c3da734c146ae0d57064`.
- Source-behaviour and conformance evidence remains in `evidence/mcp-root-discovery-20260917.md`; this qualification does not broaden its capability exclusions.

## Candidate checks

- Frozen dependency install: passed.
- Candidate-owned OpenAPI canary: passed for App and Sending.
- Initial `pnpm drift:check`: failed with the single stale contract above; generated correction retained rather than suppressing the gate.
- `pnpm build:python:dists`: passed, 146/146 tests, zero skipped/xfailed/xpassed, 14/14 wheel/sdist checks.
- Installed MCP wheel contract smoke outside the checkout: passed; fixture removed.
- `PYTHON_PATHS_RELEASED='["packages/python/mcp"]' pnpm prepare:publish:pypi`: passed; exactly two MCP artifacts selected.
- App snapshot SHA256: `09b00ae13c88fe4ecc1bb3fd965bb30efd79447d5ea68b5334816a7452d40b58`.
- Sending snapshot SHA256: `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.
- MCP core floor remains `sendmux-core>=1.3.1,<2.0.0`; published core version is unchanged.
- Exact `python-mcp-v2.1.1`, PyPI version and MCP Registry version were absent during candidate preflight.

## Retained artifacts and next gate

- Candidate wheel SHA256: `b64fe63ab2c619f948a223d22ef067b9761ec6536d73dda5fc10227860bb1938`.
- Candidate sdist SHA256: `19dd780e316c9048687e409fd03ba373fe2be7d67f0d7e4f5c0f5ffa4abbd949`.
- Local bulk evidence: `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk/.claude/artifacts/mcp-2-1-1-final/` (`05-generated-drift.diff`, `09-summary-extract.log` and individual command logs).
- Mandatory pre-commit regeneration verifies the staged correction; settled PR review, guarded publication, exact public-source identity and fresh public-installed acceptance are separate remaining gates.
- No published version was modified, and no credentials or production fixtures were used by candidate qualification.
