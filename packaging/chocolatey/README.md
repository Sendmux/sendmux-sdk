# Sendmux Chocolatey packages

This directory contains templates for the public Chocolatey packages:

- `sendmux.portable` downloads and installs the Windows x64 Sendmux CLI.
- `sendmux` is a meta package that depends on the matching `sendmux.portable` version.

These are download-only packages; do not include `LICENSE.txt` or `VERIFICATION.txt` in their package contents.

Build the CLI tarball, create the Chocolatey zip asset, then generate concrete packages:

```sh
SENDMUX_CLI_PACK_TARGETS=win32-x64 pnpm --filter @sendmux/cli pack:tarballs
pnpm build:chocolatey
```

Generated packages are written to `.tmp/chocolatey`.

