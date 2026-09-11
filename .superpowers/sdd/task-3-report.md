# Task 3 report

## Outcome

Implemented the SDK/MCP portion of Sendmux MCP 2.0 on `agent/mcp-2-modernisation`. Status: `DONE_WITH_CONCERNS` until independent review, coordinated release-please 2.0.0 publication, deployment, and authenticated hosted acceptance complete.

## Canonical sources

- MCP 2026-07-28 changelog: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx
- MCP Streamable HTTP 2026-07-28: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx
- FastMCP 4.0.3 release and migration material: https://github.com/PrefectHQ/fastmcp/releases/tag/v4.0.3 and https://github.com/PrefectHQ/fastmcp/blob/main/docs/updates.mdx
- FastMCP 4.0.3 conformance fixture, exact tag commit: https://github.com/jlowin/fastmcp/blob/7129236c770e14d52e6bd14af1100f7c9450769c/tests/conformance/server.py
- Official conformance runner: `@modelcontextprotocol/conformance@0.2.0-alpha.11`, locked integrity `sha512-imPK9tx5gQsL6ZKQq4MrsyDYfSaIwpRmX6+ogjbeAXs9LGvxkBxWcY7KcS7TvwaBk/ZiVWl6b/naF4q83UwDRA==`.

## Red evidence and root causes

- Baseline `pnpm build:mcp`: 90 tests passed on FastMCP 3.3.1.
- First FastMCP 4.0.3 run: 26 mypy failures traced to MCP SDK v2 annotation names, the framework's `httpx2` OpenAPI client boundary, and removed `Context.list_roots`.
- Attachment roots regression: two failures proved both public `file_path` tools depended on removed roots support. The same root cause existed on mailbox and Sending surfaces, so both were fixed.
- Strict output validation: five failures traced to two stale fixture classes (`next_cursor: null` and send result `id`) that disagreed with the source OpenAPI. The operator approved correcting those fixtures; validation remains enabled.
- JSON Schema preservation: retaining boolean `unevaluatedProperties` made FastMCP's OpenAPI parser reject 144 valid constraints. Boolean schemas are now converted losslessly (`false` to `{"not": {}}`, `true` to `{}`), with semantic reject/allow tests including nesting.
- Conformance fixture first run: 2025-11-25 resource subscribe/unsubscribe failed because the released FastMCP fixture omitted handlers for two frozen required scenarios. The repository-owned fixture retains the exact upstream runtime/middleware and adds only those two protocol handlers.
- Output-schema tightening exposed that `mailbox_wait_for_message` returned a full upstream object while its useful contract is ID, receipt time, and attachment metadata. The tool now normalises to that exact bounded shape.

## Changes

- Upgraded only FastMCP 3.3.1 to 4.0.3 and used `httpx2` only at FastMCP's OpenAPI adapter boundary; Sendmux retry/proxy and A2A remain on the existing `httpx` stack.
- The adapter streams and closes upstream responses, owns/closes its client, and preserves upstream exceptions and cancellation.
- Added 2026-07-28 stateless discovery/request handling with negotiated 2025-11-25 initialize compatibility, private zero-TTL catalog responses, and no legacy session header on modern responses.
- Added strict `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, bounded `Mcp-Param-*`, and browser CORS validation.
- Removed public attachment `file_path`, roots, and `Context` access. Inline base64 is limited to 32 KiB decoded; real files use presigned/delegated uploads.
- Replaced catch-all custom tool output schemas with source-derived exact 2020-12 success/error envelopes; retained strict runtime result validation and accurate annotations.
- Hosted MCP proxy envelopes now carry the exact protected resource and `protocol: mcp`; A2A retains its existing resource and protocol context.
- Pinned the official conformance runner in pnpm, vendored the exact released FastMCP fixture with two required legacy handlers, retained check artifacts, bounded teardown, and wired conformance into `build:mcp`.
- Updated the package/root MCP documentation and unreleased changelog. The breaking commit drives the normal release-please 2.0.0 path; package versions are not manually edited.

## Verification

- Focused public schema/wire/hosted tests: 52 passed.
- Full MCP package plus integration suite: 100 passed, 0 failed, 0 skipped; 22 warnings are from the external A2A protobuf helper.
- Frozen conformance fixture run at `.tmp/mcp-conformance/2026-09-11T23-05-27.855Z`:
  - 2025-11-25: all 30 required scenarios, 84 checks passed, zero failures or skipped scenarios.
  - 2026-07-28: all 37 required scenarios, 181 checks passed overall and zero required failures or skipped scenarios. Five subscription checks inside `server-stateless` were explicitly capability-inapplicable, not skipped scenarios.
  - Eight of 13 non-scored 2026-07-28 extension/pending scenarios failed (9 checks), all in optional Tasks extensions; they remain visible and are not claimed as conformance passes.
- `pnpm build:mcp`: passed generation, compile, mypy, 100 tests, sdist/wheel build, twine metadata, packaged-file checks, and both frozen conformance revisions. No test was skipped, filtered, weakened, or deleted.

## Adjacent survey

- Surveyed all MCP source/tests/docs for `file_path`, roots/Context, annotation naming, output-schema catch-alls, legacy session headers, modern routing headers, cache hints, and hosted resource context.
- Surveyed every custom output mode: metadata, text, resource link, inline upload, presigned upload, wait hit/no-hit, and local/upstream errors.
- A2A's protocol/resource envelope and HTTP stack were preserved; its official client test remained green.
- No package publication, push, merge, deployment, or authenticated Atlassian journey occurred.

## Changed files

See `git diff --name-only`; changes are limited to the claimed MCP package, MCP tests/scripts, root package/lock/development metadata, and directly affected README.

## Cleanup

The conformance runner allocates an ephemeral loopback port, records the exact child, handles SIGINT/SIGTERM, sends SIGTERM then bounded SIGKILL fallback, waits for exit, and retains results under `.tmp/mcp-conformance/`. No server remains intentionally running.

## Remaining release gates

1. Independent review and the coordinated release-please 2.0.0 PR/publication gate.
2. Deployed hosted MCP protocol probes and operator-run Atlassian OAuth UI acceptance.
