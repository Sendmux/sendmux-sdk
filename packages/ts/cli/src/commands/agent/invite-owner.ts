import { Args, Flags } from "@oclif/core";

import { inviteAgentOwner } from "../../agent-auth.js";
import { SendmuxCommand } from "../../base-command.js";

export default class AgentInviteOwner extends SendmuxCommand {
  static args = {
    email: Args.string({
      description: "Owner email address.",
      required: true,
    }),
  };
  static description = "Invite an owner to approve sending for an agent inbox.";
  static flags = {
    profile: Flags.string({
      char: "p",
      description: "Registered agent profile name.",
      required: true,
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(AgentInviteOwner);
    const result = await inviteAgentOwner({
      configDir: this.config.configDir,
      email: args.email,
      profileName: flags.profile,
    });

    return this.renderResult({
      ok: true,
      data: {
        email: result.email,
        profile: flags.profile,
        status: result.status,
      },
      meta: {},
    });
  }
}
