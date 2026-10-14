# Toolchain pins

Status: coded, not merged. Every single-version CI and release job now reads its Go and Node version from one committed file, and the Python dev environment pins Pydantic. Compatibility matrices still float on purpose.

## What drifted

On 2026-10-09, CI run `37887031261` (PR #316) failed 9 jobs:

- **Python (7 jobs).** `pip install -r requirements-dev.txt` resolved `pydantic-2.14.0`. Mypy then failed with `packages/python/mcp/sendmux_mcp/hosted_auth.py:12: error: Need type annotation for "AUTHORIZATION_SERVER_URL_ADAPTER"`. The repair added an annotation; Pydantic itself was never pinned.
- **Go (`verify-languages (go)`).** `go-version: "1.27.x"` resolved `/opt/hostedtoolcache/go/1.27.2`. `golangci-lint@v2.13.2` then failed with `could not load export data`. PR #317 moved the linter to v2.14.0, but the setup step still floated.
- **Node.** CI ran `node-version: 22`. The local qualifier ran Node v24.21.0, and no file tied the two together.

## Pins

All pins match main's last green CI run `38329715848` @ `7ac3dc1` (2026-10-13). Nothing was upgraded.

| Toolchain | Single source | Value | Readers |
| --- | --- | --- | --- |
| Go | `go/go.mod` `toolchain` | `go1.27.2` (was `go1.23.4`; `go 1.23.0` floor unchanged) | `go-version-file` in ci.yml verify and verify-languages, live-e2e.yml, release-please.yml |
| Node | `.nvmrc` | `22.23.3` | `node-version-file` in every single-version job in ci, chocolatey, live-e2e, openapi-canary, publication-guard-diagnostic and release-please |
| Pydantic | `requirements-dev.txt` | `pydantic==2.14.1` (pins `pydantic-core==2.50.1`) | check-python, check-mcp, generate-mcp-contract |

## Why it is shaped this way

**The Go toolchain line.** The `toolchain` directive "only takes effect when the module is the main module" [go.dev/doc/modules/gomod-ref]. It "sets a preferred toolchain that takes precedence over the `go` line" for work inside the module [go.dev/doc/toolchain]. Consumers keep the `go 1.23.0` floor, and the `go-runtime` matrix still covers 1.23.4.

I set the line with `go get toolchain@go1.27.2`. With go1.27.2, `go mod tidy` left go.mod and go.sum unchanged, and `go vet ./...` passed.

**The job-level `GOTOOLCHAIN: local` removed in ci.yml.** setup-go v6.4.0 reads the `go` line instead of `toolchain` whenever `GOTOOLCHAIN=local` is already set (`src/installer.ts:656-674` at `4a36011`). It then exports `GOTOOLCHAIN=local` to every later step itself (`src/main.ts:20,176-191`). Removing the job-level value is therefore what lets the toolchain line be read. No step before setup-go runs `go`, and the non-Go verify-languages legs never run `go`.

**Release-time pins.** The publish and recover jobs in release-please.yml check out an older candidate or producer at the workspace root. They read `.publication-guard/.nvmrc` and `.publication-guard/go/go.mod`, the workflow commit's own checkout, which is where these pins lived before this change. Chocolatey does the same in release and push mode, using the condition its guard checkout already uses. The setup-node path resolves against `GITHUB_WORKSPACE` [context7:/actions/setup-node].

**Pydantic.** The repo already uses exact `==` pins in `requirements-dev.txt`. pip recommends `==` "to protect against bugs or incompatibilities in newly released versions" [pip.pypa.io/en/stable/topics/repeatable-installs]. A later `pip install -e` without `--upgrade` leaves a satisfied pin installed [pip.pypa.io upgrade-options]. The published `pydantic>=2,<3` ranges and the wheel-consumer jobs are unchanged.

## Deliberately floating

- **Compatibility matrices.** These test what consumers get: `node-runtime` Node 22/24/26, `python-runtime` Python 3.10 to 3.14, `go-runtime` Go 1.23.4/1.26.x/1.27.x, plus the PHP and Ruby matrices.
- **live-e2e.yml.** It previously used Go `1.23.x`. That could not run its own `check:go`, because `golangci-lint` v2.14.0 declares `go 1.26.0`. The workflow is dispatch-only and has never run, so this change is unexercised there.

## Local receipts (worktree `agent/toolchain-pins`, Node v24.21.0, go1.27.2 via toolchain line)

- `actionlint v1.7.12` on all six changed workflows: exit 0, no findings.
- Pass: `test-chocolatey-workflow-order` (both), `test-windows-workflow-native-exits-wiring`, `mcp-registry-version.test`, `test-snap-workflow`, and `prepare-pypi-publish.test` (13/13).
- `publication-guard.test`: 19 passed. The other 45 could not run locally because they need the CI-prepared `sendmux-skills` checkout (`ENOENT .../sendmux-skills/scripts/skill-compatibility.mjs`). CI runs them.

Logs: `.claude/artifacts/toolchain-pins/` (`main-green-38329715848.log`, `pr316-37887031261-failed.log`, `actionlint-pr.log`, `local-*.log`).
