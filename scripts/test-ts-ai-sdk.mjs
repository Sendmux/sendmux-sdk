#!/usr/bin/env node

import assert from "node:assert/strict";

const mod = await import("../packages/ts/ai-sdk/dist/index.js");
const { sendmux } = mod;

assert.equal(typeof sendmux, "function", "sendmux is a function export");
assert.equal(mod.default, sendmux, "default export is sendmux");

const tools = sendmux({
  apiKey: "smx_mbx_test",
  defaultFrom: "agent@yourdomain.dev",
});

const names = Object.keys(tools).sort();
assert.deepEqual(
  names,
  ["list_messages", "reply", "send_email"],
  "exposes the three expected tools",
);

for (const [name, tool] of Object.entries(tools)) {
  assert.ok(tool.description, `${name} has a description`);
  assert.ok(tool.inputSchema, `${name} has an inputSchema`);
  assert.equal(typeof tool.execute, "function", `${name} has an execute function`);
}

console.log("ai-sdk tool set OK:", names.join(", "));
