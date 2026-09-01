import { randomUUID } from "node:crypto";
import { isIP } from "node:net";

import {
  clearAgentRegistrationIntent,
  isActiveAgentProfile,
  readCliConfig,
  reserveAgentRegistrationIntent,
  type ActiveAgentCliProfile,
  type AgentCliProfile,
  type CliConfig,
  type RegisteringAgentCliProfile,
  updateCliConfig,
} from "./profiles.js";

const DEFAULT_APP_ORIGIN = "https://app.sendmux.ai";
const DEFAULT_SENDING_API_BASE_URL = "https://smtp.sendmux.ai/api/v1";
const SENDING_API_RESOURCE = "https://smtp.sendmux.ai/api/v1";
const TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const READINESS_TIMEOUT_MS = 10 * 60 * 1_000;
const SENDING_TOKEN_SKEW_MS = 60 * 1_000;

interface RegisterAgentInput {
  appOrigin?: string;
  clientName?: string;
  configDir: string;
  makeDefault: boolean;
  mailboxLocalPart?: string;
  ownerEmail?: string;
  profileName: string;
}

interface AgentRegistrationResponse {
  access_token: string;
  mailbox: {
    email: string;
    status: string;
  };
  registration_id: string;
}

export interface SafeAgentRegistrationResult {
  default: boolean;
  mailbox_email: string;
  name: string;
  owner_invite_status?: "pending";
  registration_id: string;
  status: "active";
}

export async function registerAgent(input: RegisterAgentInput): Promise<SafeAgentRegistrationResult> {
  const initialConfig = await readCliConfig(input.configDir);
  const existing = initialConfig.profiles[input.profileName];
  let activeProfile: ActiveAgentCliProfile;

  if (existing && isActiveAgentProfile(existing)) {
    activeProfile = await updateCliConfig(input.configDir, (config) => {
      const current = config.profiles[input.profileName];
      if (!current || !isActiveAgentProfile(current)) {
        throw new Error(`Sendmux agent profile "${input.profileName}" is not active.`);
      }
      assertMatchingRegistration(current, input);
      if (input.makeDefault || !config.defaultProfile) config.defaultProfile = input.profileName;
      return current;
    });
    await clearAgentRegistrationIntent(input.configDir, input.profileName);
  } else {
    const candidate = registrationIntent({ existing, input });
    const registering = await reserveAgentRegistrationIntent(input.configDir, input.profileName, candidate);
    assertMatchingRegistration(registering, input);

    const persisted = await updateCliConfig(input.configDir, (config) => {
      const current = config.profiles[input.profileName];
      if (current && isActiveAgentProfile(current)) {
        assertMatchingRegistration(current, input);
        if (input.makeDefault || !config.defaultProfile) config.defaultProfile = input.profileName;
        return { active: current };
      }
      if (current) {
        if (current.type !== "agent" || current.state !== "registering") {
          throw new Error(`Sendmux profile "${input.profileName}" already exists and is not an agent profile.`);
        }
        if (current.idempotencyKey !== registering.idempotencyKey) {
          throw new Error(`Sendmux agent profile "${input.profileName}" belongs to a different registration request.`);
        }
      }
      config.profiles[input.profileName] = registering;
      if (input.makeDefault || !config.defaultProfile) config.defaultProfile = input.profileName;
      return { active: null };
    });

    if (persisted.active) {
      activeProfile = persisted.active;
      await clearAgentRegistrationIntent(input.configDir, input.profileName);
    } else {
      const registration = await postJson<AgentRegistrationResponse>(`${registering.authBaseUrl}/agent/identity`, {
        headers: { "Idempotency-Key": registering.idempotencyKey },
        body: {
          type: "anonymous",
          ...(registering.mailboxLocalPart ? { mailbox_local_part: registering.mailboxLocalPart } : {}),
          ...(registering.clientName ? { client_name: registering.clientName } : {}),
          idempotency_key: registering.idempotencyKey,
        },
        expectedStatuses: [200, 201],
      });
      assertRegistrationResponse(registration);

      activeProfile = await updateCliConfig(input.configDir, (config) => {
        const current = config.profiles[input.profileName];
        if (current && isActiveAgentProfile(current)) {
          if (current.idempotencyKey !== registering.idempotencyKey) {
            throw new Error(`Sendmux agent profile "${input.profileName}" belongs to a different registration request.`);
          }
          return current;
        }
        if (
          !current ||
          current.type !== "agent" ||
          current.state !== "registering" ||
          current.idempotencyKey !== registering.idempotencyKey
        ) {
          throw new Error(`Sendmux agent profile "${input.profileName}" belongs to a different registration request.`);
        }
        const activated: ActiveAgentCliProfile = {
          ...current,
          accessToken: registration.access_token,
          mailboxEmail: registration.mailbox.email,
          registrationId: registration.registration_id,
          state: "active",
        };
        config.profiles[input.profileName] = activated;
        return activated;
      });
      await clearAgentRegistrationIntent(input.configDir, input.profileName);
    }
  }

  const reloaded = await activeAgentProfile(input.configDir, input.profileName);
  await waitForMailbox(reloaded);

  let ownerInviteStatus: "pending" | undefined;
  if (input.ownerEmail) {
    await inviteAgentOwner({ configDir: input.configDir, email: input.ownerEmail, profileName: input.profileName });
    ownerInviteStatus = "pending";
  }

  const finalConfig = await readCliConfig(input.configDir);
  return {
    default: finalConfig.defaultProfile === input.profileName,
    mailbox_email: activeProfile.mailboxEmail,
    name: input.profileName,
    ...(ownerInviteStatus ? { owner_invite_status: ownerInviteStatus } : {}),
    registration_id: activeProfile.registrationId,
    status: "active",
  };
}

