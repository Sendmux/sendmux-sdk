# @sendmux/sending

Generated TypeScript client for the Sendmux Sending API.

Install:

```sh
npm install @sendmux/sending
```

Example:

```ts
import {
  createSendingClient,
  sendingSendEmail,
} from "@sendmux/sending";

const client = createSendingClient({
  apiKey: process.env.SENDMUX_API_KEY!,
});

await sendingSendEmail({
  client,
  body: {
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Hello from Sendmux",
    html: "<p>Hello.</p>",
  },
});
```

Use an `smx_root_*` API key.
