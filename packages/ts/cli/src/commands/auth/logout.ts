import { Args } from "@oclif/core";
import { SendmuxCommand } from "../../base-command.js";
import { logoutOAuth } from "../../oauth-profile.js";
import { readCliConfig } from "../../profiles.js";

export default class AuthLogout extends SendmuxCommand {
  static description =
    "Revoke an OAuth connection and remove its local profile.";
  static args = {
    name: Args.string({
      description: "OAuth profile name. Defaults to the configured profile.",
    }),
  };

  async run() {
    const { args } = await this.parse(AuthLogout);
    const name =
      args.name ??
      process.env.SENDMUX_PROFILE ??
      (await readCliConfig(this.config.configDir)).defaultProfile;
    if (!name) this.error("Choose an OAuth profile to log out.", { exit: 2 });
    const data = await logoutOAuth(this.config.configDir, name);
    return this.renderResult({ ok: true, data, meta: {} });
  }
}
