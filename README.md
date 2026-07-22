# Sendmux SDKs

[![npm version](https://img.shields.io/npm/v/@sendmux/sdk?label=npm)](https://www.npmjs.com/package/@sendmux/sdk)
[![PyPI version](https://img.shields.io/pypi/v/sendmux-sdk?label=pypi)](https://pypi.org/project/sendmux-sdk/)
[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go.svg)](https://pkg.go.dev/sendmux.ai/go)
[![crates.io version](https://img.shields.io/crates/v/sendmux?label=crates.io)](https://crates.io/crates/sendmux)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux/sdk?label=npm%20downloads)](https://www.npmjs.com/package/@sendmux/sdk)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Official SDK, CLI, and MCP workspace for Sendmux.

- Product documentation: [sendmux.ai/docs](https://sendmux.ai/docs)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- MCP guide: [sendmux.ai/docs/guides/mcp](https://sendmux.ai/docs/guides/mcp)

## Packages

| Ecosystem | Package | Surface | API key or auth | Install | Source |
| --- | --- | --- | --- | --- | --- |
| npm | `@sendmux/core` | Shared TypeScript helpers | n/a | `npm install @sendmux/core` | [`packages/ts/core`](packages/ts/core) |
| npm | `@sendmux/sending` | Sending API | `smx_mbx_*` or owner-approved `smx_agent_*` | `npm install @sendmux/sending` | [`packages/ts/sending`](packages/ts/sending) |
| npm | `@sendmux/mailbox` | Mailbox API | `smx_mbx_*` or `smx_agent_*` | `npm install @sendmux/mailbox` | [`packages/ts/mailbox`](packages/ts/mailbox) |
| npm | `@sendmux/management` | Management API | `smx_root_*` | `npm install @sendmux/management` | [`packages/ts/management`](packages/ts/management) |
| npm | `@sendmux/sdk` | TypeScript umbrella package | surface-specific | `npm install @sendmux/sdk` | [`packages/ts/sdk`](packages/ts/sdk) |
| npm | `@sendmux/cli` | `sendmux` CLI | command/profile-specific | `npm install -g @sendmux/cli` | [`packages/ts/cli`](packages/ts/cli) |
| npm | `@sendmux/ai-sdk` | Vercel AI SDK tools (agent inbox + sending) | send + receive `smx_mbx_*` or `smx_agent_*` | `npm install @sendmux/ai-sdk` | [`packages/ts/ai-sdk`](packages/ts/ai-sdk) |
| Homebrew | `sendmux` | `sendmux` CLI | command/profile-specific | `brew install sendmux/tap/sendmux` | [`Sendmux/homebrew-tap`](https://github.com/Sendmux/homebrew-tap) |
| PyPI | `sendmux-core` | Shared Python helpers | n/a | `pip install sendmux-core` | [`packages/python/core`](packages/python/core) |
| PyPI | `sendmux-sending` | Sending API | `smx_mbx_*` or owner-approved `smx_agent_*` | `pip install sendmux-sending` | [`packages/python/sending`](packages/python/sending) |
| PyPI | `sendmux-mailbox` | Mailbox API | `smx_mbx_*` or `smx_agent_*` | `pip install sendmux-mailbox` | [`packages/python/mailbox`](packages/python/mailbox) |
| PyPI | `sendmux-management` | Management API | `smx_root_*` | `pip install sendmux-management` | [`packages/python/management`](packages/python/management) |
| PyPI | `sendmux-sdk` | Python umbrella package | surface-specific | `pip install sendmux-sdk` | [`packages/python/sdk`](packages/python/sdk) |
| PyPI | `sendmux-mcp` | Local, self-hosted, and hosted MCP servers | OAuth for hosted; surface-specific keys for local | `pip install sendmux-mcp` | [`packages/python/mcp`](packages/python/mcp) |
| PyPI | `langchain-sendmux` | LangChain toolkit (agent inbox + sending) | send + receive `smx_mbx_*` or `smx_agent_*` | `pip install langchain-sendmux` | [`packages/python/langchain`](packages/python/langchain) |
| Go | `sendmux.ai/go/core` | Shared Go helpers | n/a | `go get sendmux.ai/go@v1.0.0` | [`go/core`](go/core) |
| Go | `sendmux.ai/go/sending` | Sending API | `smx_mbx_*` or owner-approved `smx_agent_*` | `go get sendmux.ai/go@v1.0.0` | [`go/sending`](go/sending) |
| Go | `sendmux.ai/go/mailbox` | Mailbox API | `smx_mbx_*` or `smx_agent_*` | `go get sendmux.ai/go@v1.0.0` | [`go/mailbox`](go/mailbox) |
| Go | `sendmux.ai/go/management` | Management API | `smx_root_*` | `go get sendmux.ai/go@v1.0.0` | [`go/management`](go/management) |
| Go | `sendmux.ai/go/sdk` | Go umbrella package | surface-specific | `go get sendmux.ai/go@v1.0.0` | [`go/sdk`](go/sdk) |
| crates.io | `sendmux` | Rust umbrella crate | surface-specific | `cargo add sendmux` | [`rust`](rust) |
| Packagist | `sendmux/core` | Shared PHP helpers | n/a | `composer require sendmux/core:^1.0` | [`packages/php/core`](packages/php/core) |
| Packagist | `sendmux/sending` | Sending API | `smx_mbx_*` or owner-approved `smx_agent_*` | `composer require sendmux/sending:^1.0` | [`packages/php/sending`](packages/php/sending) |
| Packagist | `sendmux/mailbox` | Mailbox API | `smx_mbx_*` or `smx_agent_*` | `composer require sendmux/mailbox:^1.0` | [`packages/php/mailbox`](packages/php/mailbox) |
| Packagist | `sendmux/management` | Management API | `smx_root_*` | `composer require sendmux/management:^1.0` | [`packages/php/management`](packages/php/management) |
| Packagist | `sendmux/sdk` | PHP umbrella package | surface-specific | `composer require sendmux/sdk:^1.0` | [`packages/php/sdk`](packages/php/sdk) |
| RubyGems | `sendmux-core` | Shared Ruby helpers | n/a | `gem install sendmux-core` | [`packages/ruby/core`](packages/ruby/core) |
| RubyGems | `sendmux-sending` | Sending API | `smx_mbx_*` or owner-approved `smx_agent_*` | `gem install sendmux-sending` | [`packages/ruby/sending`](packages/ruby/sending) |
| RubyGems | `sendmux-mailbox` | Mailbox API | `smx_mbx_*` or `smx_agent_*` | `gem install sendmux-mailbox` | [`packages/ruby/mailbox`](packages/ruby/mailbox) |
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

Use send-capable `smx_mbx_*` keys or owner-approved Sending-resource `smx_agent_*` tokens for Sending clients. Use `smx_mbx_*` keys or scoped `smx_agent_*` tokens for Mailbox clients. Use root `smx_root_*` keys for Management clients. Agent tokens remain limited by server-side scopes; pre-claim self-registered agent tokens do not include `email.send`.

For command-line access, install the CLI:

```sh
brew install sendmux/tap/sendmux
npm install -g @sendmux/cli
sendmux --help
```

For MCP clients, install `sendmux-mcp` or connect to the hosted MCP endpoint:

```sh
pip install sendmux-mcp
sendmux-mcp-mailbox --help
```

The hosted MCP endpoint is `https://mcp.sendmux.ai/mcp`. Local MCP commands support stdio and HTTP transports; hosted MCP uses OAuth and does not require manual API keys or custom OAuth endpoints.

For AI-agent frameworks, first-party tool wrappers are available:

```sh
npm install @sendmux/ai-sdk ai zod   # Vercel AI SDK: sendmux({ apiKey }) returns a ToolSet
pip install langchain-sendmux        # LangChain: SendmuxToolkit(api_key=...).get_tools()
```

Both wrap the generated Sending and Mailbox clients, so the OpenAPI spec stays the single source of truth.

## Attachments And Live Mailbox Events

Mailbox attachment metadata now includes a short-lived `download_url`. Fetch that URL promptly with a plain HTTP client; it does not require an `Authorization` header, but it expires after a short TTL. If a download URL expires, re-fetch the message or attachment metadata to receive a fresh URL.

For outbound files, avoid manually placing base64 in prompts or source strings. Use the zero-context path for your lane:

- CLI: `sendmux mailbox:send-message --attach ./report.pdf` or `sendmux sending:send --attach ./report.pdf`.
- TypeScript: use `@sendmux/mailbox/node` `sendMailboxMessageWithFiles(...)` or `@sendmux/sending/node` `sendEmailWithFiles(...)`.
- Python: use `sendmux_mailbox.send_mailbox_message_with_files(...)` or `sendmux_sending.send_email_with_files(...)`.
- MCP: local stdio can use `mailbox_upload_attachment` with `file_path`; hosted and shell-capable agents can mint a presigned upload URL, `PUT` bytes to it without an API key, then send with the returned `blob_id`.

Mailbox direct uploads, presigned uploads, CLI `--attach`, and mailbox SDK file helpers share the mailbox attachment cap: currently `7,500,000` bytes per attachment. Sending API attachment helpers encode files into the send request body; the generated Sending API limit is max 10 attachments and a 25 MB request body.

Small generated attachments can still use inline base64 where the API schema supports them. MCP inline base64 is capped at `32 KiB` decoded; the cheaper alternatives are `file_path`, presigned upload, CLI `--attach`, and SDK file helpers.

Live mailbox events are available through idiomatic lanes:

- TypeScript: `streamMailboxEvents(...)` returns an async iterator over typed mailbox realtime events.
- Python: `iter_mailbox_events(...)` yields typed `MailboxRealtimeEvent` models from the generated mailbox client.
- CLI: `sendmux mailbox:stream-events --follow` prints one JSON event per line until the stream closes or the process is interrupted.
- MCP: use `mailbox_wait_for_message` for bounded waits inside agent tool calls, then `mailbox_get_attachment` to renew attachment metadata and fetch `download_url`.

## Repository structure

| Path | Purpose |
| --- | --- |
| [`packages/ts`](packages/ts) | TypeScript SDK packages and the `sendmux` CLI. |
| [`packages/python`](packages/python) | Python SDK packages and the `sendmux-mcp` package. |
| [`go`](go) | Go module `sendmux.ai/go` and subpackages. |
| [`rust`](rust) | Rust crate published as `sendmux` on crates.io. |
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
