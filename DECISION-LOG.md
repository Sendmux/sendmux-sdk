# Decision Log - Attachments, Search, And Events

## Assumptions

1. The SDK worktree for this change is `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk-attachments-first-class`. [file:README.md]
2. Generated SDK clients must stay OpenAPI-driven; manual changes belong in generators or non-generated helper modules. [file:scripts/generate-python.mjs] [file:scripts/generate-cli.mjs]

## Decisions

### Attachment Download Flow

Decision: SDKs and MCP treat `MailboxAttachment.download_url` as a short-lived presigned URL that can be fetched by plain HTTP clients without an `Authorization` header. If it expires, clients re-fetch message or attachment metadata. [file:packages/ts/mailbox/src/generated/types.gen.ts] [research:https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html]

Reasoning: Presigned URLs are a standard capability URL pattern: access is granted by the signed URL and bounded by expiry, matching the locked architecture and agent clients that cannot attach headers. [research:https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html]

### MCP Binary Exposure

Decision: MCP does not expose raw attachment bytes as a tool result. `mailbox_get_attachment` returns structured metadata plus a fresh `download_url`; agents fetch the URL externally. [file:packages/python/mcp/sendmux_mcp/curation.py] [file:packages/python/mcp/sendmux_mcp/server.py]

Reasoning: MCP tools are designed around content blocks and structured outputs with optional `outputSchema`; arbitrary `application/octet-stream` bytes are not the canonical tool-result surface. [research:https://modelcontextprotocol.io/specification/2025-06-18/server/tools] FastMCP also documents structured outputs and schemas as the normal path for machine-readable tool results. [research:https://gofastmcp.com/servers/tools]

### MCP Upload Size And Modes

Decision: `mailbox_upload_attachment` accepts exactly one of `file_path`, `presign_upload_url=true`, or `content_base64`. Inline base64 is capped at `32 KiB` decoded; local file and presigned modes use the backend mailbox attachment upload cap, currently `7,500,000` bytes per attachment. [file:packages/python/mcp/sendmux_mcp/server.py] [file:/Users/rj/Desktop/GIT-REPOS/sendmux-attachments-first-class/src/server/api-v1/mailbox-api.ts]

Reasoning: MCP tool calls carry JSON payloads, so inline base64 should be reserved for tiny agent-authored content. Local stdio can read files through MCP roots, and hosted/shell-capable agents can use a presigned upload URL to move bytes outside model context. [file:packages/python/mcp/sendmux_mcp/server.py] [research:https://modelcontextprotocol.io/specification/2025-06-18/client/roots]

Decision: The signed upload `PUT` is treated as an opaque URL returned by `mailboxCreateAttachmentUpload`, not as a generated SDK operation. [file:packages/python/mcp/sendmux_mcp/openapi/openapi-app.json] [file:packages/ts/mailbox/src/node.ts]

Reasoning: Generated SDKs should call the authenticated mint operation, then use the returned absolute `upload_url` with ordinary HTTP and exact returned headers. This avoids adding a separate unauthenticated generated API surface while preserving the presigned capability URL workflow. [file:packages/ts/mailbox/src/node.ts] [research:https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html]

### Wait For Email In MCP

Decision: MCP exposes `mailbox_wait_for_message` as a bounded polling tool capped at 25 seconds, not an unbounded SSE subscription inside a tool call. [file:packages/python/mcp/sendmux_mcp/server.py]

Reasoning: MCP tool calls should return structured results; a long-lived server push subscription is better represented by the platform SSE endpoint or SDK/CLI event lanes. [research:https://modelcontextprotocol.io/specification/2025-06-18/server/tools]

### SDK And CLI Events

Decision: TypeScript exports `streamMailboxEvents(...)` as an async iterator over typed realtime events. [file:packages/ts/mailbox/src/events.ts]

Decision: Python exports `iter_mailbox_events(...)`, yielding generated `MailboxRealtimeEvent` models from the generated client. [file:packages/python/mailbox/sendmux_mailbox/events.py]

Decision: CLI `mailbox:stream-events` keeps the existing one-event default and adds `--follow` for newline-delimited JSON event streaming. [file:packages/ts/cli/src/operation-runner.ts] [file:packages/ts/cli/src/commands/mailbox/stream-events.ts]

Reasoning: Server-sent events are the canonical web platform mechanism for server-pushed events over `text/event-stream`, and `EventSource` keeps the connection open until closed. [research:https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events] [research:https://developer.mozilla.org/en-US/docs/Web/API/EventSource] Python's generated client already uses urllib3 response streaming, and urllib3 documents streamed response access through `HTTPResponse.stream`. [research:https://urllib3.readthedocs.io/en/stable/reference/urllib3.response.html]

### Labels, Folders, And Search

Decision: No new backend primitive is required for labels-as-structured-sets. Existing folder operations, message keyword updates, list/search filters, and batch update cover the use case; the MCP tool descriptions now teach agents to use those existing tools instead of adding duplicates. [file:packages/python/mcp/sendmux_mcp/curation.py] [file:packages/ts/mailbox/src/generated/types.gen.ts]

### Hosted OAuth

Decision: Hosted OAuth exposes the same curated attachment tools, while proxying the backing raw upload operation internally for `mailbox_upload_attachment`. [file:packages/python/mcp/sendmux_mcp/hosted_proxy.py] [file:packages/python/mcp/sendmux_mcp/permissions.py]

### Webhook Attachment URLs

Decision: Webhook payloads should carry attachment IDs/metadata and require a metadata re-fetch for a fresh presigned URL, not embed a short-lived URL directly. [file:/Users/rj/Desktop/GIT-REPOS/sendmux-attachments-first-class/src/app/api/v1/_lib/schemas/webhooks.ts:562] [file:/Users/rj/Desktop/GIT-REPOS/sendmux-attachments-first-class/src/app/api/v1/_lib/schemas/webhooks.ts:607]

Reasoning: Webhook delivery metadata and retained request payloads are available for 7 days, while presigned attachment URLs intentionally expire quickly; embedding a short-lived URL risks leaving webhook consumers with an already-expired capability URL. The safer agent workflow is to receive identifiers, then call message or attachment metadata when ready to download. [file:/Users/rj/Desktop/GIT-REPOS/sendmux-attachments-first-class/src/app/api/v1/_lib/schemas/webhooks.ts:562] [file:/Users/rj/Desktop/GIT-REPOS/sendmux-attachments-first-class/src/app/api/v1/_lib/schemas/webhooks.ts:607] [research:https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html]

## Found, Not Fixed

- No adjacent SDK issue was found that needs fixing outside the requested attachment/search/events scope. [file:DECISION-LOG.md]
