import {
  configureGeneratedClient,
  type SurfaceClientConfig,
} from "@sendmux/core";

import {
  createClient,
  type Client,
} from "./generated/client/index.js";

export * from "./generated/sdk.gen.js";
export * from "./events.js";
export type { Client as MailboxClient } from "./generated/client/index.js";

const DEFAULT_BASE_URL = "https://app.sendmux.ai/api/v1";

export function createMailboxClient(config: SurfaceClientConfig): Client {
  const client = createClient({ baseUrl: config.baseUrl ?? DEFAULT_BASE_URL });
  return configureGeneratedClient(client, config, "mailbox");
}

export const configureMailbox = createMailboxClient;
