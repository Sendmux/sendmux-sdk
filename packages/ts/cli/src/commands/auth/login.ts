import { Args, Flags } from "@oclif/core";
import { SendmuxCommand } from "../../base-command.js";
import { DEFAULT_OAUTH_ISSUER } from "../../oauth-http.js";
import { loginOAuth } from "../../oauth-login.js";

export default class AuthLogin extends SendmuxCommand {
  static description = "Sign in through the browser and save an OAuth profile.";
  static args = {
    name: Args.string({ required: true, description: "New profile name." }),
  };
  static flags = {
    issuer: Flags.string({
      default: DEFAULT_OAUTH_ISSUER,
      description: "Sendmux authorization-server issuer.",
    }),
    scope: Flags.string({
      multiple: true,
      required: true,
      description: "Permission to request. Repeat for multiple scopes.",
    }),
    "no-browser": Flags.boolean({
      description: "Print the authorization URL without opening a browser.",
    }),
  };

  async run() {
    const { args, flags } = await this.parse(AuthLogin);
    const data = await loginOAuth({
      configDir: this.config.configDir,
      name: args.name,
      issuer: flags.issuer,
      scopes: flags.scope,
      noBrowser: flags["no-browser"] ?? false,
      report: (message) => process.stderr.write(`${message}\n`),
    });
    return this.renderResult({ ok: true, data, meta: {} });
  }
}
