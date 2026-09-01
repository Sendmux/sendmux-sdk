import { Args } from "@oclif/core";

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

export default class ProfilesShow extends SendmuxCommand {
  static args = {
    name: Args.string({
      description: "Profile name. Defaults to the configured default profile.",
      required: false,
    }),
  };
  static description = "Show a local Sendmux CLI profile without revealing its key.";

  async run(): Promise<unknown> {
    const { args } = await this.parse(ProfilesShow);
    const config = await readCliConfig(this.config.configDir);
    const profileName = args.name ?? config.defaultProfile;
    if (!profileName) {
      this.error("No default Sendmux profile configured.", { exit: 2 });
    }

    const profile = config.profiles[profileName];
    if (!profile) {
      this.error(`Sendmux profile "${profileName}" was not found.`, { exit: 2 });
    }

    const data = isApiKeyProfile(profile)
      ? {
          api_key: maskApiKey(profile.apiKey),
          default: profileName === config.defaultProfile,
          key_kind: inferApiKeyKind(profile.apiKey),
          name: profileName,
          ...(profile.baseUrl ? { base_url: profile.baseUrl } : {}),
          type: "api_key",
        }
      : {
          default: profileName === config.defaultProfile,
          ...(isActiveAgentProfile(profile)
            ? {
                mailbox_email: profile.mailboxEmail,
                owner_invite_status: profile.ownerInvite?.status,
                registration_id: profile.registrationId,
              }
            : {}),
          name: profileName,
          status: profile.state,
          type: "agent",
        };

    return this.renderResult({ ok: true, data, meta: {} });
  }
}
