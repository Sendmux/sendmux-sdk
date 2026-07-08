# Agent Recipe - Wait For Email And Read An Attachment

## Assumptions

1. The agent is connected to the Sendmux Mailbox MCP surface. [file:packages/python/mcp/README.md]
2. The mailbox credential has permission to read messages and attachments. [file:packages/python/mcp/sendmux_mcp/permissions.py]

## MCP Workflow

1. Wait for the message:
   - Tool: `mailbox_wait_for_message`
   - Suggested arguments: `{"timeout_seconds": 20, "has_attachment": true}`
   - If `matched=false`, call the tool again; do not hold an MCP tool call open indefinitely. [file:packages/python/mcp/sendmux_mcp/server.py]

2. Inspect the message:
   - Use the returned message summary and `attachments` array.
   - If full content is needed, call `mailbox_get_message`. [file:packages/python/mcp/sendmux_mcp/curation.py]

3. Read the attachment:
   - Tool: `mailbox_read_attachment`
   - Arguments: `message_id` and the attachment `id`.
   - For markdown or text, use the returned `data.text`. [file:packages/python/mcp/README.md]

4. Fall back to a link only when needed:
   - Tool: `mailbox_get_attachment`
   - Use this when metadata is enough, the read result is `resource_link`, or you need to refresh an expired link.
   - Fetch the returned `download_url` promptly with a plain HTTP GET.
   - Do not add an `Authorization` header.
   - If the URL returns an expiry error, call `mailbox_get_attachment` again and retry the new URL. [file:packages/python/mcp/README.md]

5. Act on the content:
   - Use inline text directly.
   - For binary files, use the returned resource link or authenticated SDK/CLI helpers outside model context.

## Upload And Send

1. Mailbox sends:
   - Local stdio MCP: call `mailbox_upload_attachment` with `file_path`.
   - Hosted or shell-capable agents: call `mailbox_upload_attachment` with `presign_upload_url=true`, PUT the file outside model context, then use the returned `blob_id`.
   - Use `content_base64` only for tiny generated files. [file:packages/python/mcp/README.md]
2. Sending API sends:
   - Local stdio MCP: call `sending_upload_attachment` with `file_path`, then pass `{"attachment_id": "att_..."}` to `sending_send_email.attachments[]`.
   - Hosted or shell-capable agents: call `sending_create_attachment_upload`, PUT bytes with the returned headers outside model context, then pass the returned `attachment_id`.
   - CLI `sending:send --attach ./report.pdf` and SDK `sendEmailWithFiles(...)` already upload first and send by ref. [file:packages/python/mcp/README.md]
