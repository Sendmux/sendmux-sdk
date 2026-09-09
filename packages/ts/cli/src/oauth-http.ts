export const OAUTH_RESOURCE = "https://sendmux.ai/api";
export const DEFAULT_OAUTH_ISSUER = "https://app.sendmux.ai";

export function oauthUrl(value: string, issuer?: string): URL {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (issuer && url.origin !== new URL(issuer).origin)
  )
    throw new Error(
      "OAuth endpoints must use HTTPS and the configured issuer origin.",
    );
  return url;
}

export async function oauthRequest(
  endpoint: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  oauthUrl(endpoint);
  try {
    const response = await fetch(endpoint, {
      ...init,
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", ...init.headers },
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 256 * 1024)
            throw new Error("Response exceeds the OAuth size limit.");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
    }
    if (!response.ok) throw new Error("OAuth request was rejected.");
    if (bytes === 0) return {};
    if (
      !/^application\/json(?:;|$)/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new Error("Invalid OAuth content type.");
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid OAuth response.");
    return value as Record<string, unknown>;
  } catch {
    throw new Error(
      "OAuth request failed. Check the connection and try signing in again.",
    );
  }
}

export async function discoverOAuth(issuer: string, scopes: string[]) {
  const url = oauthUrl(issuer);
  const metadataUrl = `${url.origin}/.well-known/oauth-authorization-server${url.pathname === "/" ? "" : url.pathname}`;
  const metadata = await oauthRequest(metadataUrl);
  const supports = (field: string, value: string) =>
    Array.isArray(metadata[field]) && metadata[field].includes(value);
  if (
    metadata.issuer !== issuer ||
    !supports("code_challenge_methods_supported", "S256") ||
    !supports("token_endpoint_auth_methods_supported", "none") ||
    metadata.authorization_response_iss_parameter_supported !== true ||
    !supports("protected_resources", OAUTH_RESOURCE) ||
    !scopes.every((scope) => supports("scopes_supported", scope))
  )
    throw new Error(
      "The issuer does not support the requested Sendmux OAuth connection.",
    );
  const endpoint = (name: string) => {
    const value = metadata[name];
    if (typeof value !== "string")
      throw new Error("OAuth discovery is missing an endpoint.");
    return oauthUrl(value, issuer).href;
  };
  return {
    authorization: endpoint("authorization_endpoint"),
    registration: endpoint("registration_endpoint"),
    token: endpoint("token_endpoint"),
    revocation: endpoint("revocation_endpoint"),
  };
}

export function oauthTokenFields(
  value: Record<string, unknown>,
  allowedScopes: string[],
) {
  const validToken = (token: unknown): token is string =>
    typeof token === "string" && /^[A-Za-z0-9\-._~+/]+=*$/.test(token);
  if (
    !validToken(value.access_token) ||
    !validToken(value.refresh_token) ||
    typeof value.token_type !== "string" ||
    value.token_type.toLowerCase() !== "bearer" ||
    typeof value.expires_in !== "number" ||
    !Number.isSafeInteger(value.expires_in) ||
    value.expires_in <= 0 ||
    typeof value.scope !== "string"
  )
    throw new Error("The issuer returned invalid OAuth token metadata.");
  const scopes = value.scope.split(" ").filter(Boolean);
  if (!scopes.length || !scopes.every((scope) => allowedScopes.includes(scope)))
    throw new Error("The issuer returned unexpected OAuth scopes.");
  const expiresAt = Date.now() + value.expires_in * 1000;
  if (!Number.isSafeInteger(expiresAt))
    throw new Error("The issuer returned an invalid token lifetime.");
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt,
    scopes,
  };
}

export function oauthForm(fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  };
}
