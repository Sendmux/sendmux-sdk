import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  createMailboxClient,
  mailboxListMessages,
  mailboxSendMessage,
} from "@sendmux/mailbox";
import { createSendingClient, sendingSendEmail } from "@sendmux/sending";

/**
 * Configuration for {@link sendmux}.
 */
export interface SendmuxToolsConfig {
  /**
   * A send + receive capable mailbox API key (`smx_mbx_*`) or a scoped agent
   * token. Read it from your environment; never hard-code it.
   */
  apiKey: string;
  /**
   * Default From address used by the `send_email` tool when a call omits
   * `from`. Optional - if unset, the model must supply `from` per call.
   */
  defaultFrom?: string;
}

const htmlFromText = (text: string): string =>
  `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;

/**
 * Build a Vercel AI SDK {@link ToolSet} backed by Sendmux, giving an agent
 * three tools: `send_email`, `list_messages`, and `reply`.
 *
 * @example
 * ```ts
 * import { generateText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { sendmux } from "@sendmux/ai-sdk";
 *
 * const { text } = await generateText({
 *   model: openai("gpt-4o"),
 *   tools: sendmux({ apiKey: process.env.SENDMUX_API_KEY! }),
 *   prompt: "Reply to the latest invoice thread.",
 * });
 * ```
 */
export function sendmux(config: SendmuxToolsConfig): ToolSet {
  const sendingClient = createSendingClient({ apiKey: config.apiKey });
  const mailboxClient = createMailboxClient({ apiKey: config.apiKey });

  return {
    send_email: tool({
      description:
        "Send an email through Sendmux to any recipient. Returns the send result including the message id.",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        text: z.string().describe("Plain-text body of the email"),
        html: z.string().optional().describe("Optional HTML body"),
        from: z
          .string()
          .optional()
          .describe(
            "Sender email address; defaults to the configured sender if omitted",
          ),
      }),
      execute: async ({ to, subject, text, html, from }) => {
        const sender = from ?? config.defaultFrom;
        if (sender === undefined) {
          throw new Error(
            "No sender address: pass `from` in the tool call, or set `defaultFrom` on sendmux().",
          );
        }
        const res = await sendingSendEmail({
          client: sendingClient,
          body: {
            from: { email: sender },
            to: { email: to },
            subject,
            text_body: text,
            html_body: html ?? htmlFromText(text),
          },
        });
        return res.data;
      },
    }),

    list_messages: tool({
      description:
        "List recent messages in the agent's Sendmux mailbox, newest first.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of messages to return (1-100)"),
      }),
      execute: async ({ limit }) => {
        const res = await mailboxListMessages({
          client: mailboxClient,
          ...(limit === undefined ? {} : { query: { limit } }),
        });
        return res.data;
      },
    }),

    reply: tool({
      description:
        "Send a message from the agent's own Sendmux mailbox, for example to reply to an incoming sender.",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Subject line"),
        text: z.string().describe("Plain-text body"),
        html: z.string().optional().describe("Optional HTML body"),
      }),
      execute: async ({ to, subject, text, html }) => {
        const res = await mailboxSendMessage({
          client: mailboxClient,
          body: {
            to: [{ email: to, name: null }],
            subject,
            text_body: text,
            html_body: html ?? htmlFromText(text),
          },
        });
        return res.data;
      },
    }),
  };
}

export default sendmux;
