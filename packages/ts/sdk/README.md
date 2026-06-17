# @sendmux/sdk

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fsdk)](https://www.npmjs.com/package/@sendmux/sdk)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fsdk)](https://www.npmjs.com/package/@sendmux/sdk)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fsdk)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Optional umbrella package for the Sendmux TypeScript SDK.

## Documentation

- Sendmux docs: [docs.sendmux.ai](https://docs.sendmux.ai)
- Management API reference: [docs.sendmux.ai/api/introduction](https://docs.sendmux.ai/api/introduction)
- Mailbox API reference: [docs.sendmux.ai/mailbox-api/introduction](https://docs.sendmux.ai/mailbox-api/introduction)
- Sending API reference: [docs.sendmux.ai/sending-api/introduction](https://docs.sendmux.ai/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A mailbox-scoped `smx_mbx_*` key for Sending and Mailbox clients.
- A root `smx_root_*` key for Management clients.
- A JavaScript runtime with the standard Fetch API.

## Installation

```sh
npm install @sendmux/sdk
```

## Usage

```ts
import { sending } from "@sendmux/sdk";

const client = sending.createSendingClient({
  apiKey: process.env.SENDMUX_SENDING_API_KEY!,
});

const response = await sending.sendingSendEmail({
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

The umbrella package re-exports:

- `core` from `@sendmux/core`
- `sending` from `@sendmux/sending`
- `mailbox` from `@sendmux/mailbox`
- `management` from `@sendmux/management`

Use the per-surface packages directly when an integration only needs one API surface.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
