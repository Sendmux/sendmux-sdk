import * as sdk from "@sendmux/sdk";

import type { SendmuxCommand } from "./base-command.js";
import {
  parseOperationOptions,
  type OperationFlags,
} from "./operation-flags.js";
import type { OperationDefinition } from "./operation-types.js";

type SdkOperation = (options: Record<string, unknown>) => Promise<unknown>;
type ClientFactory = (config: {
  apiKey: string;
  baseUrl?: string;
}) => unknown;

const surfaceModules = {
  mailbox: sdk.mailbox,
  management: sdk.management,
  sending: sdk.sending,
} as const;

const clientFactories = {
  mailbox: sdk.mailbox.createMailboxClient,
  management: sdk.management.createManagementClient,
  sending: sdk.sending.createSendingClient,
} satisfies Record<OperationDefinition["surface"], ClientFactory>;

export async function runSdkOperation(
  command: SendmuxCommand,
  operation: OperationDefinition,
  flags: OperationFlags,
): Promise<unknown> {
  const auth = await command.resolveAuth(flags, operation.requiredKeyKind);
  const clientConfig = {
    apiKey: auth.apiKey,
    ...(auth.baseUrl ? { baseUrl: auth.baseUrl } : {}),
  };
  const client = clientFactories[operation.surface](clientConfig);
  const operationOptions = await parseOperationOptions(command, operation, flags);
  const sdkOperation = operationFor(operation);
  const response = await sdkOperation({
    client,
    ...operationOptions,
  });

  return command.renderResult(rawEnvelope(response));
}

function operationFor(operation: OperationDefinition): SdkOperation {
  const module = surfaceModules[operation.surface] as Record<string, unknown>;
  const sdkOperation = module[operation.operationId];
  if (typeof sdkOperation !== "function") {
    throw new Error(`SDK operation ${operation.operationId} is not exported by @sendmux/sdk`);
  }

  return sdkOperation as SdkOperation;
}

function rawEnvelope(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("data" in value)) {
    return value;
  }

  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("ok" in data)) {
    return value;
  }

  return data;
}
