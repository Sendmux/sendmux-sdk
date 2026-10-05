# Deterministic static live E2E checks

The checker now reuses `booleanGates` from `scripts/live-e2e-contract.mjs:5` to clear caller execution flags in all four fixture subprocesses. Default counts remain 59 executable and 60 gated; the explicitly enabled positive plan still covers all 119 operations.

The new assertion script runs the real checker with every known boolean gate enabled. Before the fix it exited 1 on `117 !== 59`. The canonical `pnpm check:live-e2e` now runs this regression once, replacing the previous direct checker invocation.

An initial `node --test` wrapper propagated the test-runner context and made the nested safety runner skip its file with exit 0. A controlled probe confirmed the recursive-runner warning and empty output. A new executed-test assertion was seen red on that empty output; the plain assertion driver fixes the nesting without changing any existing safety assertion.

Final verification: pinned Node 22.22.3, Ruby 3.4.1, `BUNDLE_FROZEN=true`, `GOFLAGS=-mod=readonly`; `pnpm check:live-e2e` exited 0. Static coverage retains 117 OpenAPI operations and 2 custom MCP operations. The historical schema-1 audit remains historical, not fresh live certification. No credentialed live run, package publication or deployment occurred.
