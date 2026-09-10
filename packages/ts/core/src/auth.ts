import type {
  ApiKeyKind,
  SendmuxClientConfig,
} from "./types.js";
import { SendmuxApiError } from "./errors.js";

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
    (expected === "sending" && (isMailboxKey || isAgentToken)) ||
    (expected === "mailbox" && actual === "mailbox");

  if (!isCompatible) {
    throw new Error(`Expected a ${expected} API key, received a ${actual} API key`);
  }

  return actual;
}

export function authToken(config: SendmuxClientConfig): () => string | Promise<string> {
  if ((config.apiKey !== undefined) === (config.accessToken !== undefined)) {
    throw new SendmuxApiError({ message: "Sendmux authentication requires exactly one of apiKey or accessToken" });
  }
  return async () => {
    if (config.accessToken !== undefined) {
      const token = typeof config.accessToken === "function" ? await config.accessToken() : config.accessToken;
      if (typeof token !== "string" || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
        throw new SendmuxApiError({
          message: "Sendmux access token must be a non-empty bearer token without a scheme or whitespace",
        });
      }
      return token;
    }
    const value = typeof config.apiKey === "function" ? await config.apiKey() : config.apiKey;
    if (typeof value !== "string") {
      throw new SendmuxApiError({ message: "Sendmux authentication requires an API key or access token" });
    }
    assertApiKeyKind(value, config.apiKeyKind);
    return value;
  };
}
