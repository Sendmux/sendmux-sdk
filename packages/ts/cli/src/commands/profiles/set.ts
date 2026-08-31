import { Args, Flags } from "@oclif/core";

import { SendmuxCommand } from "../../base-command.js";
import { inferApiKeyKind } from "../../key-kind.js";
import {
  readCliConfig,
  writeCliConfig,
} from "../../profiles.js";

export default class ProfilesSet extends SendmuxCommand {
  static args = {
    name: Args.string({
      description: "Profile name.",
      required: true,
    }),
  };
  static description = "Create or update a local Sendmux CLI profile.";
  static flags = {
    "api-key": Flags.string({
      description: "Sendmux API key. Defaults to SENDMUX_API_KEY.",
      required: false,
    }),
    "base-url": Flags.string({
      description: "Optional API base URL override for this profile.",
    }),
    default: Flags.boolean({
      description: "Make this the default profile.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(ProfilesSet);
    const apiKey = flags["api-key"] ?? process.env.SENDMUX_API_KEY;
    if (!apiKey) {
      this.error("Pass --api-key or set SENDMUX_API_KEY.", { exit: 2 });
    }

    const keyKind = inferApiKeyKind(apiKey);
    const config = await readCliConfig(this.config.configDir);
    config.profiles[args.name] = {
      apiKey,
      ...(flags["base-url"] ? { baseUrl: flags["base-url"] } : {}),
      type: "api_key",
    };

    if (flags.default || !config.defaultProfile) {
      config.defaultProfile = args.name;
    }

    await writeCliConfig(this.config.configDir, config);

    const result = {
      ok: true,
      data: {
        default: config.defaultProfile === args.name,
        key_kind: keyKind,
        name: args.name,
        ...(flags["base-url"] ? { base_url: flags["base-url"] } : {}),
      },
      meta: {},
    };

    if (!this.jsonEnabled()) {
      this.log(`Saved Sendmux ${keyKind} profile "${args.name}".`);
      return result;
    }

    return result;
  }
}