export async function inviteAgentOwner({
  configDir,
  email,
  profileName,
}: {
  configDir: string;
  email: string;
  profileName: string;
}): Promise<{ email: string; status: "pending" }> {
  const invitation = await updateCliConfig(configDir, (config) => {
    const profile = activeAgentProfileFromConfig(config, profileName);
    const existingInvite = profile.ownerInvite;
    const idempotencyKey =
      existingInvite?.email.toLowerCase() === email.toLowerCase() ? existingInvite.idempotencyKey : randomUUID();
    const updatedProfile: ActiveAgentCliProfile = {
      ...profile,
      ownerInvite: { email, idempotencyKey, status: "dispatching" },
    };
    config.profiles[profileName] = updatedProfile;
    return { idempotencyKey, profile: updatedProfile };
  });

  await postJson(`${invitation.profile.authBaseUrl}/agent/identity/invite`, {
    headers: {
      Authorization: `Bearer ${invitation.profile.accessToken}`,
      "Idempotency-Key": invitation.idempotencyKey,
    },
    body: { email, idempotency_key: invitation.idempotencyKey, requested_role: "owner" },
    expectedStatuses: [200, 202],
  });

  await updateCliConfig(configDir, (config) => {
    const current = activeAgentProfileFromConfig(config, profileName);
    if (current.ownerInvite?.idempotencyKey === invitation.idempotencyKey) {
      config.profiles[profileName] = {
        ...current,
        ownerInvite: { email, idempotencyKey: invitation.idempotencyKey, status: "pending" as const },
      };
    }
  });
  return { email, status: "pending" };
}

