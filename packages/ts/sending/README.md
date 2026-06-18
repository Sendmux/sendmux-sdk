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

- A mailbox-scoped Sendmux API key with the `smx_mbx_*` prefix.
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
