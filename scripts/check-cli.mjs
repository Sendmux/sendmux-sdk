#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = "packages/ts/cli/bin/run.js";
const mailboxKey = "smx_mbx_testkey1234567890";
const rootKey = "smx_root_testkey1234567890";
const envelope = {
  ok: true,
  data: {
    messages: [],
  },
  meta: {
    request_id: "req_cli_test",
  },
  pagination: {
    has_more: false,
  },
};

const serverState = { requests: 0 };
const tempHome = mkdtempSync(join(tmpdir(), "sendmux-cli-"));
const server = createServer((request, response) => {
  serverState.requests += 1;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(envelope));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const jsonResult = await runCli([
    "mailbox:messages:list",
    "--api-key",
    mailboxKey,
    "--base-url",
    baseUrl,
    "--query",
    "limit=1",
    "--json",
  ]);

  if (jsonResult.status !== 0) {
    throw new Error(`mailbox:messages:list --json failed:\n${jsonResult.stderr}`);
  }

  const parsed = JSON.parse(jsonResult.stdout);
  assertDeepEqual(parsed, envelope, "--json must emit the raw SDK response envelope");

  const profileResult = await runCli([
    "profiles:set",
    "mbx",
    "--api-key",
    mailboxKey,
    "--default",
  ]);

  if (profileResult.status !== 0) {
    throw new Error(`profiles:set failed:\n${profileResult.stderr}`);
  }

  const requestCountBeforePreflight = serverState.requests;
  const rejectResult = await runCli([
    "management:domains:list",
    "--profile",
    "mbx",
    "--base-url",
    baseUrl,
  ]);

  if (rejectResult.status === 0) {
    throw new Error("management:domains:list accepted a mailbox API key");
  }

  if (!rejectResult.stderr.includes("requires a root API key")) {
    throw new Error(`Expected root-key preflight error, got:\n${rejectResult.stderr}`);
  }

  if (serverState.requests !== requestCountBeforePreflight) {
    throw new Error("Root command preflight made a network request before rejecting a mailbox key");
  }

  const rootResult = await runCli([
    "management:domains:list",
    "--api-key",
    rootKey,
    "--base-url",
    baseUrl,
    "--json",
  ]);

  if (rootResult.status !== 0) {
    throw new Error(`management:domains:list with root key failed:\n${rootResult.stderr}`);
  }

  console.log("CLI gate checks passed.");
} finally {
  server.close();
  rmSync(tempHome, { force: true, recursive: true });
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        HOME: tempHome,
        SENDMUX_API_KEY: "",
        SENDMUX_BASE_URL: "",
        SENDMUX_PROFILE: "",
        XDG_CONFIG_HOME: join(tempHome, ".config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI command timed out: ${args.join(" ")}`));
    }, 15_000);
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({
        status,
        stderr,
        stdout,
      });
    });
  });
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}
