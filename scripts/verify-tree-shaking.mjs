#!/usr/bin/env node

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "sendmux-tree-shaking-"));
const entry = join(dir, "entry.js");
const outfile = join(dir, "bundle.js");

writeFileSync(
  entry,
  [
    `import { configureSending, sendingSendEmail } from ${JSON.stringify(`${process.cwd()}/packages/ts/sending/dist/index.js`)};`,
    "console.log(configureSending, sendingSendEmail);",
  ].join("\n"),
);

await build({
  bundle: true,
  entryPoints: [entry],
  format: "esm",
  outfile,
  platform: "browser",
  treeShaking: true,
});

const bundle = readFileSync(outfile, "utf8");
const forbiddenSymbols = [
  "mailboxListMessages",
  "mailboxGetMessage",
  "managementListMailboxes",
  "managementCreateMailbox",
];

const leaked = forbiddenSymbols.filter((symbol) => bundle.includes(symbol));
if (leaked.length > 0) {
  throw new Error(`Sending-only bundle contains non-sending symbols: ${leaked.join(", ")}`);
}

console.log("Sending-only bundle excludes mailbox and management operation symbols.");
