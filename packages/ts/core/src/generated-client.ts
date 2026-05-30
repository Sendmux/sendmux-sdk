import { authToken } from "./auth.js";
import { createErrorInterceptor } from "./errors.js";
import { createRetryingFetch } from "./retry.js";
import type {
  ApiKeyKind,
  GeneratedSendmuxClient,
  GeneratedSendmuxClientConfig,
  SendmuxClientConfig,
} from "./types.js";

const clientsWithErrorInterceptors = new WeakSet<object>();
const clientsWithRequestReplayInterceptors = new WeakSet<object>();
const clientReplayBodies = new WeakMap<object, WeakMap<Request, string>>();

export function configureGeneratedClient<TClient extends GeneratedSendmuxClient>(
  client: TClient,
  config: SendmuxClientConfig,
  apiKeyKind: ApiKeyKind,
): TClient {
  const replayBodies = replayBodyStoreFor(client);
  const nextConfig: GeneratedSendmuxClientConfig = {
    auth: authToken({ ...config, apiKeyKind }),
    fetch: createRetryingFetch(config.retry, config.fetch, replayBodies),
    throwOnError: true,
  };

  if (config.baseUrl) {
    nextConfig.baseUrl = config.baseUrl;
  }

  client.setConfig(nextConfig);

  if (!clientsWithRequestReplayInterceptors.has(client)) {
    client.interceptors.request.use((request, options) => {
      if (typeof options.serializedBody === "string") {
        replayBodies.set(request, options.serializedBody);
      }

      return request;
    });
    clientsWithRequestReplayInterceptors.add(client);
  }

  if (!clientsWithErrorInterceptors.has(client)) {
    client.interceptors.error.use(createErrorInterceptor());
    clientsWithErrorInterceptors.add(client);
  }

  return client;
}

function replayBodyStoreFor(client: object): WeakMap<Request, string> {
  const existing = clientReplayBodies.get(client);
  if (existing) {
    return existing;
  }

  const replayBodies = new WeakMap<Request, string>();
  clientReplayBodies.set(client, replayBodies);
  return replayBodies;
}
