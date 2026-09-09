import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { promisify } from "node:util";

import {
  discoverOAuth,
  oauthForm,
  oauthRequest,
  oauthTokenFields,
  oauthUrl,
  OAUTH_RESOURCE,
} from "./oauth-http.js";
import {
  isOAuthProfile,
  updateCliConfig,
  type ActiveOAuthCliProfile,
} from "./profiles.js";

export async function loginOAuth(input: {
  configDir: string;
  name: string;
  issuer: string;
  scopes: string[];
  noBrowser: boolean;
  report: (message: string) => void;
}) {
  const issuer = oauthUrl(input.issuer).href.replace(/\/$/, "");
  const scopes = [
    ...new Set(
      input.scopes.flatMap((scope) => scope.split(/\s+/)).filter(Boolean),
    ),
  ];
  if (!scopes.length) throw new Error("Choose at least one OAuth scope.");
  const sessionId = randomUUID();
  await updateCliConfig(input.configDir, (config) => {
    if (config.profiles[input.name])
      throw new Error(
        "That profile already exists. Choose another name or log out first.",
      );
    config.profiles[input.name] = {
      type: "oauth",
      state: "authorizing",
      sessionId,
      issuer,
    };
  });

  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const timeout = setTimeout(cancel, 120_000);
  let callback: Awaited<ReturnType<typeof loopbackCallback>> | undefined;
  let activated: ActiveOAuthCliProfile | undefined;
  try {
    const endpoints = await discoverOAuth(issuer, scopes);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    callback = await loopbackCallback({ state, issuer, signal: abort.signal });
    const client = await oauthRequest(endpoints.registration, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Sendmux CLI",
        application_type: "native",
        redirect_uris: [callback.redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        resource: OAUTH_RESOURCE,
        scope: scopes.join(" "),
      }),
    });
    if (
      typeof client.client_id !== "string" ||
      !client.client_id ||
      client.token_endpoint_auth_method !== "none" ||
      client.resource !== OAUTH_RESOURCE ||
      !Array.isArray(client.redirect_uris) ||
      client.redirect_uris.length !== 1 ||
      client.redirect_uris[0] !== callback.redirectUri
    )
      throw new Error(
        "The issuer returned invalid client registration metadata.",
      );
    const url = new URL(endpoints.authorization);
    url.search = new URLSearchParams({
      client_id: client.client_id,
      response_type: "code",
      redirect_uri: callback.redirectUri,
      scope: scopes.join(" "),
      state,
      resource: OAUTH_RESOURCE,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    input.report(`Open this URL to sign in:\n${url.href}`);
    if (!input.noBrowser)
      await openBrowser(url.href).catch(() =>
        input.report(
          "Could not open the browser. Open the URL above to continue.",
        ),
      );
    const code = await callback.code;
    await callback.close();
    const fields = oauthTokenFields(
      await oauthRequest(
        endpoints.token,
        oauthForm({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: callback.redirectUri,
          client_id: client.client_id,
          resource: OAUTH_RESOURCE,
        }),
      ),
      scopes,
    );
    activated = {
      type: "oauth",
      state: "active",
      sessionId,
      issuer,
      clientId: client.client_id,
      tokenEndpoint: endpoints.token,
      revocationEndpoint: endpoints.revocation,
      ...fields,
    };
    const profile = activated;
    await updateCliConfig(input.configDir, (config) => {
      const existing = config.profiles[input.name];
      if (
        !existing ||
        !isOAuthProfile(existing) ||
        existing.sessionId !== sessionId ||
        existing.state !== "authorizing"
      )
        throw new Error("The login profile changed during authorization.");
      config.profiles[input.name] = profile;
      if (!config.defaultProfile) config.defaultProfile = input.name;
    });
    return { profile: input.name, type: "oauth", scopes: profile.scopes };
  } catch (error) {
    if (activated) {
      await oauthRequest(
        activated.revocationEndpoint,
        oauthForm({
          token: activated.refreshToken,
          token_type_hint: "refresh_token",
          client_id: activated.clientId,
        }),
      ).catch(() =>
        input.report(
          "Could not revoke the interrupted login. Revoke the connection in Sendmux settings.",
        ),
      );
    }
    await updateCliConfig(input.configDir, (config) => {
      const existing = config.profiles[input.name];
      if (
        existing &&
        isOAuthProfile(existing) &&
        existing.sessionId === sessionId &&
        existing.state === "authorizing"
      )
        delete config.profiles[input.name];
    });
    throw error;
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await callback?.close();
  }
}

async function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32.exe"
        : "xdg-open";
  await promisify(execFile)(
    command,
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
    { timeout: 5_000 },
  );
}

async function loopbackCallback({
  state,
  issuer,
  signal,
}: {
  state: string;
  issuer: string;
  signal: AbortSignal;
}) {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Attach before registration/browser work so cancellation cannot become an unhandled rejection.
  void code.catch(() => undefined);
  let redirectUri = "";
  let received = false;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    let url: URL;
    try {
      url = new URL(request.url ?? "/", redirectUri);
    } catch {
      response.writeHead(400);
      response.end("Invalid authorization response.");
      return;
    }
    const one = (key: string) => url.searchParams.getAll(key).length === 1;
    const valid =
      request.method === "GET" &&
      url.pathname === "/callback" &&
      request.headers.host === new URL(redirectUri).host &&
      one("state") &&
      url.searchParams.get("state") === state &&
      one("iss") &&
      url.searchParams.get("iss") === issuer &&
      ((one("code") &&
        !url.searchParams.has("error") &&
        !!url.searchParams.get("code")) ||
        (one("error") && !url.searchParams.has("code")));
    if (!valid || received) {
      response.writeHead(400);
      response.end("Invalid authorization response.");
      return;
    }
    received = true;
    response.end(
      "Authorization received. You can return to the terminal.",
      () => {
        if (url.searchParams.has("error"))
          rejectCode(new Error("OAuth authorization was declined."));
        else resolveCode(url.searchParams.get("code")!);
      },
    );
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  let host = "127.0.0.1";
  for (const candidate of ["127.0.0.1", "::1"]) {
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => {
          server.removeListener("listening", bound);
          reject(error);
        };
        const bound = () => {
          server.removeListener("error", failed);
          resolve();
        };
        server.once("error", failed);
        server.once("listening", bound);
        server.listen(0, candidate);
      });
      host = candidate;
      break;
    } catch {
      if (candidate === "::1")
        throw new Error("Could not bind the OAuth callback listener.");
    }
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not bind the OAuth callback listener.");
  redirectUri = `http://${host === "::1" ? "[::1]" : host}:${address.port}/callback`;
  const cancel = () =>
    rejectCode(new Error("OAuth login was cancelled or timed out."));
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  let closing: Promise<void> | undefined;
  return {
    redirectUri,
    code,
    close: () => {
      if (closing) return closing;
      signal.removeEventListener("abort", cancel);
      closing = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      return closing;
    },
  };
}
