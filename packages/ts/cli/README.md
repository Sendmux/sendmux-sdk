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

- No existing Sendmux account or API key is required to register an agent inbox.
- npm global installs, `npx`, or a downloaded release tarball.
- Management commands require an OAuth profile with the requested permissions or a root `smx_root_*` key.
- Sending commands require an OAuth profile with `email.send`, a send-capable `smx_mbx_*` key, or an owner-approved agent profile.
- Mailbox commands require an OAuth profile with the requested mailbox permissions, a mailbox-scoped `smx_mbx_*` key, or a registered agent profile.

## Installation

```sh
npm install -g @sendmux/cli
```

The package exposes the `sendmux` binary.

## Sign in with OAuth

Sign in through your browser and request only the permissions your workflow needs:

```sh
sendmux auth:login work --scope mailbox.read
sendmux mailbox:get-connection --profile work --json
```

Repeat `--scope` for additional permissions, such as `email.send` or `domain.read`. The consent screen lets you choose the team and mailboxes. A login creates a new profile; it cannot overwrite an existing profile. Use `--no-browser` to print the authorization URL without opening it automatically; open that URL on the same computer so the loopback callback reaches the CLI.

The CLI uses an authorization code with S256 PKCE and validates the callback state and issuer. Access and refresh tokens are saved in the protected local configuration file; command results and profile listings do not reveal them. API commands refresh tokens when needed. Concurrent commands share one refresh operation. If a refresh response is lost, the CLI requires a new login instead of replaying the old refresh token.

Revoke the connection and remove its profile:

```sh
sendmux auth:logout work
```

If revocation fails, the profile stays available for another logout attempt. Revocation affects the connection associated with that profile.

For a headless workflow that already has an access token, supply it through `SENDMUX_ACCESS_TOKEN`. Do not also set `SENDMUX_API_KEY` or pass `--api-key`. The CLI does not refresh an environment-supplied token; its issuer or your credential provider must renew it.

## Usage

Register an agent inbox and save its durable read credential in a local profile:

```sh
sendmux agent:register my-agent \
  --mailbox-local-part my-agent \
  --client-name "My agent" \
  --default \
  --json
```

The registration result never prints the credential. The profile can read and receive mail without an expiry date, unless the registration is fully revoked. Inbox readiness may take a moment; the command waits for provisioning for up to 10 minutes and can be rerun safely with the same profile.

Read the inbox from any later process:

```sh
sendmux mailbox:messages:list --profile my-agent --query limit=25 --json
```

To enable sending, invite the inbox owner either during registration with `--owner-email` or afterward:

```sh
sendmux agent:invite-owner owner@example.com --profile my-agent --json
```

The owner must accept the invitation and approve sending. After approval, Sending API commands automatically exchange the durable read credential for a one-hour `email.send` token and reuse it until it approaches expiry:

```sh
sendmux sending:send \
  --profile my-agent \
  --idempotency-key "$IDEMPOTENCY_KEY" \
  --body '{"from":{"email":"sender@example.com"},"to":{"email":"recipient@example.com"},"subject":"Hello","text_body":"Hello"}' \
  --json
```

Existing Sendmux users can continue creating API-key profiles:

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

Check the selected profile's connection without sending an email:

```sh
sendmux management:get-connection --profile default --json
sendmux mailbox:get-connection --profile mailbox --json
sendmux sending:get-connection --profile sending --json
```

Each command returns the team, credential, connection label, permissions, and authorised mailboxes. Mailbox connection checks do not need a mailbox selector.

## Attachments And Events

Send a mailbox message with a local file in one command:

```sh
sendmux mailbox:send-message \
  --profile mailbox \
  --idempotency-key "$IDEMPOTENCY_KEY" \
  --attach ./report.md \
  --body '{"to":[{"email":"recipient@example.com","name":null}],"subject":"Report","text_body":"Attached."}' \
  --json
```

`--attach` can be repeated. The CLI reads and uploads each local file before sending, so the file bytes do not pass through model context. Mailbox uploads use the mailbox attachment cap, currently `7,500,000` bytes per attachment; Sending API sends use the generated Sending API request-body limits.

Upload a file first, then use the returned `blob_id` in `mailbox:send-message`:

```sh
sendmux mailbox:upload-attachment \
  --profile mailbox \
  --file ./report.md \
  --json
```

Use presigned upload when a shell should upload without an API key:

```sh
sendmux mailbox:upload-attachment \
  --profile mailbox \
  --file ./report.md \
  --via-presigned \
  --json
```

Attachment metadata returned from message, search, and event operations includes `download_url`. Fetch it promptly with any HTTP client; no `Authorization` header is needed. If it expires, re-run the message or attachment metadata command to get a fresh URL.

Follow live mailbox events as newline-delimited JSON:

```sh
sendmux mailbox:stream-events \
  --profile mailbox \
  --query event_types=message.received \
  --query close_after=300 \
  --follow
```

## Commands

The CLI includes `104` generated API operation commands:

- `42` Mailbox commands, including `mailbox:get-connection`, `mailbox:messages:list`, `mailbox:send-message`, and `mailbox:list-granted-mailboxes`.
- `54` Management commands, including `management:get-connection`, `management:domains:list`, `management:create-mailbox`, and `management:create-webhook`.
- `8` Sending commands, including `sending:get-connection`, `sending:get-open-api-spec`, `sending:send`, `sending:send:batch`, and attachment upload commands.
- Agent onboarding commands: `agent:register` and `agent:invite-owner`.
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
- `--attach`
- `--file`
- `--via-presigned`
- `--content-type`
- `--header`
- `--idempotency-key`
- `--if-match`
- `--if-none-match`
- `--path`
- `--query`
- `--json`

`--path`, `--query`, and `--header` use `name=value` syntax and can be repeated when the operation accepts multiple values.

Attachment flags are command-specific: `--attach` works on supported send commands, while `--file` and `--via-presigned` work on mailbox attachment upload commands. Mailbox upload commands share the `7,500,000` byte per-attachment cap.

`mailbox:stream-events` also supports `--follow` to keep printing events until the stream closes or the process is interrupted.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the CLI version, command, flags, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
