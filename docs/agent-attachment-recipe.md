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

3. Renew attachment metadata:
   - Tool: `mailbox_get_attachment`
   - Arguments: `message_id` and the attachment `id`.
   - The result includes a fresh short-lived `download_url`. [file:packages/python/mcp/sendmux_mcp/server.py]

4. Fetch the attachment:
   - Use a plain HTTP GET to `download_url`.
   - Do not add an `Authorization` header.
   - If the URL returns an expiry error, call `mailbox_get_attachment` again and retry the new URL. [file:packages/python/mcp/README.md]

5. Act on the content:
   - For markdown or text, read the HTTP response body directly.
   - Attachment text extraction and conversion are out of scope for Sendmux MCP. [file:DECISION-LOG.md]

## Upload And Send

1. For small agent-provided files, call `mailbox_upload_attachment` with base64 content.
2. Use the returned `blob_id` in `mailbox_send_message.attachments[]`.
3. For larger files, use the CLI or SDK binary upload path instead of MCP base64. [file:packages/python/mcp/README.md]
