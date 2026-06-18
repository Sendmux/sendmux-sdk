# Sendmux SDKs

[![npm version](https://img.shields.io/npm/v/@sendmux/sdk?label=npm)](https://www.npmjs.com/package/@sendmux/sdk)
[![PyPI version](https://img.shields.io/pypi/v/sendmux-sdk?label=pypi)](https://pypi.org/project/sendmux-sdk/)
[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go.svg)](https://pkg.go.dev/sendmux.ai/go)
[![crates.io version](https://img.shields.io/crates/v/sendmux?label=crates.io)](https://crates.io/crates/sendmux)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux/sdk?label=npm%20downloads)](https://www.npmjs.com/package/@sendmux/sdk)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Official SDK, CLI, and MCP workspace for Sendmux.

- Product documentation: [docs.sendmux.ai](https://docs.sendmux.ai)
- Management API reference: [docs.sendmux.ai/api/introduction](https://docs.sendmux.ai/api/introduction)
- Mailbox API reference: [docs.sendmux.ai/mailbox-api/introduction](https://docs.sendmux.ai/mailbox-api/introduction)
- Sending API reference: [docs.sendmux.ai/sending-api/introduction](https://docs.sendmux.ai/sending-api/introduction)
- MCP guide: [docs.sendmux.ai/guides/mcp](https://docs.sendmux.ai/guides/mcp)

## Packages

| Ecosystem | Package | Surface | API key or auth | Install | Source |
| --- | --- | --- | --- | --- | --- |
| npm | `@sendmux/core` | Shared TypeScript helpers | n/a | `npm install @sendmux/core` | [`packages/ts/core`](packages/ts/core) |
| npm | `@sendmux/sending` | Sending API | `smx_mbx_*` | `npm install @sendmux/sending` | [`packages/ts/sending`](packages/ts/sending) |
| npm | `@sendmux/mailbox` | Mailbox API | `smx_mbx_*` | `npm install @sendmux/mailbox` | [`packages/ts/mailbox`](packages/ts/mailbox) |
| npm | `@sendmux/management` | Management API | `smx_root_*` | `npm install @sendmux/management` | [`packages/ts/management`](packages/ts/management) |
| npm | `@sendmux/sdk` | TypeScript umbrella package | surface-specific | `npm install @sendmux/sdk` | [`packages/ts/sdk`](packages/ts/sdk) |
| npm | `@sendmux/cli` | `sendmux` CLI | command/profile-specific | `npm install -g @sendmux/cli` | [`packages/ts/cli`](packages/ts/cli) |
| PyPI | `sendmux-core` | Shared Python helpers | n/a | `pip install sendmux-core` | [`packages/python/core`](packages/python/core) |
| PyPI | `sendmux-sending` | Sending API | `smx_mbx_*` | `pip install sendmux-sending` | [`packages/python/sending`](packages/python/sending) |
| PyPI | `sendmux-mailbox` | Mailbox API | `smx_mbx_*` | `pip install sendmux-mailbox` | [`packages/python/mailbox`](packages/python/mailbox) |
| PyPI | `sendmux-management` | Management API | `smx_root_*` | `pip install sendmux-management` | [`packages/python/management`](packages/python/management) |
| PyPI | `sendmux-sdk` | Python umbrella package | surface-specific | `pip install sendmux-sdk` | [`packages/python/sdk`](packages/python/sdk) |
| PyPI | `sendmux-mcp` | Local, self-hosted, and hosted MCP servers | OAuth for hosted; surface-specific keys for local | `pip install sendmux-mcp` | [`packages/python/mcp`](packages/python/mcp) |
| Go | `sendmux.ai/go/core` | Shared Go helpers | n/a | `go get sendmux.ai/go@v1.0.0` | [`go/core`](go/core) |
| Go | `sendmux.ai/go/sending` | Sending API | `smx_mbx_*` | `go get sendmux.ai/go@v1.0.0` | [`go/sending`](go/sending) |
| Go | `sendmux.ai/go/mailbox` | Mailbox API | `smx_mbx_*` | `go get sendmux.ai/go@v1.0.0` | [`go/mailbox`](go/mailbox) |
| Go | `sendmux.ai/go/management` | Management API | `smx_root_*` | `go get sendmux.ai/go@v1.0.0` | [`go/management`](go/management) |
| Go | `sendmux.ai/go/sdk` | Go umbrella package | surface-specific | `go get sendmux.ai/go@v1.0.0` | [`go/sdk`](go/sdk) |
| crates.io | `sendmux` | Rust umbrella crate | surface-specific | `cargo add sendmux` | [`src`](src) |
| Packagist | `sendmux/core` | Shared PHP helpers | n/a | `composer require sendmux/core:^1.0` | [`packages/php/core`](packages/php/core) |
| Packagist | `sendmux/sending` | Sending API | `smx_mbx_*` | `composer require sendmux/sending:^1.0` | [`packages/php/sending`](packages/php/sending) |
| Packagist | `sendmux/mailbox` | Mailbox API | `smx_mbx_*` | `composer require sendmux/mailbox:^1.0` | [`packages/php/mailbox`](packages/php/mailbox) |
| Packagist | `sendmux/management` | Management API | `smx_root_*` | `composer require sendmux/management:^1.0` | [`packages/php/management`](packages/php/management) |
| Packagist | `sendmux/sdk` | PHP umbrella package | surface-specific | `composer require sendmux/sdk:^1.0` | [`packages/php/sdk`](packages/php/sdk) |
| RubyGems | `sendmux-core` | Shared Ruby helpers | n/a | `gem install sendmux-core` | [`packages/ruby/core`](packages/ruby/core) |
| RubyGems | `sendmux-sending` | Sending API | `smx_mbx_*` | `gem install sendmux-sending` | [`packages/ruby/sending`](packages/ruby/sending) |
| RubyGems | `sendmux-mailbox` | Mailbox API | `smx_mbx_*` | `gem install sendmux-mailbox` | [`packages/ruby/mailbox`](packages/ruby/mailbox) |
| RubyGems | `sendmux-management` | Management API | `smx_root_*` | `gem install sendmux-management` | [`packages/ruby/management`](packages/ruby/management) |
| RubyGems | `sendmux-sdk` | Ruby umbrella package | surface-specific | `gem install sendmux-sdk` | [`packages/ruby/sdk`](packages/ruby/sdk) |

## Quick start

Install only the package for the surface you need.

```sh
npm install @sendmux/sending
pip install sendmux-sending
go get sendmux.ai/go@v1.0.0
cargo add sendmux
composer require sendmux/sending:^1.0
gem install sendmux-sending
```

Use mailbox-scoped `smx_mbx_*` keys for Sending and Mailbox clients. Use root `smx_root_*` keys for Management clients.

For command-line access, install the CLI:

```sh
npm install -g @sendmux/cli
sendmux --help
```

For MCP clients, install `sendmux-mcp` or connect to the hosted MCP endpoint:

```sh
pip install sendmux-mcp
sendmux-mcp-mailbox --help
```

The hosted product MCP endpoint is `https://mcp.sendmux.ai/mcp`. Local MCP commands support stdio and HTTP transports; hosted MCP uses OAuth.

## Repository structure

| Path | Purpose |
| --- | --- |
| [`packages/ts`](packages/ts) | TypeScript SDK packages and the `sendmux` CLI. |
| [`packages/python`](packages/python) | Python SDK packages and the `sendmux-mcp` package. |
| [`go`](go) | Go module `sendmux.ai/go` and subpackages. |
| [`packages/php`](packages/php) | PHP package sources used for Packagist packages and public split repositories. |
| [`packages/ruby`](packages/ruby) | RubyGem package sources. |
| [`codegen`](codegen) | Generator configuration and templates. |
| [`scripts`](scripts) | Generation, verification, publishing, and release helper scripts. |
| [`docs`](docs) | Surface-coverage and live E2E audit artefacts. |
| [`.github/workflows`](.github/workflows) | CI, canary, live E2E, and release workflows. |

## Versioning and support

SDK packages track the Sendmux public API contracts. Patch versions can differ between packages when a fix only affects one ecosystem or runtime.

Generated clients are built from committed OpenAPI snapshots. Any API contract change must update the snapshots and generated output in the same change.

For help, open a [GitHub issue](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, command or import path, and the request ID from any API error response.

## Contributing

Open pull requests against this repository. Keep generated output, source snapshots, and verification artefacts together in the same change.

Security issues should be reported through [GitHub Security Advisories](https://github.com/Sendmux/sendmux-sdk/security/advisories).

## Licence

This repository is available under the [MIT licence](LICENSE).