export async function resolveAgentSendingToken({
  config,
  configDir,
  profile,
  profileName,
}: {
  config: CliConfig;
  configDir: string;
  profile: ActiveAgentCliProfile;
  profileName: string;
}): Promise<string> {
  if (profile.sendingToken && Date.parse(profile.sendingToken.expiresAt) > Date.now() + SENDING_TOKEN_SKEW_MS) {
    return profile.sendingToken.accessToken;
  }

  const response = await fetch(`${profile.authBaseUrl}/oauth2/token`, {
    body: new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      resource: SENDING_API_RESOURCE,
      scope: "email.send",
      subject_token: profile.accessToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body = await responseJson(response);
  if (!response.ok) {
    throw new Error(agentAuthFailureMessage(response.status, body));
  }
  const accessToken = requiredString(body, "access_token", "token exchange");
  const expiresIn = body.expires_in;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Sendmux token exchange returned an invalid expiry.");
  }

  const updatedProfile = await updateCliConfig(configDir, (latestConfig) => {
    const latestProfile = activeAgentProfileFromConfig(latestConfig, profileName);
    if (latestProfile.sendingToken && Date.parse(latestProfile.sendingToken.expiresAt) > Date.now() + SENDING_TOKEN_SKEW_MS) {
      return latestProfile;
    }
    const updated: ActiveAgentCliProfile = {
      ...latestProfile,
      sendingToken: {
        accessToken,
        expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      },
    };
    latestConfig.profiles[profileName] = updated;
    return updated;
  });
  config.profiles[profileName] = updatedProfile;
  return updatedProfile.sendingToken!.accessToken;
}

function registrationIntent({
  existing,
  input,
}: {
  existing: CliConfig["profiles"][string] | undefined;
  input: RegisterAgentInput;
}): RegisteringAgentCliProfile {
  const urls = agentUrls(input.appOrigin);
  if (existing?.type === "agent") {
    if (existing.state !== "registering") {
      throw new Error(`Sendmux agent profile "${input.profileName}" is already active.`);
    }
    assertMatchingRegistration(existing, input);
    return existing;
  }
  if (existing) {
    throw new Error(`Sendmux profile "${input.profileName}" already exists and is not an agent profile.`);
  }
  return {
    ...urls,
    ...(input.clientName ? { clientName: input.clientName } : {}),
    idempotencyKey: randomUUID(),
    ...(input.mailboxLocalPart ? { mailboxLocalPart: input.mailboxLocalPart } : {}),
    state: "registering",
    type: "agent",
  };
}

function assertMatchingRegistration(profile: AgentCliProfile, input: RegisterAgentInput): void {
  if (
    (input.appOrigin !== undefined && !registrationUrlsMatch(profile, agentUrls(input.appOrigin))) ||
    (input.clientName !== undefined && profile.clientName !== input.clientName) ||
    (input.mailboxLocalPart !== undefined && profile.mailboxLocalPart !== input.mailboxLocalPart)
  ) {
    throw new Error(`Sendmux agent profile "${input.profileName}" belongs to a different registration request.`);
  }
}

function registrationUrlsMatch(
  profile: AgentCliProfile,
  urls: Pick<RegisteringAgentCliProfile, "appApiBaseUrl" | "authBaseUrl" | "sendingApiBaseUrl">,
): boolean {
  return (
    profile.appApiBaseUrl === urls.appApiBaseUrl &&
    profile.authBaseUrl === urls.authBaseUrl &&
    profile.sendingApiBaseUrl === urls.sendingApiBaseUrl
  );
}

function agentUrls(appOriginInput: string | undefined): Pick<RegisteringAgentCliProfile, "appApiBaseUrl" | "authBaseUrl" | "sendingApiBaseUrl"> {
  const customOrigin = appOriginInput ? normaliseAppOrigin(appOriginInput) : null;
  const appOrigin = customOrigin ?? DEFAULT_APP_ORIGIN;
  return {
    appApiBaseUrl: `${appOrigin}/api/v1`,
    authBaseUrl: `${appOrigin}/agent-auth`,
    sendingApiBaseUrl: customOrigin ? `${customOrigin}/api/v1` : DEFAULT_SENDING_API_BASE_URL,
  };
}

export function normaliseAppOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("--base-url must be an HTTP(S) origin without credentials, query, or fragment.");
  }
  if (url.pathname !== "/") {
    throw new Error("--base-url must be an origin without a path.");
  }
  if (url.protocol === "http:" && !isLoopbackHttpOrigin(value)) {
    throw new Error("--base-url must use HTTPS unless it is a canonical loopback origin.");
  }
  return url.origin;
}

