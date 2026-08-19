#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const defaultRegistryBaseUrl = "https://registry.modelcontextprotocol.io";

export async function checkMcpRegistryVersion({
  fetchImpl = fetch,
  name,
  registryBaseUrl = defaultRegistryBaseUrl,
  version,
}) {
  const endpoint = new URL(
    `/v0.1/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
    registryBaseUrl,
  );
  const response = await fetchImpl(endpoint, {
    headers: { accept: "application/json" },
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
  return data;
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
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const data = await checkMcpRegistryVersion({ fetchImpl, name, registryBaseUrl, version });
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
  const name = requiredEnvironmentVariable("MCP_SERVER_NAME");
  const version = requiredEnvironmentVariable("MCP_SERVER_VERSION");

  if (process.argv.includes("--check")) {
    const data = await waitForMcpRegistryVersion({ name, retryNotFound: false, version });
    process.stdout.write(`${data ? "true" : "false"}\n`);
    return;
  }

  await waitForMcpRegistryVersion({ name, version });
  process.stdout.write(`Verified ${name} ${version}\n`);
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
