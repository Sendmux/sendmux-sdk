# Sendmux SDKs

Official Sendmux SDK workspace.

This repository publishes modular TypeScript packages first, with Python, Go, PHP, Ruby, MCP, and CLI packages following the build plan.

## TypeScript Packages

Install only the surface you need:

```sh
npm install @sendmux/sending
npm install @sendmux/mailbox
npm install @sendmux/management
```

Or install the optional umbrella package:

```sh
npm install @sendmux/sdk
```

| Package | API surface | API key |
| --- | --- | --- |
| `@sendmux/sending` | Send email | `smx_root_*` |
| `@sendmux/mailbox` | Read and manage one mailbox | `smx_mbx_*` |
| `@sendmux/management` | Manage domains, mailboxes, sending accounts, billing, and webhooks | `smx_root_*` |
| `@sendmux/core` | Shared runtime helpers and types | n/a |
| `@sendmux/sdk` | Optional umbrella re-export | surface-specific |

## Usage

Sending:

```ts
import {
  createSendingClient,
  sendingSendEmail,
} from "@sendmux/sending";

const client = createSendingClient({
  apiKey: process.env.SENDMUX_API_KEY!,
});

const response = await sendingSendEmail({
  client,
  body: {
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Hello from Sendmux",
    html: "<p>Hello.</p>",
  },
});

console.log(response.data.message_id);
```

Mailbox:

```ts
import {
  createMailboxClient,
  mailboxListMessages,
} from "@sendmux/mailbox";
import { paginate } from "@sendmux/core";

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

Management:

```ts
import {
  createManagementClient,
  managementListDomains,
} from "@sendmux/management";

const client = createManagementClient({
  apiKey: process.env.SENDMUX_API_KEY!,
});

const domains = await managementListDomains({ client });
console.log(domains.data);
```

## Runtime Helpers

`@sendmux/core` provides:

- API key prefix validation for `smx_root_*` and `smx_mbx_*`
- typed `ApiError` and `SuccessEnvelope`
- cursor pagination via `paginate`
- retrying `fetch` with exponential backoff, jitter, `Retry-After`, and `X-RateLimit-Reset`
- helpers for `Idempotency-Key`, `If-Match`, `If-None-Match`, and ETag handling

## Versioning

SDK packages follow the Sendmux API contract version:

- Sending packages track the sending API contract.
- Mailbox and management packages track the app API contract.
- Patch versions may differ by package for SDK-only fixes.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
```

The SDKs are generated from committed OpenAPI snapshots. Generated output must stay in the same pull request as any API contract change.
