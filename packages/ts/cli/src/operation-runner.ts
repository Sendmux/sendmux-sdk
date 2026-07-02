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

  if (operation.operationId === "mailboxStreamEvents") {
    const controller = new AbortController();
    const response = await sdkOperation({
      client,
      ...operationOptions,
      signal: controller.signal,
    });
    if (flags.follow) {
      return streamEvents(command, response, controller);
    }
    return command.renderResult(await firstStreamEvent(response, controller));
  }

  if (operation.operationId === "mailboxGetMessageAttachment") {
    const response = await sdkOperation({
      client,
      ...operationOptions,
      parseAs: "arrayBuffer",
    });
    const data = rawResponseData(response);
    if (typeof data === "string" || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return command.renderBinaryResult(data);
    }
    throw new Error("SDK operation mailboxGetMessageAttachment did not return binary content");
  }

  const response = await sdkOperation({
    client,
    ...operationOptions,
  });

  const data = rawResponseData(response);
  if (operation.responseKind === "text" && typeof data === "string") {
    return command.renderTextResult(data);
  }

  return command.renderResult(data);
}

async function firstStreamEvent(value: unknown, controller: AbortController): Promise<unknown> {
  const stream = (value as { stream?: AsyncIterable<unknown> } | null)?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("SDK operation mailboxStreamEvents did not return an async stream");
  }

  const iterator = stream[Symbol.asyncIterator]();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for mailbox stream event")), 20_000);
  });

  try {
    const next = await Promise.race([iterator.next(), timeout]);
    if (next.done) {
      throw new Error("Mailbox stream ended before yielding an event");
    }
    return next.value;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    controller.abort();
    await closeAsyncIterator(iterator);
  }
}

async function streamEvents(command: SendmuxCommand, value: unknown, controller: AbortController): Promise<void> {
  const stream = (value as { stream?: AsyncIterable<unknown> } | null)?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("SDK operation mailboxStreamEvents did not return an async stream");
  }

  const iterator = stream[Symbol.asyncIterator]();
  const abort = () => {
    controller.abort();
  };
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) {
        return;
      }
      command.log(JSON.stringify(next.value));
    }
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    controller.abort();
    await closeAsyncIterator(iterator);
  }
}

async function closeAsyncIterator(iterator: AsyncIterator<unknown>): Promise<void> {
  if (typeof iterator.return !== "function") {
    return;
  }
  await Promise.race([iterator.return(), sleep(1_000)]).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    timeout.unref?.();
  });
}

function operationFor(operation: OperationDefinition): SdkOperation {
  const module = surfaceModules[operation.surface] as Record<string, unknown>;
  const sdkOperation = module[operation.operationId];
  if (typeof sdkOperation !== "function") {
    throw new Error(`SDK operation ${operation.operationId} is not exported by @sendmux/sdk`);
  }

  return sdkOperation as SdkOperation;
}

function rawResponseData(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("data" in value)) {
    return value;
  }

  return (value as { data?: unknown }).data;
}
