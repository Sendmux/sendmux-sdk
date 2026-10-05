# Monid MCP runtime correction

Status: source correction; not merged or published.

PR #313 CI run 37245068182 failed generated drift and all five Python contract jobs. Fresh installs resolved MCP 2.3.0; the committed certified contract records 2.2.0. `packages/python/mcp/sendmux_mcp/contract.py` imports that runtime directly and includes its exact version in contract generation and freshness comparison. The package declared only the transitive runtime through pinned FastMCP.

Declare the directly imported runtime as `mcp==2.2.0` in the native package metadata. Regenerate with `scripts/generate-mcp-contract.mjs`; the sole generated change is the package metadata input hash. Protocols, runtime identity, schemas, checks and package version remain unchanged. No assertion, exclusion or freshness rule changed.

Validation before commit, Node 22.22.3 / pnpm 10.22.0:

- Contract factory exit 0; generated delta inspected.
- `pnpm check:mcp` exit 0: contract freshness, types, 161 Python tests, distribution/artifact checks and required protocol conformance accepted.
- Existing frozen capability exclusions and non-scored results remain visible: 2025-11-25 total 84 passed / 0 failed; 2026-07-28 runner total 181 passed / 9 failed, with 13 non-scored scenarios / 8 failing. The required-result multiset and capability exclusions are checked by `scripts/mcp-conformance.mjs:60`; these totals are not an assertion that every runner check passed.
- `git diff --check` exit 0.

Original failure logs and successful factory/check logs remain in Sendmux MAIN `.claude/artifacts/monid-readiness/release-current-prep/current-main-merge-preflight-20261004/sdk-source-pr-readiness-20261005/`. Required conformance detail remains in this checkout's `.tmp/mcp-conformance/2026-10-05T00-12-50.015Z`.

Normal hook, new exact-head CI/review, source merge approval, immutable package releases and independent public readback remain gates. Future Skills evidence must bind the actual corrected SDK commit; historical receipts are not rewritten.
