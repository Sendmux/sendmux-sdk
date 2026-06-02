#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const generatedPackageDirs = [
  "go/mailbox",
  "go/management",
  "go/sending",
  "packages/php/mailbox/src",
  "packages/php/management/src",
  "packages/php/sending/src",
  "packages/python/mcp/sendmux_mcp/openapi",
  "packages/ruby/mailbox/lib/sendmux_mailbox_generated",
  "packages/ruby/mailbox/lib/sendmux_mailbox_generated.rb",
  "packages/ruby/management/lib/sendmux_management_generated",
  "packages/ruby/management/lib/sendmux_management_generated.rb",
  "packages/ruby/sending/lib/sendmux_sending_generated",
  "packages/ruby/sending/lib/sendmux_sending_generated.rb",
  "packages/ts/mailbox/src/generated",
  "packages/ts/management/src/generated",
  "packages/ts/sending/src/generated",
];

const unstagedDiff = execFileSync("git", ["diff", "--name-status", "--", ...generatedPackageDirs], {
  encoding: "utf8",
});
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...generatedPackageDirs], {
  encoding: "utf8",
});

const drift = [unstagedDiff.trim(), untracked.trim()].filter(Boolean).join("\n");

if (drift) {
  throw new Error(
    [
      "Generated SDK package directories are stale.",
      drift,
      "Regenerate the SDKs from the current snapshots and stage or commit the resulting package changes.",
    ].join("\n"),
  );
}

console.log("Generated SDK package directories have no uncommitted drift.");
