# @sendmux/mailbox

Generated TypeScript client for the Sendmux Mailbox API.

Install:

```sh
npm install @sendmux/mailbox
```

Example:

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
```

Use an `smx_mbx_*` API key.
