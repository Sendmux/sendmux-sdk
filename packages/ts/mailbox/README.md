# @sendmux/mailbox

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fmailbox)](https://www.npmjs.com/package/@sendmux/mailbox)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fmailbox)](https://www.npmjs.com/package/@sendmux/mailbox)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fmailbox)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated TypeScript client for the Sendmux Mailbox API.

## Documentation

- Mailbox API reference: [docs.sendmux.ai/mailbox-api/introduction](https://docs.sendmux.ai/mailbox-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A mailbox-scoped Sendmux API key with the `smx_mbx_*` prefix.
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
