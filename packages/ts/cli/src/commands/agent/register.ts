import { Args, Flags } from "@oclif/core";

import { registerAgent } from "../../agent-auth.js";
import { SendmuxCommand } from "../../base-command.js";

export default class AgentRegister extends SendmuxCommand {
  static args = {
    profile: Args.string({
      description: "Local profile name for the agent inbox.",
      required: true,
    }),
  };
  static description = "Register a durable agent inbox profile.";
  static flags = {
    "base-url": Flags.string({
      description: "Sendmux app origin. Defaults to https://app.sendmux.ai.",
    }),
    "client-name": Flags.string({
      description: "Optional agent client name.",
    }),
    default: Flags.boolean({
      description: "Make this the default profile.",
    }),
    "mailbox-local-part": Flags.string({
      description: "Optional requested mailbox local part.",
    }),
    "owner-email": Flags.string({
      description: "Invite this owner after the inbox becomes ready.",
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(AgentRegister);
    const result = await registerAgent({
      ...(flags["base-url"] ? { appOrigin: flags["base-url"] } : {}),
      ...(flags["client-name"] ? { clientName: flags["client-name"] } : {}),
      configDir: this.config.configDir,
      makeDefault: flags.default,
      ...(flags["mailbox-local-part"] ? { mailboxLocalPart: flags["mailbox-local-part"] } : {}),
      ...(flags["owner-email"] ? { ownerEmail: flags["owner-email"] } : {}),
      profileName: args.profile,
    });

    return this.renderResult({ ok: true, data: result, meta: {} });
  }
}
