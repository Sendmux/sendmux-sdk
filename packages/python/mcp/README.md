# Email Inbox API + Sending by Sendmux

[![PyPI version](https://img.shields.io/pypi/v/sendmux-mcp)](https://pypi.org/project/sendmux-mcp/)
[![Python versions](https://img.shields.io/pypi/pyversions/sendmux-mcp)](https://pypi.org/project/sendmux-mcp/)
[![PyPI downloads](https://img.shields.io/pypi/dm/sendmux-mcp)](https://pypi.org/project/sendmux-mcp/)
[![Licence](https://img.shields.io/pypi/l/sendmux-mcp)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Email inbox API, inbound mail, and outbound sending MCP servers for AI agents, with inbound email, clean JSON parsing, webhooks, and multi-provider routing through Sendmux.

This package is the Sendmux MCP. Keep it separate from any documentation-search MCP used by docs tooling.

<!-- mcp-name: io.github.Sendmux/sendmux-mcp -->

## Documentation

- Sendmux docs: [sendmux.ai/docs](https://sendmux.ai/docs)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- Python 3.10 or newer.
- A send-capable `smx_mbx_*` key or owner-approved Sending-resource `smx_agent_*` token for Sending tools.
- A mailbox-scoped `smx_mbx_*` key or scoped `smx_agent_*` token for Mailbox tools.
- A root `smx_root_*` key for Management tools.

## Installation

```sh
pip install sendmux-mcp
```

## Usage

Run a single local server with the per-surface commands.

```sh
SENDMUX_API_KEY=smx_mbx_... sendmux-mcp-mailbox
SENDMUX_API_KEY=smx_root_... sendmux-mcp-management
SENDMUX_API_KEY=smx_mbx_... sendmux-mcp-sending
```

Run a combined local server with `sendmux-mcp`.

```sh
SENDMUX_MCP_SURFACES=mailbox,sending \
SENDMUX_MAILBOX_API_KEY=smx_mbx_... \
SENDMUX_SENDING_API_KEY=smx_mbx_... \
sendmux-mcp
```

Run all three local surfaces when you have both key types.

```sh
SENDMUX_MCP_SURFACES=mailbox,management,sending \
SENDMUX_MAILBOX_API_KEY=smx_mbx_... \
SENDMUX_MANAGEMENT_API_KEY=smx_root_... \
SENDMUX_SENDING_API_KEY=smx_mbx_... \
sendmux-mcp
```

The generic `sendmux-mcp` command also accepts `--surface` or `--surfaces`. The wrapper commands select exactly one surface.

## Transports

`stdio` is the default transport for local agent clients.

```sh
SENDMUX_API_KEY=smx_mbx_... sendmux-mcp-mailbox --transport stdio
```

`http` and `streamable-http` expose the MCP endpoint over HTTP. HTTP mode defaults to `127.0.0.1:8765/mcp` and requires a separate MCP bearer token unless you explicitly opt out.

```sh
SENDMUX_API_KEY=smx_mbx_... \
SENDMUX_MCP_HTTP_BEARER_TOKEN=local-mcp-token \
sendmux-mcp-mailbox --transport http --host 127.0.0.1 --port 8765 --path /mcp
```

`/health` returns a small JSON health response for the selected surfaces.

## Hosted Endpoint

The public hosted MCP endpoint is `https://mcp.sendmux.ai/mcp`.

For hosted clients, use HTTP transport with OAuth. Do not add manual `Authorization` headers, API keys, custom OAuth endpoints, or custom scopes unless your client explicitly requires them.

Hosted OAuth clients that omit requested scopes during registration or authorization are supported; the server advertises the hosted scope set through discovery and bearer challenges.

The packaged `sendmux-mcp-hosted` command runs the hosted server runtime. Local and private deployments should use the local commands above unless you are operating a compatible OAuth-backed hosted environment.

## Configuration

| Setting | Environment | Default |
| --- | --- | --- |
| Tool surfaces | `SENDMUX_MCP_SURFACES` | required for `sendmux-mcp`; wrapper commands select one surface |
| API key fallback | `SENDMUX_API_KEY` | accepted for compatible single-key setups |
| Mailbox API key | `SENDMUX_MAILBOX_API_KEY` | required when mailbox is selected unless a compatible fallback is provided |
| Management API key | `SENDMUX_MANAGEMENT_API_KEY` | required when management is selected unless a compatible fallback is provided |
| Sending API key | `SENDMUX_SENDING_API_KEY` | required when sending is selected unless the fallback key is a send-capable `smx_mbx_*` key or owner-approved Sending-resource `smx_agent_*` token |
| App API base URL | `SENDMUX_APP_BASE_URL` | `https://app.sendmux.ai/api/v1` |
| Sending API base URL | `SENDMUX_SENDING_BASE_URL` | `https://smtp.sendmux.ai/api/v1` |
| Transport | `SENDMUX_MCP_TRANSPORT` | `stdio` |
| HTTP host | `SENDMUX_MCP_HOST` | `127.0.0.1` |
| HTTP port | `SENDMUX_MCP_PORT` | `8765` |
| HTTP path | `SENDMUX_MCP_PATH` | `/mcp` |
| HTTP bearer token | `SENDMUX_MCP_HTTP_BEARER_TOKEN` | required for HTTP unless opt-out is enabled |
| Allow unauthenticated HTTP | `SENDMUX_MCP_ALLOW_UNAUTHENTICATED_HTTP` | `false` |
| Allowed browser origins | `SENDMUX_MCP_ALLOWED_ORIGINS` | no browser origins |
| Snapshot directory override | `SENDMUX_MCP_OPENAPI_INPUT_DIR` or `OPENAPI_INPUT_DIR` | packaged snapshots |
| App snapshot override | `SENDMUX_MCP_APP_OPENAPI` | packaged app snapshot |
| Sending snapshot override | `SENDMUX_MCP_SENDING_OPENAPI` | packaged sending snapshot |
| Request timeout | `SENDMUX_MCP_TIMEOUT_SECONDS` | `30` |
| Retry attempts | `SENDMUX_MCP_RETRY_MAX_ATTEMPTS` | `3` |

Packaged OpenAPI snapshots are the default so released tool names, schemas, and descriptions stay stable. Path, directory, and URL overrides are available for development, canary, and debugging runs.

## Tool Surfaces

- Mailbox: `25` tools for granted mailboxes, profile/session discovery, messages, attachments, bounded message waits, threads, folders, search, counts, and mailbox sends. Requires an `smx_mbx_*` key or scoped `smx_agent_*` token. Agent tokens remain limited by server-side scopes; pre-claim self-registered agent tokens do not include `email.send`.
- Management: `21` tools for domains, mailboxes, logs, metrics, spend summary, and webhooks. Requires an `smx_root_*` key.
- Sending: `5` tools for attachment upload refs, single sends, and batch sends. Requires an `smx_mbx_*` key or owner-approved Sending-resource `smx_agent_*` token.

The server rejects keys with the wrong prefix before starting.

## Attachment Workflow For Agents

Use `mailbox_wait_for_message` when a user asks an agent to wait for new mail. The tool is bounded; if it returns `matched=false`, call it again rather than holding an MCP tool call open indefinitely.

When a message has attachments:

1. Call `mailbox_read_attachment` with `message_id` and `attachment_id` when you need the attachment contents.
2. For small text-like attachments, read the returned `text`.
3. For binary or oversized attachments, use the returned `resource_link` / `download_url` promptly outside model context.
4. Use `mailbox_get_attachment` only when metadata is enough or you need to refresh the link.

Use `mailbox_upload_attachment` for outbound attachments over MCP. It accepts exactly one input mode:

- `file_path` for local stdio MCP when the file is inside a client-declared filesystem root.
- `presign_upload_url=true` for hosted MCP or shell-capable agents; upload the file to the returned URL with exact headers and no API key, then send with the returned `blob_id`.
- `content_base64` only for tiny agent-authored files, capped at `32 KiB` decoded. If it is too large, switch to `file_path`, presigned upload, CLI `--attach`, or SDK file helpers.

`file_path` and presigned upload modes use the mailbox attachment cap, currently `7,500,000` bytes per attachment. Presigned uploads also pin the exact declared byte length and content type.

For mailbox sends, `mailbox_send_message` accepts either tiny inline base64 attachment objects (`content`, `filename`, `content_type`) or uploaded attachment references (`blob_id`, `filename`, `content_type`).

For Sending API sends, call `sending_upload_attachment` with `file_path` on local stdio MCP, or call `sending_create_attachment_upload` and PUT bytes outside model context for hosted/shell-capable agents. Then pass `{"attachment_id": "att_..."}` in `sending_send_email.attachments[]`. Avoid Sending inline base64 except for tiny generated content.

## Console Scripts

- `sendmux-mcp`
- `sendmux-mcp-mailbox`
- `sendmux-mcp-management`
- `sendmux-mcp-sending`
- `sendmux-mcp-hosted`

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, command, transport, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
