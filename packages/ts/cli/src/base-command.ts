import { Command, Flags } from "@oclif/core";

import {
  inferApiKeyKind,
  type ApiKeyKind,
} from "./key-kind.js";
import { readCliConfig } from "./profiles.js";

export interface AuthFlags {
  "api-key"?: string;
  "base-url"?: string;
  profile?: string;
}

export interface ResolvedAuth {
  apiKey: string;
  apiKeyKind: ApiKeyKind;
  baseUrl?: string;
  source: string;
}

export const authFlags = {
  "api-key": Flags.string({
    description: "Sendmux API key. Defaults to SENDMUX_API_KEY.",
    helpGroup: "GLOBAL",
  }),
  "base-url": Flags.string({
    description: "Override the API base URL. Defaults to the SDK surface default or SENDMUX_BASE_URL.",
    helpGroup: "GLOBAL",
  }),
  profile: Flags.string({
    char: "p",
    description: "Profile name from the local Sendmux CLI config. Defaults to SENDMUX_PROFILE or the configured default profile.",
    helpGroup: "GLOBAL",
  }),
};

export abstract class SendmuxCommand extends Command {
  static enableJsonFlag = true;

  async resolveAuth(flags: AuthFlags, expectedKind: ApiKeyKind): Promise<ResolvedAuth> {
    const envApiKey = process.env.SENDMUX_API_KEY;
    const envBaseUrl = process.env.SENDMUX_BASE_URL;

    if (flags["api-key"] || envApiKey) {
      const apiKey = flags["api-key"] ?? envApiKey;
      if (!apiKey) {
        throw new Error("Missing Sendmux API key");
      }

      const baseUrl = flags["base-url"] ?? envBaseUrl;
      const input: KeyKindInput = {
        apiKey,
        expectedKind,
        source: flags["api-key"] ? "--api-key" : "SENDMUX_API_KEY",
      };
      if (baseUrl) {
        input.baseUrl = baseUrl;
      }

      return this.assertKeyKind(input);
    }

    const config = await readCliConfig(this.config.configDir);
    const profileName = flags.profile ?? process.env.SENDMUX_PROFILE ?? config.defaultProfile;
    if (!profileName) {
      this.error("No Sendmux profile configured. Run `sendmux profiles:set <name> --api-key <key> --default` or pass --api-key.", {
        exit: 2,
      });
    }

    const profile = config.profiles[profileName];
    if (!profile) {
      this.error(`Sendmux profile "${profileName}" was not found. Run \`sendmux profiles:list\` to see configured profiles.`, {
        exit: 2,
      });
    }

    const baseUrl = flags["base-url"] ?? envBaseUrl ?? profile.baseUrl;
    const input: KeyKindInput = {
      apiKey: profile.apiKey,
      expectedKind,
      source: `profile "${profileName}"`,
    };
    if (baseUrl) {
      input.baseUrl = baseUrl;
    }

    return this.assertKeyKind(input);
  }

  renderResult(value: unknown): unknown {
    if (this.jsonEnabled()) {
      return value;
    }

    this.log(JSON.stringify(value, null, 2));
    return value;
  }

  private assertKeyKind({
    apiKey,
    baseUrl,
    expectedKind,
    source,
  }: KeyKindInput): ResolvedAuth {
    let apiKeyKind: ApiKeyKind;
    try {
      apiKeyKind = inferApiKeyKind(apiKey);
    } catch (error) {
      this.error(error instanceof Error ? error.message : "Invalid Sendmux API key", { exit: 2 });
    }

    if (apiKeyKind !== expectedKind) {
      const expectedLabel = expectedKind === "root" ? "root" : "mailbox";
      const actualLabel = apiKeyKind === "root" ? "root" : "mailbox";
      this.error(`Command requires a ${expectedLabel} API key, but ${source} contains a ${actualLabel} API key.`, {
        exit: 2,
      });
    }

    return {
      apiKey,
      apiKeyKind,
      source,
      ...(baseUrl ? { baseUrl } : {}),
    };
  }
}

interface KeyKindInput {
  apiKey: string;
  baseUrl?: string;
  expectedKind: ApiKeyKind;
  source: string;
}
