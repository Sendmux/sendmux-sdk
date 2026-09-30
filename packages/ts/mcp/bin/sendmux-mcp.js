#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve("mcp-remote/package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const child = spawn(process.execPath, [
  resolve(dirname(manifestPath), manifest.bin["mcp-remote"]),
  "https://mcp.sendmux.ai/mcp",
  "--transport", "http-only",
], { stdio: "inherit" });

const interrupt = () => child.kill("SIGINT");
const terminate = () => child.kill("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
process.once("exit", terminate);
child.once("error", (error) => {
  process.stderr.write(`Could not start Sendmux MCP: ${error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
  process.off("exit", terminate);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
