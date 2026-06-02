import { operationFlags, type OperationFlags } from "./operation-flags.js";
import { runSdkOperation } from "./operation-runner.js";
import type { OperationDefinition } from "./operation-types.js";
import { SendmuxCommand } from "./base-command.js";

type OperationCommandConstructor = typeof OperationCommand & {
  operation: OperationDefinition;
};

export abstract class OperationCommand extends SendmuxCommand {
  static flags = operationFlags;

  async run(): Promise<unknown> {
    const constructor = this.constructor as OperationCommandConstructor;
    const { flags } = await this.parse(constructor);
    return runSdkOperation(this, constructor.operation, flags as OperationFlags);
  }
}
