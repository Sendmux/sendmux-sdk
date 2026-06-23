import type {
  ApiKeyKind,
  SendmuxClientConfig,
} from "./types.js";

export function assertApiKeyKind(apiKey: string, expected?: ApiKeyKind): ApiKeyKind {
  const isMailboxKey = apiKey.startsWith("smx_mbx_");
  const isAgentToken = apiKey.startsWith("smx_agent_");
  const actual = isMailboxKey || isAgentToken ? "mailbox" : apiKey.startsWith("smx_root_") ? "root" : undefined;

  if (!actual) {
    throw new Error("Sendmux API keys must start with smx_root_, smx_mbx_, or smx_agent_");
  }

  const isCompatible =
    !expected ||
    actual === expected ||
    (expected === "sending" && isMailboxKey) ||
    (expected === "mailbox" && actual === "mailbox");

  if (!isCompatible) {
    throw new Error(`Expected a ${expected} API key, received a ${actual} API key`);
  }

  return actual;
}

export function authToken(config: SendmuxClientConfig): () => string | Promise<string> {
  return async () => {
    const value = typeof config.apiKey === "function" ? await config.apiKey() : config.apiKey;
    assertApiKeyKind(value, config.apiKeyKind);
    return value;
  };
}
