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
export type CliProfile = AgentCliProfile | ApiKeyCliProfile;

export interface CliConfig {
  defaultProfile?: string;
  profiles: Record<string, CliProfile>;
}

const CONFIG_FILE = "config.json";
const CONFIG_LOCK_RETRY_MS = 25;
const CONFIG_LOCK_STALE_MS = 5_000;
const CONFIG_LOCK_TIMEOUT_MS = 10_000;

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

export async function writeCliConfig(configDir: string, config: CliConfig): Promise<void> {
  await mkdir(configDir, { mode: 0o700, recursive: true });
  const releaseLock = await acquireConfigWriteLock(configDir);
  try {
    const path = configPath(configDir);
    const tempPath = `${path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, path);
    await chmod(path, 0o600);
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

  while (true) {
    try {
      await writeFile(path, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      await chmod(path, 0o600);
      return candidate;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    }

    try {
      const existing = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (!isRegisteringAgentProfile(existing)) {
        throw new Error(`Sendmux agent profile "${profileName}" has an invalid registration intent.`);
      }
      return existing;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue;
      throw error;
    }
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

async function acquireConfigWriteLock(configDir: string): Promise<() => Promise<void>> {
  const lockPath = `${configPath(configDir)}.lock`;
  const deadline = Date.now() + CONFIG_LOCK_TIMEOUT_MS;

  while (true) {
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
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
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

    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for another Sendmux process to finish updating the profile config.");
    }
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
  return !isAgentProfile(profile);
}

export function isActiveAgentProfile(profile: CliProfile): profile is ActiveAgentCliProfile {
  return isAgentProfile(profile) && profile.state === "active";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
