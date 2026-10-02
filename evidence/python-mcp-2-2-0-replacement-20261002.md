# Python MCP 2.2.0 replacement candidate

PR #305 merged as `f07218ca71b7f5458a19d6b9ac51b20fee157cdb`; all 29 PR CI jobs passed. Release Please run `36956672350` failed before creating a tag because production's DMARC description changed while CI ran. No package was published by that run.

Canonical per `docs/native-publication.md`: publication uses immutable release-candidate snapshots and requires strict live equality. Release Please cannot replace a merged PR's immutable merge SHA. This replacement retains version `2.2.0`, the canonical component branch, release title and release notes.

Snapshots from docs revision `82f9a37d53d3a76d11b1b09ad6ac7bbc96a1876a` match production. Existing generators changed one DMARC description across language clients, the packaged App snapshot and MCP contract hash. No API shape, runtime behaviour or publication guard changed.

Verification: `pnpm canary:openapi` with candidate inputs exited 0; `pnpm verify:sdk-staleness` after staging exited 0; `git diff --cached --check` exited 0. Generation initially reported expected unstaged drift and required staging its seven outputs.

`pnpm build:python:dists` exited 0, including installed-wheel contract verification for `sendmux-mcp 2.2.0`. `pnpm test:release-state` exited 0 (32 tests). Independent review found no source blockers and confirmed the replacement strategy against pinned Release Please. Supersede #305's pending label before replacement publication to retain one pending merge-source SHA.

Run logs: MAIN `.claude/artifacts/release-python-mcp-2-2-0/replacement-{drift,canary,python-dists,release-state,pypi-selection}.log`. Publication preparation and replacement PR CI remain gates before merge. Publication remains pending until GitHub tag, PyPI artifacts and MCP Registry metadata are read back.

Tests: none added or removed; existing contract and installed-artifact checks cover the generated refresh. Journeys: no browser surface changed.
