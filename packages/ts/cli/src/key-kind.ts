export type ApiKeyKind = "mailbox" | "root";

export function inferApiKeyKind(apiKey: string): ApiKeyKind {
  if (apiKey.startsWith("smx_root_")) {
    return "root";
  }

  if (apiKey.startsWith("smx_mbx_")) {
    return "mailbox";
  }

  throw new Error("Sendmux API keys must start with smx_root_ or smx_mbx_");
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 16) {
    return "********";
  }

  return `${apiKey.slice(0, 9)}...${apiKey.slice(-4)}`;
}