function isLoopbackHttpOrigin(value: string): boolean {
  const authority = value.match(/^http:\/\/([^/?#]+)/i)?.[1];
  if (!authority) return false;
  const rawHostname = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : authority.split(":", 1)[0];
  if (!rawHostname) return false;
  if (rawHostname.toLowerCase() === "localhost" || rawHostname === "::1") return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHostname) && isIP(rawHostname) === 4 && rawHostname.split(".")[0] === "127";
}

export async function waitForMailbox(
  profile: ActiveAgentCliProfile,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const remainingBeforeFetch = deadline - Date.now();
    if (remainingBeforeFetch <= 0) throw mailboxReadinessTimeoutError();

    let response: Response;
    try {
      response = await fetch(`${profile.appApiBaseUrl}/mailbox/me`, {
        headers: { Authorization: `Bearer ${profile.accessToken}` },
        signal: AbortSignal.timeout(remainingBeforeFetch),
      });
    } catch (error) {
      if (isAbortError(error) || Date.now() >= deadline) throw mailboxReadinessTimeoutError();
      throw error;
    }
    if (response.ok) return;
    const body = await responseJson(response);
    const provisioningUnavailable =
      response.status === 503 && (body.error === "service_unavailable" || body.error === "temporarily_unavailable");
    if (!provisioningUnavailable) {
      throw new Error(agentAuthFailureMessage(response.status, body));
    }
    const remainingBeforeRetry = deadline - Date.now();
    if (remainingBeforeRetry <= 0) throw mailboxReadinessTimeoutError();
    const retryDelayMs = Math.min(Math.max(retryAfterSeconds(response, body) * 1_000, 1_000), remainingBeforeRetry);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function mailboxReadinessTimeoutError(): Error {
  return new Error("Agent mailbox provisioning did not finish within the allowed time.");
}

async function activeAgentProfile(configDir: string, profileName: string): Promise<ActiveAgentCliProfile> {
  return activeAgentProfileFromConfig(await readCliConfig(configDir), profileName);
}

function activeAgentProfileFromConfig(config: CliConfig, profileName: string): ActiveAgentCliProfile {
  const profile = config.profiles[profileName];
  if (!profile || !isActiveAgentProfile(profile)) {
    throw new Error(`Sendmux agent profile "${profileName}" is not active.`);
  }
  return profile;
}

async function postJson<T = Record<string, unknown>>(
  url: string,
  options: {
    body: Record<string, unknown>;
    expectedStatuses: number[];
    headers?: Record<string, string>;
  },
): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(options.body),
    headers: { "Content-Type": "application/json", ...options.headers },
    method: "POST",
  });
  const body = await responseJson(response);
  if (!options.expectedStatuses.includes(response.status)) {
    throw new Error(agentAuthFailureMessage(response.status, body));
  }
  return body as T;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Sendmux agent authentication returned HTTP ${response.status} without a JSON object.`);
  }
  return body as Record<string, unknown>;
}

function retryAfterSeconds(response: Response, body: Record<string, unknown>): number {
  const value = Number(response.headers.get("Retry-After") ?? body.retry_after ?? 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function agentAuthFailureMessage(status: number, body: Record<string, unknown>): string {
  if (status === 503 && body.error === "authorization_pending") {
    return "Agent sending is awaiting owner acceptance or approval.";
  }
  if (status === 503 && (body.error === "service_unavailable" || body.error === "temporarily_unavailable")) {
    return "Agent mailbox provisioning did not finish within the allowed time.";
  }
  const description = typeof body.error_description === "string" ? body.error_description : null;
  return description ?? `Sendmux agent authentication failed with HTTP ${status}.`;
}

function assertRegistrationResponse(value: AgentRegistrationResponse): void {
  requiredString(value as unknown as Record<string, unknown>, "access_token", "agent registration");
  requiredString(value as unknown as Record<string, unknown>, "registration_id", "agent registration");
  if (!value.mailbox || typeof value.mailbox !== "object" || typeof value.mailbox.email !== "string") {
    throw new Error("Sendmux agent registration did not return a mailbox email.");
  }
}

function requiredString(record: Record<string, unknown>, field: string, source: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Sendmux ${source} did not return ${field}.`);
  }
  return value;
}
