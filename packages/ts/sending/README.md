# @sendmux/sending

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fsending)](https://www.npmjs.com/package/@sendmux/sending)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fsending)](https://www.npmjs.com/package/@sendmux/sending)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fsending)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated TypeScript client for the Sendmux Sending API.

## Documentation

- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A send-capable `smx_mbx_*` key or owner-approved Sending-resource `smx_agent_*` token.
- A JavaScript runtime with the standard Fetch API.

## Installation

```sh
npm install @sendmux/sending
```

## Usage

```ts
import {
  createSendingClient,
  sendingSendEmail,
} from "@sendmux/sending";

const client = createSendingClient({
  apiKey: process.env.SENDMUX_SENDING_API_KEY!,
});

const response = await sendingSendEmail({
  client,
  body: {
    from: { email: "sender@example.com" },
    to: { email: "recipient@example.com" },
    subject: "Hello from Sendmux",
    html_body: "<p>Hello.</p>",
    text_body: "Hello.",
  },
});

console.log(response.data.message_id);
```

The package exports every generated Sending operation plus:

- `createSendingClient`
- `configureSending`
- `SendingClient`
- Node-only helpers from `@sendmux/sending/node`: `uploadAttachmentFromFile`, `sendEmailWithFiles`, and explicit legacy `attachmentFromFile`

## Attachments

For real files, upload bytes first and send with returned `attachment_id` refs. `sendEmailWithFiles` does that automatically, so file bytes never enter model context or the JSON send body. Inline base64 remains available only when you intentionally call `attachmentFromFile` for tiny generated content.

```ts
import { createSendingClient } from "@sendmux/sending";
import { sendEmailWithFiles } from "@sendmux/sending/node";

const client = createSendingClient({ apiKey: process.env.SENDMUX_SENDING_API_KEY! });

await sendEmailWithFiles({
  client,
  files: ["./report.pdf"],
  headers: { "Idempotency-Key": "report-123" },
  body: {
    from: { email: "sender@example.com" },
    to: { email: "recipient@example.com" },
    subject: "Report",
    html_body: "<p>Attached.</p>",
  },
});
```

To upload first and compose the send yourself:

```ts
import { createSendingClient, sendingSendEmail } from "@sendmux/sending";
import { uploadAttachmentFromFile } from "@sendmux/sending/node";

const client = createSendingClient({ apiKey: process.env.SENDMUX_SENDING_API_KEY! });
const attachment = await uploadAttachmentFromFile({ client, filePath: "./report.pdf" });

await sendingSendEmail({
  client,
  body: {
    from: { email: "sender@example.com" },
    to: { email: "recipient@example.com" },
    subject: "Report",
    html_body: "<p>Attached.</p>",
    attachments: [{ attachment_id: attachment.data.attachment_id }],
  },
});
```

## Request helpers

Use `@sendmux/core` when you need idempotency, conditional request, pagination, retry, or typed-error helpers.

```ts
import { idempotencyHeaders } from "@sendmux/core";
import { createSendingClient, sendingSendEmail } from "@sendmux/sending";

const client = createSendingClient({
  apiKey: process.env.SENDMUX_SENDING_API_KEY!,
});

await sendingSendEmail({
  client,
  body: {
    from: { email: "sender@example.com" },
    to: { email: "recipient@example.com" },
    subject: "Receipt",
    html_body: "<p>Thanks.</p>",
    text_body: "Thanks.",
  },
  headers: idempotencyHeaders("email_123"),
});
```

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
