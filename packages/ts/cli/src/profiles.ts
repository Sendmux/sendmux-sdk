import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export interface CliProfile {
  apiKey: string;
  baseUrl?: string;
}

export interface CliConfig {
  defaultProfile?: string;
  profiles: Record<string, CliProfile>;
}

const CONFIG_FILE = "config.json";

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
  const path = configPath(configDir);
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, path);
  await chmod(path, 0o600);
}

export function configPath(configDir: string): string {
  return join(configDir, CONFIG_FILE);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
