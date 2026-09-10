import {
  oauthForm,
  oauthRequest,
  oauthTokenFields,
  oauthUrl,
  OAUTH_RESOURCE,
} from "./oauth-http.js";
import {
  isOAuthProfile,
  readCliConfig,
  updateCliConfig,
  type ActiveOAuthCliProfile,
  type CliProfile,
} from "./profiles.js";

function activeProfile(profile: CliProfile | undefined): ActiveOAuthCliProfile {
  if (!profile || !isOAuthProfile(profile) || profile.state === "authorizing") {
    throw new Error("The OAuth profile is not ready. Complete login first.");
  }
  return profile;
}

export async function resolveOAuthToken(
  configDir: string,
  name: string,
): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (true) {
    const profile = activeProfile(
      (await readCliConfig(configDir)).profiles[name],
    );
    if (profile.state === "revoking" || profile.state === "reauthorize") {
      throw new Error(
        "This OAuth profile needs a new login. Run auth:logout, then auth:login.",
      );
    }
    if (profile.state === "active" && profile.expiresAt > Date.now() + 30_000)
      return profile.accessToken;
    if (profile.state === "refreshing") {
      if (
        Date.now() >= deadline ||
        Date.now() - (profile.refreshStartedAt ?? 0) >= 20_000
      ) {
        throw new Error(
          "OAuth refresh did not finish. Log out and sign in again; the old refresh token will not be replayed.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    const reserved = await updateCliConfig(configDir, (config) => {
      const current = activeProfile(config.profiles[name]);
      if (
        current.state !== "active" ||
        current.sessionId !== profile.sessionId ||
        current.expiresAt > Date.now() + 30_000
      )
        return null;
      const next: ActiveOAuthCliProfile = {
        ...current,
        state: "refreshing",
        refreshStartedAt: Date.now(),
      };
      config.profiles[name] = next;
      return next;
    });
    if (!reserved) continue;
    return refreshReservedProfile(configDir, name, reserved);
  }
}

async function refreshReservedProfile(
  configDir: string,
  name: string,
  profile: ActiveOAuthCliProfile,
) {
  try {
    const endpoint = oauthUrl(profile.tokenEndpoint, profile.issuer).href;
    const fields = oauthTokenFields(
      await oauthRequest(
        endpoint,
        oauthForm({
          grant_type: "refresh_token",
          refresh_token: profile.refreshToken,
          client_id: profile.clientId,
          resource: OAUTH_RESOURCE,
        }),
      ),
      profile.scopes,
    );
    await updateCliConfig(configDir, (config) => {
      const current = activeProfile(config.profiles[name]);
      if (
        current.sessionId !== profile.sessionId ||
        current.state !== "refreshing" ||
        current.refreshStartedAt !== profile.refreshStartedAt
      ) {
        throw new Error("The OAuth profile changed during refresh.");
      }
      const next: ActiveOAuthCliProfile = {
        ...profile,
        ...fields,
        state: "active",
      };
      delete next.refreshStartedAt;
      config.profiles[name] = next;
    });
    return fields.accessToken;
  } catch {
    await updateCliConfig(configDir, (config) => {
      const current = config.profiles[name];
      if (
        current &&
        isOAuthProfile(current) &&
        current.state === "refreshing" &&
        current.sessionId === profile.sessionId &&
        current.refreshStartedAt === profile.refreshStartedAt
      ) {
        current.state = "reauthorize";
      }
    });
    throw new Error(
      "OAuth refresh failed. Log out and sign in again; the old refresh token will not be replayed.",
    );
  }
}

export async function logoutOAuth(configDir: string, name: string) {
  const profile = await updateCliConfig(configDir, (config) => {
    const stored = config.profiles[name];
    if (stored && isOAuthProfile(stored) && stored.state === "authorizing") {
      delete config.profiles[name];
      if (config.defaultProfile === name) delete config.defaultProfile;
      return null;
    }
    const current = activeProfile(stored);
    if (
      current.state === "refreshing" &&
      Date.now() - (current.refreshStartedAt ?? 0) < 20_000
    ) {
      throw new Error(
        "OAuth refresh is in progress. Retry logout when it finishes.",
      );
    }
    const next: ActiveOAuthCliProfile = { ...current, state: "revoking" };
    config.profiles[name] = next;
    return next;
  });
  if (!profile) return { profile: name, revoked: false };
  const endpoint = oauthUrl(profile.revocationEndpoint, profile.issuer).href;
  await oauthRequest(
    endpoint,
    oauthForm({
      token: profile.refreshToken,
      token_type_hint: "refresh_token",
      client_id: profile.clientId,
    }),
  );
  await updateCliConfig(configDir, (config) => {
    const current = config.profiles[name];
    if (
      current &&
      isOAuthProfile(current) &&
      current.sessionId === profile.sessionId &&
      current.state === "revoking"
    ) {
      delete config.profiles[name];
      if (config.defaultProfile === name) delete config.defaultProfile;
    }
  });
  return { profile: name, revoked: true };
}
