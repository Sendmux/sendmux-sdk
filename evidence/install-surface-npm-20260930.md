# npm MCP install surface — 2026-09-30

| Field | Result |
| --- | --- |
| Status | Coded locally; not published |
| Package | `sendmux-mcp@1.0.0`, Node.js `>=22` |
| Transport | Pinned `mcp-remote@0.14.3` public CLI; fixed `https://mcp.sendmux.ai/mcp`; HTTP only |
| Tool ownership | Hosted server; no copied tool implementation |
| Registry | Metadata `2.1.4`; npm `1.0.0`; existing PyPI `2.1.3` |
| Python source | Unchanged; only `packages/python/mcp/server.json` changes |
| Browser journey | Hosted OAuth and published `npx` acceptance remain with release coordinator |
| Copy gate | Package README attempt 1 blocked; reviewed source preserved |
| Teardown | Test child processes absent (`ESRCH`); generated TLS fixtures removed |
| Worktree | Retained for integration and publication |

## Trace

| Concern | Source |
| --- | --- |
| Public child executable; inherited stdio; signal and exit handling | `packages/ts/mcp/bin/sendmux-mcp.js:7` |
| Package engine, dependency, ownership marker and publication metadata | `packages/ts/mcp/package.json:1` |
| Package matching by registry type and identifier | `scripts/check-mcp.mjs:41` |
| Existing immutable registry version must match complete manifest | `scripts/mcp-registry-version.mjs:18` |
| Type-specific release-please JSONPath updates | `release-please-config.json:128` and `release-please-config.json:219` |
| npm publication and registry dependency wiring | `.github/workflows/release-please.yml:100` and `.github/workflows/release-please.yml:873` |
| Exact producer recovery; committed metadata remains unchanged | `.github/workflows/release-please.yml:510` |
| Reviewed public skills checkout; no moving branch fallback | `.github/actions/skill-release-checks/action.yml:1` |
| Upstream transport contract | <https://raw.githubusercontent.com/punkpeye/mcp-remote/v0.14.3/README.md> |
| Independent registry metadata versions | <https://modelcontextprotocol.io/registry/versioning.md> |

## Verification

| Check | Result | Private receipt in SDK MAIN `.claude/artifacts/install-surface/` |
| --- | --- | --- |
| Bridge red | Four failures: `npm MCP bridge package is missing` | `npm-bridge-red.log` |
| Workspace bridge | 4/4; tools/list, tools/call, cancellation, EOF, signals, connection failure | `npm-bridge-workspace-green.log` |
| Installed tarball bridge | 4/4 against real installed dependency and verified local TLS | `npm-packed-tests.log` |
| Registry contract red | Three failures before independent version and identity checks | `npm-registry-red.log` |
| Existing metadata content red | `Missing expected rejection.` | `npm-registry-content-red.log` |
| Native release and registry contracts | 32/32 | `npm-release-state.log` |
| Registry version behavior | 6/6 | `npm-registry-final-green.log` |
| Real release-please updater red | `packages/python/mcp must update only its registry identity, independently of order and metadata version` | `npm-release-updater-red.log` |
| Real release-please updater green | Both package orders; unrelated package and independent metadata preserved | `npm-release-updater-green.log` |
| Actual recovery workflow red | `Recovery version 2.1.4 does not match sendmux-mcp package version 2.1.3` | `npm-recovery-red.log` |
| Actual recovery workflow green | Metadata `2.1.4`, PyPI `2.1.3`, npm `1.0.0`; no manifest rewrite | `npm-recovery-green.log` |
| Workflow lint red | `property "release-please" is not defined in object type {}` | `npm-workflow-red.log` |
| Workflow lint green | `actionlint@v1.7.12`; no errors | `npm-workflow-final-green.log` |
| Registry schema | `mcp-publisher validate`: valid | `npm-registry-schema.log` |
| Publish dry run | Only executable, package metadata, README and LICENSE packed | `npm-publish-dry-run.log` |
| Full workspace build | Exit 0 with immutable OpenAPI input; conformance qualifications below | `npm-full-build.log` |
| Final contract suite | 11/11 after removing a test fixture's fixed npm version | `npm-contract-final-green.log` |

The full build used the committed `packages/python/mcp/sendmux_mcp/openapi` directory as `OPENAPI_INPUT_DIR` and `GOTOOLCHAIN=auto`. MCP required checks passed under the unchanged capability policy in `scripts/mcp-conformance.mjs:15`. The modern revision recorded six skipped checks and nine non-scored failures across eight Task-extension scenarios. Full conformance is not claimed. Raw receipts are retained in `npm-conformance/` and summarized in `npm-conformance-summary.json`.

Ruby dependency installation updated two already-stale local package versions in `Gemfile.lock`. That incidental edit was saved as `npm-build-ruby-lock.patch` and restored; it is excluded from this change. The existing Ruby lock drift is parked.

The final verification receipt binds the base commit, lockfile, environment and owned file hashes in `npm-validation-receipt.json`. The full build preceded a test-only fixture cleanup; the affected 11-case contract suite passed afterwards. No product source changed after the full build.

## Test scope

| Change | Public behavior |
| --- | --- |
| + `scripts/mcp-bridge.test.mjs` | Remote messages and lifecycle through real installed CLI |
| + Three cases in `scripts/mcp-contract.test.mjs` | Independent metadata, npm version drift, duplicate identities |
| + One case in `scripts/mcp-registry-version.test.mjs` | Existing metadata retains exact package identities and remote |
| Pruned new assertion | Removed literal dependency startup-log wording; error diagnostics remain covered by connection failure test |
| Existing tests removed | None |

## Release controls

| Control | Required action |
| --- | --- |
| Bootstrap override | Remove npm `release-as: 1.0.0` immediately after its initial release PR exists |
| PyPI | Leave metadata-only Python release PR unmerged; no Python publication in this change |
| Registry versions | Bump top-level `server.version` independently before future MCP release PR merges; collision check runs before package publication |
| Skill freshness | Latest skills release must carry verified `acceptance.json`; explicit `SENDMUX_SKILLS_REVISION` supports proposed prevalidation |
| Recovery | `recover_mcp_registry_version=2.1.4`, `recover_mcp_producer_tag=ts-mcp-v1.0.0` |
| Live acceptance | Verify npm version, browser OAuth tools/list, both registry package entries, and unchanged PyPI version |

## Copy receipt

| Artifact | Units | Disposition | Source and final hash receipt |
| --- | --- | --- | --- |
| Root README MCP additions | 3; 43 words | `ineligible-manual`; source unchanged | `evidence/install-surface-npm-copy-20260930.jsonl` |
| Package README | 5; 118 submitted words | `blocked-manual-review`; source unchanged | `evidence/install-surface-npm-copy-20260930.jsonl` |
| Package metadata, commands, tables and workflow labels | Frozen | `excluded-frozen` | Diff |
| Provider attempt | 1; `frozen-content-mismatch` | Endpoint/dependency spans dropped; invented guide section; no retry | `npm-copy/journal.jsonl` |
| Restored source detector | 73 | Above final threshold 30 | `npm-copy/detect-source.json` |
| Repair receipt | No token edits; complete source restoration | Not approved for publication | `npm-copy/repair-receipt.json` |
