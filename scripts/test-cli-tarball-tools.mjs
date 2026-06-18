#!/usr/bin/env node

import assert from "node:assert/strict";
import { invalidTarballEntries, tarListArgs, tarVerboseListArgs } from "./cli-tarball-tools.mjs";

assert.deepEqual(tarListArgs("D:\\a\\sendmux-sdk\\sendmux-v1.0.1-win32-x64.tar.gz", { platform: "win32" }), [
  "--force-local",
  "-tf",
  "D:\\a\\sendmux-sdk\\sendmux-v1.0.1-win32-x64.tar.gz",
]);

assert.deepEqual(tarVerboseListArgs("/tmp/sendmux-v1.0.1-linux-x64.tar.gz", { platform: "linux" }), [
  "-tvf",
  "/tmp/sendmux-v1.0.1-linux-x64.tar.gz",
]);

assert.deepEqual(
  invalidTarballEntries({
    names: [
      "sendmux/bin/sendmux",
      "sendmux/node_modules/.pnpm/@oclif+core@4.11.4/node_modules/@oclif/core",
      "sendmux/pnpm-lock.yaml",
    ].join("\n"),
    verboseListing: [
      "-rwxr-xr-x 0 runner runner 10 Jun 18 13:30 sendmux/bin/sendmux",
      "lrwxrwxrwx 0 runner runner 0 Jun 18 13:30 sendmux/node_modules/@oclif/core -> ../.pnpm/@oclif+core@4.11.4/node_modules/@oclif/core",
    ].join("\n"),
  }),
  {
    pnpmEntries: [
      "sendmux/node_modules/.pnpm/@oclif+core@4.11.4/node_modules/@oclif/core",
      "sendmux/pnpm-lock.yaml",
    ],
    symlinks: [
      "lrwxrwxrwx 0 runner runner 0 Jun 18 13:30 sendmux/node_modules/@oclif/core -> ../.pnpm/@oclif+core@4.11.4/node_modules/@oclif/core",
    ],
  },
);

assert.deepEqual(
  invalidTarballEntries({
    names: "sendmux/bin/sendmux\nsendmux/node_modules/@oclif/core/package.json",
    verboseListing: "-rwxr-xr-x 0 runner runner 10 Jun 18 13:30 sendmux/bin/sendmux",
  }),
  {
    pnpmEntries: [],
    symlinks: [],
  },
);

console.log("CLI tarball tool tests passed.");
