import { Flags } from "@oclif/core";

import { SendmuxCommand } from "../../base-command.js";
import {
  inferApiKeyKind,
  maskApiKey,
} from "../../key-kind.js";
import { readCliConfig } from "../../profiles.js";

export default class ProfilesList extends SendmuxCommand {
  static description = "List local Sendmux CLI profiles.";
  static flags = {
    verbose: Flags.boolean({
      description: "Include masked API key prefixes.",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(ProfilesList);
    const config = await readCliConfig(this.config.configDir);
    const profiles = Object.entries(config.profiles).map(([name, profile]) => ({
      default: name === config.defaultProfile,
      key_kind: inferApiKeyKind(profile.apiKey),
      name,
      ...(profile.baseUrl ? { base_url: profile.baseUrl } : {}),
      ...(flags.verbose ? { api_key: maskApiKey(profile.apiKey) } : {}),
    }));

    return this.renderResult({
      ok: true,
      data: { profiles },
      meta: {},
    });
  }
}
