#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const defaultRegistryBaseUrl = "https://registry.modelcontextprotocol.io";

export function isRetryableMcpPublisherError(output) {
  return output
    .split(/\r?\n/u)
    .some(
      (line) =>
        line.includes("PyPI package 'sendmux-mcp'") && line.includes("status: 404"),
    );
}

export async function checkMcpRegistryVersion({
  fetchImpl = fetch,
  name,
  registryBaseUrl = defaultRegistryBaseUrl,
  version,
  expectedServer,
}) {
  const endpoint = new URL(
    `/v0.1/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
    registryBaseUrl,
  );
  const response = await fetchImpl(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const error = new Error(`MCP Registry returned HTTP ${response.status} for ${name} ${version}`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }

  const data = await response.json();
  const actualName = data?.server?.name;
  const actualVersion = data?.server?.version;
  if (actualName !== name || actualVersion !== version) {
    throw new Error(
      `MCP Registry returned ${actualName ?? "<missing name>"} ${actualVersion ?? "<missing version>"}, expected ${name} ${version}`,
    );
  }
  if (expectedServer && !isDeepStrictEqual(normalizeManifest(data.server), normalizeManifest(expectedServer))) {
    throw new Error(`MCP Registry metadata differs for ${name} ${version}; publish a new metadata version`);
  }
  return data;
}

function normalizeManifest(value, key) {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalizeManifest(item));
    return ["packages", "remotes", "environmentVariables"].includes(key)
      ? items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : items;
  }
  if (value && typeof value === "object") {
    // The registry omits optional false booleans in its response.
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== false).sort(([a], [b]) => a.localeCompare(b)).map(([fieldName, field]) => [fieldName, normalizeManifest(field, fieldName)]));
  }
  return value;
}

export async function waitForMcpRegistryVersion({
  attempts = 12,
  delayMs = 10_000,
  fetchImpl = fetch,
  name,
  registryBaseUrl = defaultRegistryBaseUrl,
  retryNotFound = true,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  version,
  expectedServer,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const data = await checkMcpRegistryVersion({ fetchImpl, name, registryBaseUrl, version, expectedServer });
      if (data) {
        return data;
      }
      if (!retryNotFound) {
        return null;
      }
    } catch (error) {
      if (!error.retryable || attempt === attempts) {
        throw error;
      }
    }

    if (attempt < attempts) {
      process.stderr.write(
        `MCP Registry has not exposed ${name} ${version}; retrying in ${delayMs}ms.\n`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`MCP Registry did not expose ${name} ${version} after ${attempts} attempts`);
}

async function main() {
  const retryablePublishLogIndex = process.argv.indexOf("--retryable-publish-log");
  if (retryablePublishLogIndex !== -1) {
    const path = process.argv[retryablePublishLogIndex + 1];
    if (!path) {
      throw new Error("--retryable-publish-log requires a path");
    }
    process.exitCode = isRetryableMcpPublisherError(readFileSync(path, "utf8")) ? 0 : 1;
    return;
  }

  const expectedServer = JSON.parse(readFileSync(process.env.MCP_SERVER_MANIFEST ?? "packages/python/mcp/server.json", "utf8"));
  const name = process.env.MCP_SERVER_NAME ?? expectedServer.name;
  const version = process.env.MCP_SERVER_VERSION ?? expectedServer.version;

  if (process.argv.includes("--check")) {
    const data = await waitForMcpRegistryVersion({ name, retryNotFound: false, version, expectedServer });
    process.stdout.write(`${data ? "true" : "false"}\n`);
    return;
  }

  await waitForMcpRegistryVersion({ name, version, expectedServer });
  process.stdout.write(`Verified ${name} ${version}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
