import { Flags } from "@oclif/core";

import { SendmuxCommand } from "../../base-command.js";
import {
  inferApiKeyKind,
  maskApiKey,
} from "../../key-kind.js";
import {
  isActiveAgentProfile,
  isApiKeyProfile,
  readCliConfig,
} from "../../profiles.js";

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
    const profiles = Object.entries(config.profiles).map(([name, profile]) => {
      if (isApiKeyProfile(profile)) {
        return {
          default: name === config.defaultProfile,
          key_kind: inferApiKeyKind(profile.apiKey),
          name,
          ...(profile.baseUrl ? { base_url: profile.baseUrl } : {}),
          ...(flags.verbose ? { api_key: maskApiKey(profile.apiKey) } : {}),
          type: "api_key",
        };
      }

      return {
        default: name === config.defaultProfile,
        ...(isActiveAgentProfile(profile)
          ? {
              mailbox_email: profile.mailboxEmail,
              owner_invite_status: profile.ownerInvite?.status,
              registration_id: profile.registrationId,
            }
          : {}),
        name,
        status: profile.state,
        type: "agent",
      };
    });

    return this.renderResult({
      ok: true,
      data: { profiles },
      meta: {},
    });
  }
}
