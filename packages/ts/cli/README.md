# @sendmux/cli

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fcli)](https://www.npmjs.com/package/@sendmux/cli)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fcli)](https://www.npmjs.com/package/@sendmux/cli)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fcli)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Agent-drivable command line interface for Sendmux.

## Documentation

- Sendmux docs: [sendmux.ai/docs](https://sendmux.ai/docs)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- npm global installs, `npx`, or a downloaded release tarball.
- A root `smx_root_*` key for Management commands.
- A mailbox-scoped `smx_mbx_*` key for Mailbox and Sending commands.

## Installation

```sh
npm install -g @sendmux/cli
```

The package exposes the `sendmux` binary.

## Usage

Create profiles for each key type before running API commands.

```sh
sendmux profiles:set default --api-key smx_root_... --default
sendmux profiles:set mailbox --api-key smx_mbx_...
sendmux profiles:set sending --api-key smx_mbx_...
```

Run commands with `--json` for machine-readable output.

```sh
sendmux management:domains:list --profile default --json
sendmux mailbox:messages:list --profile mailbox --query limit=25 --json
sendmux sending:send --profile sending --body '{"from":{"email":"sender@example.com"},"to":{"email":"recipient@example.com"},"subject":"Hello","html_body":"<p>Hello.</p>","text_body":"Hello"}' --json
```

Commands reject mismatched key types before making a network request.

## Commands

The CLI includes `95` generated API operation commands:

- `40` Mailbox commands, including `mailbox:messages:list`, `mailbox:messages:get`, `mailbox:send-message`, and `mailbox:list-granted-mailboxes`.
- `52` Management commands, including `management:domains:list`, `management:create-mailbox`, `management:get-spend-summary`, and `management:create-webhook`.
- `3` Sending commands: `sending:get-open-api-spec`, `sending:send`, and `sending:send:batch`.
- Profile commands: `profiles:list`, `profiles:set`, and `profiles:show`.

Use command-level help for required path, query, header, and body fields.

```sh
sendmux management:domains:get --help
sendmux sending:send --help
```

## Global API flags

Operation commands support:

- `--api-key`
- `--base-url`
- `--profile` / `-p`
- `--body`
- `--body-file`
- `--header`
- `--idempotency-key`
- `--if-match`
- `--if-none-match`
- `--path`
- `--query`
- `--json`

`--path`, `--query`, and `--header` use `name=value` syntax and can be repeated when the operation accepts multiple values.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the CLI version, command, flags, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
