export type ApiKeyKind = "mailbox" | "root";
export type RequiredApiKeyKind = ApiKeyKind | "sending";

export function inferApiKeyKind(apiKey: string): ApiKeyKind {
  if (apiKey.startsWith("smx_root_")) {
    return "root";
  }

  if (apiKey.startsWith("smx_mbx_")) {
    return "mailbox";
  }

  if (apiKey.startsWith("smx_agent_")) {
    return "mailbox";
  }

  throw new Error("Sendmux API keys must start with smx_root_, smx_mbx_, or smx_agent_");
}

export function isApiKeyCompatibleWithKind(apiKey: string, expectedKind: RequiredApiKeyKind): boolean {
  if (expectedKind === "sending") {
    return apiKey.startsWith("smx_mbx_");
  }

  return inferApiKeyKind(apiKey) === expectedKind;
}

export function apiKeyKindLabel(kind: RequiredApiKeyKind): string {
  return kind === "sending" ? "sending" : kind;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 16) {
    return "********";
  }

  return `${apiKey.slice(0, 9)}...${apiKey.slice(-4)}`;
}
