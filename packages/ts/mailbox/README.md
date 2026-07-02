# @sendmux/mailbox

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fmailbox)](https://www.npmjs.com/package/@sendmux/mailbox)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fmailbox)](https://www.npmjs.com/package/@sendmux/mailbox)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fmailbox)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated TypeScript client for the Sendmux Mailbox API.

## Documentation

- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A mailbox-scoped `smx_mbx_*` key or scoped `smx_agent_*` token.
- A JavaScript runtime with the standard Fetch API.

## Installation

```sh
npm install @sendmux/mailbox
```

## Usage

```ts
import {
  createMailboxClient,
  mailboxListMessages,
  streamMailboxEvents,
} from "@sendmux/mailbox";

const client = createMailboxClient({
  apiKey: process.env.SENDMUX_MAILBOX_API_KEY!,
});

const messages = await mailboxListMessages({
  client,
  query: { limit: 50 },
});

console.log(messages.data);
```

The package exports every generated Mailbox operation plus:

- `createMailboxClient`
- `configureMailbox`
- `MailboxClient`
- `streamMailboxEvents`

## Attachments

Message and event attachment metadata includes `download_url`, a short-lived presigned URL for that single attachment. Fetch it promptly with a plain HTTP client; no `Authorization` header is needed. If the URL has expired, call `mailboxGetMessage` or list/search messages again to receive fresh metadata.

```ts
import {
  createMailboxClient,
  mailboxGetMessage,
  mailboxSendMessage,
  mailboxUploadAttachment,
} from "@sendmux/mailbox";

const client = createMailboxClient({
  apiKey: process.env.SENDMUX_MAILBOX_API_KEY!,
});

const message = await mailboxGetMessage({
  client,
  path: { message_id: "msg_123" },
});
const attachment = message.data.data.attachments[0];
const downloaded = await fetch(attachment.download_url);
const bytes = await downloaded.arrayBuffer();

const upload = await mailboxUploadAttachment({
  client,
  body: new TextEncoder().encode("hello\n"),
  query: { filename: "hello.txt" },
  headers: { "Content-Type": "text/plain" },
});

await mailboxSendMessage({
  client,
  body: {
    to: [{ email: "recipient@example.com", name: null }],
    subject: "Attachment",
    text_body: "See attached.",
    attachments: [{
      blob_id: upload.data.data.blob_id,
      filename: "hello.txt",
      content_type: "text/plain",
    }],
  },
});
```

Inline base64 attachments remain available for small sends through the generated `attachments[].content` body shape. Use upload plus `blob_id` when content is large enough that base64 would be awkward for an SDK or agent payload.

## Events

Use `streamMailboxEvents` for server-sent mailbox events.

```ts
for await (const event of streamMailboxEvents({
  client,
  query: { close_after: 300, event_types: "message.received" },
})) {
  console.log(event.event_type, event.message_id);
}
```

## Pagination

Use `paginate` from `@sendmux/core` with list operations that return cursor pagination.

```ts
import { paginate } from "@sendmux/core";
import {
  createMailboxClient,
  mailboxListMessages,
} from "@sendmux/mailbox";

const client = createMailboxClient({
  apiKey: process.env.SENDMUX_MAILBOX_API_KEY!,
});

for await (const message of paginate((cursor) =>
  mailboxListMessages({
    client,
    query: { cursor, limit: 50 },
  }),
)) {
  console.log(message.id);
}
```

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
