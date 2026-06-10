# Sendmux MCP

Curated Model Context Protocol servers for the Sendmux mailbox, management, and sending API surfaces.

## Install

```bash
pip install sendmux-mcp
```

For local development from this repository:

```bash
OPENAPI_INPUT_DIR=/path/to/sendmux-docs pnpm build:mcp
```

## Run

Run one surface, a selected combination, or all three surfaces from one MCP setup.

```bash
SENDMUX_API_KEY=smx_mbx_... sendmux-mcp-mailbox
SENDMUX_API_KEY=smx_root_... sendmux-mcp-management
SENDMUX_API_KEY=smx_mbx_... sendmux-mcp-sending

SENDMUX_MCP_SURFACES=mailbox,sending \
SENDMUX_MAILBOX_API_KEY=smx_mbx_... \
sendmux-mcp

SENDMUX_MCP_SURFACES=mailbox,management,sending \
SENDMUX_MAILBOX_API_KEY=smx_mbx_... \
SENDMUX_MANAGEMENT_API_KEY=smx_root_... \
SENDMUX_SENDING_API_KEY=smx_mbx_... \
sendmux-mcp
```

Use HTTP transport for hosted or remote clients. HTTP requires a separate MCP bearer token unless you explicitly opt out.

```bash
SENDMUX_API_KEY=smx_mbx_... \
SENDMUX_MCP_HTTP_BEARER_TOKEN=local-mcp-token \
sendmux-mcp-mailbox --transport http --host 127.0.0.1 --port 8765
```

The MCP endpoint defaults to `/mcp`; `/health` returns a small JSON health response.

## Configuration

| Setting | Environment | Default |
| --- | --- | --- |
| Tool surfaces | `SENDMUX_MCP_SURFACES` | required for `sendmux-mcp`; wrapper commands select one product line |
| API key fallback | `SENDMUX_API_KEY` | accepted for compatible single-key setups |
| Mailbox API key | `SENDMUX_MAILBOX_API_KEY` | required when mailbox is selected unless a compatible fallback is provided |
| Management API key | `SENDMUX_MANAGEMENT_API_KEY` | required when management is selected unless a compatible fallback is provided |
| Sending API key | `SENDMUX_SENDING_API_KEY` | required when sending is selected unless a compatible mailbox key is provided |
| App API base URL | `SENDMUX_APP_BASE_URL` | `https://app.sendmux.ai/api/v1` |
| Sending API base URL | `SENDMUX_SENDING_BASE_URL` | `https://smtp.sendmux.ai/api/v1` |
| Transport | `SENDMUX_MCP_TRANSPORT` | `stdio` |
| HTTP host | `SENDMUX_MCP_HOST` | `127.0.0.1` |
| HTTP port | `SENDMUX_MCP_PORT` | `8765` |
| HTTP path | `SENDMUX_MCP_PATH` | `/mcp` |
| HTTP bearer token | `SENDMUX_MCP_HTTP_BEARER_TOKEN` | required for HTTP |
| Allowed browser origins | `SENDMUX_MCP_ALLOWED_ORIGINS` | no browser origins |
| Snapshot directory override | `SENDMUX_MCP_OPENAPI_INPUT_DIR` or `OPENAPI_INPUT_DIR` | packaged snapshots |
| App snapshot override | `SENDMUX_MCP_APP_OPENAPI` | packaged app snapshot |
| Sending snapshot override | `SENDMUX_MCP_SENDING_OPENAPI` | packaged sending snapshot |

Packaged OpenAPI snapshots are the default so released tool names, schemas, and descriptions do not drift. Path, directory, and URL overrides are available for development, canary, and debugging runs.

## Tool Surfaces

- Mailbox: message read/send, threads, folders, identity, and mailbox state tools. Requires an `smx_mbx_` key.
- Management: domains, mailboxes, logs, metrics, and webhook tools. Requires an `smx_root_` key.
- Sending: send and batch send tools. Requires an `smx_mbx_` key.

The server rejects keys with the wrong prefix before starting.
