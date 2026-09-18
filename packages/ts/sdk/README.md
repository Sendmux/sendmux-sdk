# @sendmux/sdk

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fsdk)](https://www.npmjs.com/package/@sendmux/sdk)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fsdk)](https://www.npmjs.com/package/@sendmux/sdk)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fsdk)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Optional umbrella package for the Sendmux TypeScript SDK.

## Documentation

- Sendmux docs: [sendmux.ai/docs](https://sendmux.ai/docs)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A send-capable `smx_mbx_*` key or owner-approved Sending-resource `smx_agent_*` token for Sending clients.
- A mailbox-scoped `smx_mbx_*` key or scoped `smx_agent_*` token for Mailbox clients.
- A root `smx_root_*` key for Management clients.
- A JavaScript runtime with the standard Fetch API.

## Installation

```sh
npm install @sendmux/sdk
```

## Migrate from 1.x to 2.0

`@sendmux/sdk` 2.0 re-exports `@sendmux/management` 2.0 and `@sendmux/mailbox` 2.0,
so it carries their two result-type changes; the `sending` and `core` namespaces
are unchanged. If you pass sending-account list entries to code that expects a
detail result, or construct thread-message list results (fixtures, mocks, or
wrappers annotated with the operation's result type), update those types before
upgrading to 2.0. Code that only reads results keeps compiling.

1. `management.managementListProviders` returns `ProviderListItem` entries
   without `variables`; `management.managementGetProvider` returns a
   `ProviderItem` with required `variables`. A list entry no longer satisfies
   the detail type. Derive separate list and detail types from the public
   operations (the namespaces don't export these generated model names
   directly), and give list-only code the list type:

   ```ts
   import { management } from "@sendmux/sdk";

   type ProviderListItem = NonNullable<
     Awaited<ReturnType<typeof management.managementListProviders>>["data"]
   >["data"][number];
   type ProviderItem = NonNullable<
     Awaited<ReturnType<typeof management.managementGetProvider>>["data"]
   >["data"];

   // Before: type ProviderRow = ProviderItem;
   type ProviderRow = ProviderListItem;
   ```

   If you need `variables`, fetch the detail with the account's `id` as
   `path.public_id`. Don't cast a list entry to `ProviderItem` or add an empty
   `variables` object to stand in for the account's actual variables:

   ```ts
   async function loadVariables(
     client: management.ManagementClient,
     account: ProviderListItem,
   ): Promise<ProviderItem["variables"] | undefined> {
     const detail = await management.managementGetProvider({
       client,
       path: { public_id: account.id },
     });
     return detail.data?.data.variables;
   }
   ```

2. `mailbox.mailboxListThreadMessages` returns
   `MailboxThreadMessageSummaryCursorListResponse` instead of
   `MailboxMessageSummaryCursorListResponse`: its `meta.thread_id` is required
   and `meta.sync_state` is an optional string. Add the thread identity to every
   constructed thread-message result:

   ```ts
   import { mailbox } from "@sendmux/sdk";

   type ThreadMessageList = NonNullable<
     Awaited<ReturnType<typeof mailbox.mailboxListThreadMessages>>["data"]
   >;

   // Before: meta: { request_id: "req_fixture" }
   const fixture: ThreadMessageList = {
     ok: true,
     meta: { request_id: "req_fixture", thread_id: "thr_1" },
     data: [],
     pagination: { has_more: false },
   };
   ```

   Ordinary `mailbox.mailboxListMessages` results remain
   `MailboxMessageSummaryCursorListResponse`: they have no thread identity and
   expose an optional typed `meta.sync_state`. Identity, submission, quota, and
   thread list responses likewise expose optional typed state metadata
   (`identity_state`, `query_state`); no new field is required there.

3. Run your application's TypeScript check. List-only code should accept
   `ProviderListItem`, code that reads `variables` must receive a detail result,
   and a constructed thread-message result without `meta.thread_id` fails with
   `Property 'thread_id' is missing in type … but required in type
   'MailboxThreadMessagesMeta'`.

Update `@sendmux/sdk`, any directly installed `@sendmux/management` or
`@sendmux/mailbox`, the lockfile, and affected annotations, fixtures, or call
sites together. To roll back, restore those package, lockfile, and call-site
changes together. The per-surface notes are in the
[`@sendmux/management`](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ts/management/README.md#migrate-from-1x-to-20)
and [`@sendmux/mailbox`](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ts/mailbox/README.md#migrate-from-1x-to-20)
READMEs.

## OAuth access tokens

Each surface client also accepts `accessToken`: a bare token string or a synchronous or asynchronous provider. Pass either `apiKey` or `accessToken`. The provider runs for each authenticated request; your application owns token storage and refresh coordination.

```ts
import { management } from "@sendmux/sdk";

const client = management.createManagementClient({
  accessToken: () => process.env.SENDMUX_ACCESS_TOKEN!,
});
```

Use a REST access token with the operation's required scopes and mailbox access. See [OAuth for REST APIs](https://sendmux.ai/docs/developer-tools/oauth).

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

console.log(response.data?.data.message_id);
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
