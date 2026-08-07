# @sendmux/ai-sdk

[Vercel AI SDK](https://ai-sdk.dev) tools for [Sendmux](https://sendmux.ai), the email API for AI agents.

Gives an agent its own mailbox: it can send email, read what arrives, and reply from its own address.

## Requirements

- Node.js 18 or newer
- `ai` v5 and `zod` (peer dependencies — you already install `ai` to call `generateText`)

## Installation

```sh
npm install @sendmux/ai-sdk ai zod
```

## Getting an API key

The tools need a key that can both send and receive. Two ways to get one:

- **Dashboard** — create a mailbox and a mailbox-scoped key (`smx_mbx_*`). See [API keys](https://sendmux.ai/docs/guides/api-keys).
- **Agent self-registration** — the agent claims its own `@myagent.mx` mailbox and gets an `smx_agent_*` token, with no human signup first. See [email for AI agents](https://sendmux.ai/solutions/for-ai-agents/).

Note on agent tokens: a freshly self-registered `smx_agent_*` token can read and receive, but **cannot send** until a human owner has been invited and has approved it. Until then `send_email` and `reply` will fail. A dashboard `smx_mbx_*` key with send permission works immediately.

Read the key from the environment. Never hard-code it.

## Quick start

```ts
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { sendmux } from "@sendmux/ai-sdk";

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: sendmux({
    apiKey: process.env.SENDMUX_API_KEY!,
    defaultFrom: "agent@yourdomain.dev",
  }),
  prompt: "Read the inbox and reply to anyone asking about pricing.",
});
```

## Tools

`sendmux(config)` returns a Vercel AI SDK `ToolSet` with three tools.

### `send_email`

Sends through your configured sending providers, to any recipient.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | string | yes | Recipient email address |
| `subject` | string | yes | Subject line |
| `text` | string | yes | Plain-text body |
| `html` | string | no | HTML body. Generated from `text` if omitted |
| `from` | string | no | Sender address. Falls back to `defaultFrom` |
| `idempotencyKey` | string | no | Makes a retried send idempotent for 24 hours |

### `list_messages`

Lists messages in the agent's own mailbox, newest first.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `limit` | integer | no | How many to return, 1 to 100 |

### `reply`

Sends from the agent's own mailbox address, rather than through a sending provider. Use this to answer someone who wrote in.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | string | yes | Recipient email address |
| `subject` | string | yes | Subject line |
| `text` | string | yes | Plain-text body |
| `html` | string | no | HTML body. Generated from `text` if omitted |
| `idempotencyKey` | string | no | Makes a retried send idempotent for 24 hours |

## Configuration

```ts
sendmux({ apiKey, defaultFrom });
```

| Option | Required | Purpose |
| --- | --- | --- |
| `apiKey` | yes | A send + receive mailbox key (`smx_mbx_*`) or a scoped agent token (`smx_agent_*`) |
| `defaultFrom` | no | Default sender for `send_email`. Without it, the model has to supply `from` on every call |

## Retries and duplicate sends

Agents retry. Pass `idempotencyKey` on `send_email` and `reply` and Sendmux will send once, even if the same call arrives several times inside 24 hours. Any stable string works — a task id, a thread id, a hash of the message.

Details: [idempotency](https://sendmux.ai/docs/guides/idempotency).

## Common errors

| What you see | Why | Fix |
| --- | --- | --- |
| `No sender address` | No `from` on the call and no `defaultFrom` set | Set `defaultFrom`, or have the model pass `from` |
| Send rejected on an agent token | The token is self-registered and not yet owner-approved | Complete the owner invite and approval |
| Auth failure | Key lacks send or receive permission | Check the key's scope in the dashboard |

## Related

- [Quickstart](https://sendmux.ai/docs/guides/quickstart)
- [Mailboxes](https://sendmux.ai/docs/guides/mailboxes)
- [All Sendmux SDKs](https://sendmux.ai/docs/sdks)
- [Pricing](https://sendmux.ai/pricing/) — usage-based, no per-seat or per-mailbox fees

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
