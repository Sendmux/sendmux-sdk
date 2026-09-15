import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

export interface ApiKeyCliProfile {
  apiKey: string;
  baseUrl?: string;
  type?: "api_key";
}

interface AgentProfileBase {
  appApiBaseUrl: string;
  authBaseUrl: string;
  clientName?: string;
  idempotencyKey: string;
  mailboxLocalPart?: string;
  sendingApiBaseUrl: string;
  type: "agent";
}

export interface RegisteringAgentCliProfile extends AgentProfileBase {
  state: "registering";
}

export interface ActiveAgentCliProfile extends AgentProfileBase {
  accessToken: string;
  mailboxEmail: string;
  ownerInvite?: {
    email: string;
    idempotencyKey: string;
    status: "dispatching" | "pending";
  };
  registrationId: string;
  sendingToken?: {
    accessToken: string;
    expiresAt: string;
  };
  state: "active";
}

export type AgentCliProfile = ActiveAgentCliProfile | RegisteringAgentCliProfile;
export interface AuthorizingOAuthCliProfile {
  type: "oauth";
  state: "authorizing";
  sessionId: string;
  issuer: string;
}

export interface ActiveOAuthCliProfile {
  type: "oauth";
  state: "active" | "refreshing" | "revoking" | "reauthorize";
  sessionId: string;
  issuer: string;
  clientId: string;
  tokenEndpoint: string;
  revocationEndpoint: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  refreshStartedAt?: number;
}

export type OAuthCliProfile = AuthorizingOAuthCliProfile | ActiveOAuthCliProfile;
export type CliProfile = AgentCliProfile | ApiKeyCliProfile | OAuthCliProfile;

export interface CliConfig {
  defaultProfile?: string;
  profiles: Record<string, CliProfile>;
}

const CONFIG_FILE = "config.json";
const CONFIG_LOCK_RETRY_MS = 25;
const CONFIG_LOCK_STALE_MS = 5_000;
const CONFIG_LOCK_TIMEOUT_MS = 10_000;
const CONFIG_REPLACE_TIMEOUT_MS = CONFIG_LOCK_STALE_MS / 2;
const CONFIG_REPLACE_MAX_WAITS = CONFIG_REPLACE_TIMEOUT_MS / CONFIG_LOCK_RETRY_MS;

export async function readCliConfig(configDir: string): Promise<CliConfig> {
  const path = configPath(configDir);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return {
      profiles: parsed.profiles ?? {},
      ...(parsed.defaultProfile ? { defaultProfile: parsed.defaultProfile } : {}),
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { profiles: {} };
    }

    throw error;
  }
}

export async function updateCliConfig<T>(
  configDir: string,
  update: (config: CliConfig) => T,
): Promise<T> {
  await mkdir(configDir, { mode: 0o700, recursive: true });
  const releaseLock = await acquireConfigWriteLock(configDir);
  const replaceDeadline = Date.now() + CONFIG_REPLACE_TIMEOUT_MS;
  try {
    const config = await readCliConfig(configDir);
    const result = update(config);
    await writeCliConfigFile(configDir, config, replaceDeadline);
    return result;
  } finally {
    await releaseLock();
  }
}

