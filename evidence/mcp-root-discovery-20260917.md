# Hosted MCP root resource discovery

Recorded 2026-09-17 19:02 Australia/Melbourne.

Status: coded and locally verified; uncommitted, unpublished and undeployed. ROOT owns independent review, commit and release.
Base: live `origin/main` verified as `a9bdaf58f0db684328458e269ba8aff515334d0b` before creating `agent/mcp-root-discovery`.

## Correctness

- `packages/python/mcp/sendmux_mcp/hosted.py:196` builds the existing A2A routes for the shared app. `packages/python/mcp/sendmux_mcp/a2a.py:247` registers root metadata without a hostname restriction; its line304 returns the A2A resource.
- The MCP auth provider generates its own path-specific metadata route. The prior MCP metadata tests built only `create_hosted_server().http_app()`, bypassing the combined composition that adds A2A.
- `hosted.py:212` selects the existing MCP or A2A `Route.handle` by comparing parsed request/configured hostnames; `hosted.py:217` installs that selector only at the exact root metadata path. All other routes, outer auth/origin/header middleware and app lifespan stay in place.
- The response-callable contract was checked against installed Starlette1.6.0 `routing.py:62`–`63`: the request handler's result is invoked as an ASGI callable. Returning the selected `Route.handle` retains its method checks and wrapped endpoint without reconstructing metadata or changing framework internals.
- Canonical basis: [MCP2025-11-25 protected-resource discovery](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#protected-resource-metadata-discovery-requirements) permits root fallback, [RFC9728 section3.3](https://www.rfc-editor.org/rfc/rfc9728.html#section-3.3) requires matching resource identity, and [RFC3986 section3.2.2](https://www.rfc-editor.org/rfc/rfc3986.html#section-3.2.2) makes hostnames case-insensitive. Existing parsed-hostname properties provide normalization.
- Zero extra DB or network calls. Route construction happens once; requests perform one bounded hostname match against immutable configuration. No tenant/history scaling or replica-local mutable state was introduced.
- This defect is separate from Atlassian's root `/register`404 handled by app PR528.

## Regression and checks

Test added: `packages/python/mcp/tests/test_hosted_server.py:test_hosted_root_metadata_uses_configured_mcp_host` (two parameter cases). No tests removed or assertions weakened.

Both cases were observed RED before implementation: the root resource was `https://a2a.sendmux.ai/a2a/v1`, instead of `https://mcp.sendmux.ai/mcp` or `https://custom-mcp.example.com:8443/custom/`. Review exposed the same defect for explicit mixed-case Host headers after the first fix; both cases again failed RED on the differing MCP/A2A resource before the final selector was implemented.

The same command was run before and after implementation from this worktree:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/packages/python/mcp:$PWD/packages/python/core" pnpm exec /Users/rj/Desktop/GIT-REPOS/sendmux-sdk-combined-native-release/.tmp/python-venv/bin/python -m pytest packages/python/mcp/tests/test_hosted_server.py -k test_hosted_root_metadata_uses_configured_mcp_host -q --tb=short -p no:cacheprovider
```

Original RED: `2 failed, 23 deselected`, exit1. Quoted assertion: `- https://mcp.sendmux.ai/mcp` / `+ https://a2a.sendmux.ai/a2a/v1`.
Mixed-case RED: `2 failed, 23 deselected`, exit1, including `{'resource': 'https://a2a.sendmux.ai/a2a/v1'} != {'resource': 'https://mcp.sendmux.ai/mcp'}`.
Final GREEN: `2 passed, 23 deselected`, exit0.

The real ASGI responses verify root/path metadata equality, default and custom hostname/port/path handling, explicit uppercase Host values, preserved A2A metadata and alternate-host behavior, forbidden-origin403, and unauthenticated MCP401 with its original path-specific discovery challenge. HEAD checks verify200, empty bodies and cache/content-length parity with the existing metadata routes. Test app lifespan closes its clients even on assertion failure.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/packages/python/mcp:$PWD/packages/python/core" pnpm exec /Users/rj/Desktop/GIT-REPOS/sendmux-sdk-combined-native-release/.tmp/python-venv/bin/python -m pytest packages/python/mcp/tests/test_hosted_server.py packages/python/mcp/tests/test_a2a_server.py packages/python/mcp/tests/test_hosted_auth.py -q --tb=short -p no:cacheprovider
```

Focused result: `34 passed, 22 warnings`, exit0. Warnings originate in the A2A dependency's deprecated protobuf `label()` calls.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/packages/python/mcp:$PWD/packages/python/core" pnpm exec /Users/rj/Desktop/GIT-REPOS/sendmux-sdk-combined-native-release/.tmp/python-venv/bin/python -m mypy packages/python/mcp/sendmux_mcp/hosted.py packages/python/mcp/tests/test_hosted_server.py --cache-dir .claude/artifacts/mcp-root-discovery/mypy-cache
PYTHONPYCACHEPREFIX="$PWD/.claude/artifacts/mcp-root-discovery/pycache" pnpm exec /Users/rj/Desktop/GIT-REPOS/sendmux-sdk-combined-native-release/.tmp/python-venv/bin/python -m compileall -q packages/python/mcp/sendmux_mcp/hosted.py packages/python/mcp/tests/test_hosted_server.py
git diff --check
```

Type check: `Success: no issues found in 2 source files`, exit0. Syntax compilation and diff whitespace checks exited0. No broad SDK build or dependency/lock mutation was performed.

Environment: existing release environment, FastMCP4.0.3, MCP2.2.0, HTTPX2 2.13.0, Starlette1.6.0; imports were verified to resolve this worktree's MCP source.
Initial runner errors were corrected before verification: MAIN's older environment lacked `httpx2`; an initial focused command included nonexistent `test_security.py` and ran no tests. Neither is counted as the RED regression or a passing check.

## Evidence and handoff

Logs: MAIN `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk/.claude/artifacts/mcp-root-discovery/`:

- `red-current-env.log`: both wrong-resource failures before the code change.
- `red-mixed-case.log`, `red-mixed-case-head.log`: explicit Host case reproductions against the first fix.
- `green-mixed-case-head.log`: final selector passes both cases, including HEAD.
- `green-final-focused.log`: final all34 focused tests pass; dependency warnings retained.
- `mypy-final.log`, `syntax-final.log`: final type/syntax output.
- `green-regression.log`, `green-focused.log`, `mypy.log`, `syntax.log`: retained earlier verification, superseded by final logs.
- `red.log`, `focused-command-error.log`: initial runner errors retained separately.

READMEs: root README lines108–110 still describe the unchanged MCP endpoint and A2A audience; no install/API-shape/package-version change is claimed by this correction.
Review: clean-code diagnostic8/10; the existing long composition function remains a local readability limitation. The bounded fix adds no new module/helper or unrelated extraction. No new rules proposed.
Journeys: local ASGI discovery/auth/origin boundaries verified; browser, production and release acceptance remain ROOT-owned.
Resources: no listeners, containers, browsers, credentials or remote fixtures created; transient check processes exited. Shared artifacts and the uncommitted worktree remain for ROOT review.
Coordination: the exact source/test/evidence file claim is released at handoff.

## Selected-resource method dispatch — 2026-09-17 19:29

Independent review found the root wrapper's MCP method list rejected A2A POST before selecting the A2A route, producing `Allow: GET, HEAD, OPTIONS` while A2A OPTIONS correctly produced only `GET, HEAD`.

`hosted.py:218` now passes `methods=[]` to the public Starlette Route constructor. Installed Starlette1.6.0 `routing.py:233`–`257` and `271`–`280` make the empty method set unrestricted; every method reaches the selected existing `Route.handle`, which owns resource-specific method validation and its Allow header. There is no finite method whitelist, adapter, hierarchy or framework-internal mutation.

The existing two-case ASGI regression now compares A2A POST/OPTIONS405 and their Allow sets against `GET, HEAD`. Both cases were observed RED with `Extra items in the left set: 'OPTIONS'`, then GREEN after the one-line dispatch correction. Mixed-case host, HEAD, resource identity and auth/origin checks remain in the same test.

The regression/focused/type/syntax commands above were rerun unchanged: regression2 pass; focused34 pass with the same22 A2A dependency warnings; mypy2 source files clean; syntax and scoped diff whitespace checks exit0.
Receipts in MAIN `.claude/artifacts/mcp-root-discovery/`: `red-method-dispatch.log`, `green-method-dispatch.log`, `green-method-focused.log`, `mypy-method-dispatch.log`, `syntax-method-dispatch.log`.

Only hosted.py, its existing test and this addendum were edited in this follow-up. ROOT's release/config/contract changes and plan were preserved; no contract regeneration, build, install, broad gate rerun or remote write occurred. The source/test claim is released at handoff; ROOT retains its release/evidence claim.

## ROOT final source gate — 2026-09-17 19:33

Independent review found no critical/important findings and one method-preservation finding, corrected above and inspected by ROOT. Four independently reviewed native-major overrides are combined in this source batch; see `native-management-major-plan-20260917.md`. Published versions, manifests, dependency floors and lockfiles are unchanged.

Canonical `OPENAPI_INPUT_DIR` pointed at this candidate's own MCP OpenAPI snapshots. `pnpm build:mcp` followed by `pnpm test:release-state` exited0: mypy30 source files clean; MCP158 passed with22 dependency warnings and zero skips; source/wheel build and both Twine checks passed; fresh installed-wheel contract/provenance passed; release-state27 passed, zero skipped. Raw snapshots were unchanged; the generated contract updates only the hosted source hash to `6ed9af8290311fb7ce34dd52fe234d003b28069bd63ee0d78ecdfd8dcba084b8`.

Pinned required conformance matches its exact baseline: 2025-11-25 has70 SUCCESS/0 INFO/0 SKIPPED; 2026-07-28 has114 SUCCESS/1 INFO/5 capability-exclusion SKIPPED. Broader non-scored modern extension scenarios retain9 failing checks across8 task scenarios; these are not represented as passing tests or advertised extension support. Required accounting and capability-exclusion assertions passed. Full output: MAIN `.claude/artifacts/mcp-root-discovery/final-method-gates-attempt2.log`; machine results: `conformance-final-methods/`.

Earlier infrastructure attempts are not product regressions: `build-mcp-final.log` passed158 tests/package checks but stopped at conformance import because this fresh worktree had no node_modules; canonical frozen install succeeded without lock changes. `final-method-gates.log` invoked a nonexistent package alias and ran no tests; package.json:10,25 supplied the canonical build command for the final run. The changed-source final gate supersedes the earlier package hash.

Installed artifact child28931/28933 ESRCH and fixture `sendmux-mcp-installed-ksq_gry1` absent, as verified by the canonical runner. Conformance fixture closed in its awaited finally block. No credentials or user resources were created. Source merge, actual new package publication and hosted deployment remain pending; local2.1.0 verification artifacts do not overwrite the published2.1.0 release.
