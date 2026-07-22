# @sendmux/ai-sdk

[Vercel AI SDK](https://ai-sdk.dev) tools for [Sendmux](https://sendmux.ai), the email API for AI agents. Give an agent tools to send email and read its own inbox.

## Installation

```sh
npm install @sendmux/ai-sdk ai zod
```

`ai` and `zod` are peer dependencies (you already install `ai` to use `generateText`).

## Usage

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { sendmux } from "@sendmux/ai-sdk";

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: sendmux({ apiKey: process.env.SENDMUX_API_KEY! }),
  prompt: "Reply to the latest invoice thread.",
});
```

## Tools

`sendmux(config)` returns a Vercel AI SDK `ToolSet` with three tools:

- `send_email` - send an email to any recipient through Sendmux.
- `list_messages` - list recent messages in the agent's mailbox.
- `reply` - send a message from the agent's own mailbox.

## Configuration

- `apiKey` (required) - a send + receive capable mailbox API key (`smx_mbx_*`) or a scoped agent token.
- `defaultFrom` (optional) - default From address for `send_email` when a call omits `from`.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