export async function reserveAgentRegistrationIntent(
  configDir: string,
  profileName: string,
  candidate: RegisteringAgentCliProfile,
): Promise<RegisteringAgentCliProfile> {
  await mkdir(configDir, { mode: 0o700, recursive: true });
  const path = registrationIntentPath(configDir, profileName);
  const releaseLock = await acquireFileLock(
    `${path}.lock`,
    "Timed out waiting for another Sendmux process to reserve the agent registration.",
  );

  try {
    while (true) {
      try {
        const existing = JSON.parse(await readFile(path, "utf8")) as unknown;
        if (isRegisteringAgentProfile(existing)) {
          return existing;
        }
        await unlink(path);
      } catch (error) {
        if (error instanceof SyntaxError) {
          await unlink(path).catch((unlinkError: unknown) => {
            if (!isNodeError(unlinkError) || unlinkError.code !== "ENOENT") throw unlinkError;
          });
        } else if (!isNodeError(error) || error.code !== "ENOENT") {
          throw error;
        }
      }

      try {
        await writeFile(path, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        await chmod(path, 0o600);
        return candidate;
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      }
    }
  } finally {
    await releaseLock();
  }
}

export async function clearAgentRegistrationIntent(configDir: string, profileName: string): Promise<void> {
  try {
    await unlink(registrationIntentPath(configDir, profileName));
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
}

export function configPath(configDir: string): string {
  return join(configDir, CONFIG_FILE);
}

async function writeCliConfigFile(
  configDir: string,
  config: CliConfig,
  replaceDeadline: number,
): Promise<void> {
  const path = configPath(configDir);
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  let waits = 0;
  while (true) {
    try {
      await rename(tempPath, path);
      break;
    } catch (error) {
      if (!isRetryableWindowsProfileFsError(error)) throw error;
      if (
        waits >= CONFIG_REPLACE_MAX_WAITS ||
        Date.now() + CONFIG_LOCK_RETRY_MS > replaceDeadline
      ) {
        throw error;
      }
      waits += 1;
      await new Promise((resolve) => setTimeout(resolve, CONFIG_LOCK_RETRY_MS));
      if (Date.now() >= replaceDeadline) throw error;
    }
  }
  await chmod(path, 0o600);
}

async function acquireConfigWriteLock(configDir: string): Promise<() => Promise<void>> {
  return acquireFileLock(
    `${configPath(configDir)}.lock`,
    "Timed out waiting for another Sendmux process to finish updating the profile config.",
  );
}

async function acquireFileLock(lockPath: string, timeoutMessage: string): Promise<() => Promise<void>> {
  const deadline = Date.now() + CONFIG_LOCK_TIMEOUT_MS;
  let lastOpenError: NodeJS.ErrnoException | undefined;

  while (true) {
    if (Date.now() >= deadline) {
      if (lastOpenError && isRetryableWindowsProfileFsError(lastOpenError)) {
        throw lastOpenError;
      }
      throw new Error(timeoutMessage);
    }

    try {
      const handle = await open(lockPath, "wx", 0o600);
      return async () => {
        try {
          await handle.close();
        } finally {
          try {
            await unlink(lockPath);
          } catch (error) {
            if (!isNodeError(error) || error.code !== "ENOENT") throw error;
          }
        }
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        lastOpenError = error;
      } else if (isRetryableWindowsProfileFsError(error)) {
        lastOpenError = error;
        if (Date.now() + CONFIG_LOCK_RETRY_MS > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, CONFIG_LOCK_RETRY_MS));
        continue;
      } else {
        throw error;
      }
    }

    try {
      const lock = await stat(lockPath);
      if (Date.now() - lock.mtimeMs >= CONFIG_LOCK_STALE_MS) {
        try {
          await unlink(lockPath);
          continue;
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") continue;
          if (!isNodeError(error) || (error.code !== "EACCES" && error.code !== "EPERM")) throw error;
        }
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue;
      throw error;
    }

    if (Date.now() + CONFIG_LOCK_RETRY_MS > deadline) throw new Error(timeoutMessage);
    await new Promise((resolve) => setTimeout(resolve, CONFIG_LOCK_RETRY_MS));
  }
}

function registrationIntentPath(configDir: string, profileName: string): string {
  const profileHash = createHash("sha256").update(profileName, "utf8").digest("hex");
  return join(configDir, `agent-registration-${profileHash}.json`);
}

function isRegisteringAgentProfile(value: unknown): value is RegisteringAgentCliProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<RegisteringAgentCliProfile>;
  return (
    profile.type === "agent" &&
    profile.state === "registering" &&
    typeof profile.appApiBaseUrl === "string" &&
    typeof profile.authBaseUrl === "string" &&
    typeof profile.idempotencyKey === "string" &&
    typeof profile.sendingApiBaseUrl === "string" &&
    (profile.clientName === undefined || typeof profile.clientName === "string") &&
    (profile.mailboxLocalPart === undefined || typeof profile.mailboxLocalPart === "string")
  );
}

export function isAgentProfile(profile: CliProfile): profile is AgentCliProfile {
  return profile.type === "agent";
}

export function isApiKeyProfile(profile: CliProfile): profile is ApiKeyCliProfile {
  return profile.type === undefined || profile.type === "api_key";
}

export function isOAuthProfile(profile: CliProfile): profile is OAuthCliProfile {
  return profile.type === "oauth";
}

export function isActiveAgentProfile(profile: CliProfile): profile is ActiveAgentCliProfile {
  return isAgentProfile(profile) && profile.state === "active";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}

function isRetryableWindowsProfileFsError(error: unknown): error is NodeJS.ErrnoException {
  return (
    process.platform === "win32" &&
    isNodeError(error) &&
    (error.code === "EPERM" || error.code === "EACCES" || error.code === "EBUSY")
  );
}
