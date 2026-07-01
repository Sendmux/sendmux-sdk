# Sendmux Snapcraft Publishing

This directory packages only the published `@sendmux/cli` npm artefact as the
public `sendmux` snap.

## Official Docs Checked

- Snapcraft project files can live at `snap/snapcraft.yaml`; `core26` is the
  current recommended base for new snaps, and strict confinement is the default
  recommended confinement model:
  - https://documentation.ubuntu.com/snapcraft/stable/explanation/snapcraft-yaml/
  - https://documentation.ubuntu.com/snapcraft/stable/release-notes/snapcraft-9-0/
- The Snapcraft NPM plugin supports npm tarball sources, `npm-include-node`, and
  `npm-node-version` for bundling Node.js in the snap.
  - https://documentation.ubuntu.com/snapcraft/stable/common/craft-parts/reference/plugins/npm_plugin/
  - https://documentation.ubuntu.com/snapcraft/latest/how-to/integrations/craft-a-node-app/
- The snap uses strict confinement with only `network` for API calls and `home`
  for user-selected `--body-file` and attachment upload paths.
- Snapcraft metadata uses `title`, `summary`, `description`, `license`,
  `contact`, `issues`, `source-code`, `website`, and optional `icon`.
  - https://documentation.ubuntu.com/snapcraft/stable/how-to/crafting/configure-package-information/
  - https://documentation.ubuntu.com/snapcraft/stable/how-to/debugging/use-the-metadata-linter/
- Snapcraft release flow requires login, snap-name registration, upload, release
  to a channel, and post-release installation testing.
  - https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/authenticate/
  - https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/register-a-snap/
  - https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/publish-a-snap/
  - https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/manage-revisions-and-releases/
- Remote builds run on Launchpad and retrieve built packages locally. By default,
  prospective snaps are publicly uploaded to Launchpad; use a private Launchpad
  project if the source should not be public during the build.
  - https://documentation.ubuntu.com/snapcraft/stable/explanation/remote-build/
- Snap Store listing guidance supports up to 5 screenshots or animated GIFs and
  recommends Linux screenshots for cross-platform apps.
  - https://forum.snapcraft.io/t/store-listing-and-branding/16397

## Listing Content

Title:

> Sendmux CLI

Summary:

> Official command-line interface for Sendmux email APIs

Description:

> Manage Sendmux from Linux terminals and automation with the official Sendmux CLI.
>
> Use sendmux to configure local profiles, inspect available Management, Mailbox,
> and Sending API commands, and run Sendmux workflows with JSON output for scripts.
>
> The snap packages the published @sendmux/cli npm release with a bundled Node.js
> runtime. API operations require your own Sendmux API key; no credentials are
> included.

Links:

- Website: `https://sendmux.ai/docs`
- Source code: `https://github.com/Sendmux/sendmux-sdk`
- Issues/support: `https://github.com/Sendmux/sendmux-sdk/issues`
- npm package: `https://www.npmjs.com/package/@sendmux/cli`

Search terms covered by listing copy:

- `Sendmux`
- `email API`
- `CLI`
- `mailbox`
- `sending`
- `management`
- `automation`
- `Linux`
- `snap`

Snapcraft 9 does not document a supported `keywords` field in `snapcraft.yaml`.
Do not add unsupported keyword metadata; use title, summary, description, and any
Snap Store dashboard category fields available after registration.

## Media Notes

- No icon is committed here because this repository does not contain an approved
  Sendmux brand icon.
- If an approved icon is available later, place it under `snap/gui/` and set the
  `icon` key in `snap/snapcraft.yaml`. Snapcraft recommends a 256x256 icon, with
  accepted icon dimensions from 40x40 to 512x512 and file size under 256 KB.
- For optional screenshots, upload no more than 5 Linux terminal screenshots or
  animated GIFs. Use harmless commands such as `sendmux --help` and
  `sendmux profiles:list --json`.
- Do not show API keys, account identifiers, customer data, production URLs beyond
  public docs links, or internal infrastructure details in any screenshot.

## Local Build And Smoke Test

On a Linux host with snapd, Snapcraft, and a configured build provider:

```sh
cd /path/to/sendmux-sdk
snapcraft pack
VERSION=$(grep '^version:' snap/snapcraft.yaml | cut -d'"' -f2)
sudo snap install ./sendmux_${VERSION}_*.snap --dangerous
sendmux --help
sendmux profiles:list --json
sudo snap remove sendmux
```

On macOS, Snapcraft uses Multipass as its default provider. Install and start
Multipass before running `snapcraft pack`; the final `snap install` smoke test
still needs a Linux host with snapd.

Remote build is also available when a local Linux build host is not ready:

```sh
snapcraft remote-build --build-for amd64,arm64
```

Only use remote build after confirming the Launchpad upload policy. Without a
private Launchpad project, Snapcraft asks for confirmation because the project is
uploaded publicly. To make that public-upload acknowledgement non-interactive:

```sh
snapcraft remote-build --build-for amd64,arm64 --launchpad-accept-public-upload
```

Do not switch this snap to an older base only to use an older Docker image. As of
2026-06-18, `ghcr.io/canonical/snapcraft:9_core26` was not published, while the
older `ghcr.io/canonical/snapcraft:8_core24` image was available. Keep `core26`
unless there is a product reason to target an older base.

Expected smoke-test results:

- `sendmux --help` prints the oclif command list without requiring credentials.
- `sendmux profiles:list --json` returns an empty or local profile list without
  making a network request.
- No API keys, test secrets, or production credentials are used.

The `home` plug is included for user-selected files passed to `--body-file`,
including binary attachment uploads. It does not grant removable-media access;
add `removable-media` later only if there is a verified user need.

## Publishing Checklist

1. Confirm account ownership:
   - Create or use the Sendmux Snapcraft publisher account.
   - If using a brand account, complete the Snap Store brand setup before release.
2. Register the public snap name:
   - `snapcraft login`
   - `snapcraft register sendmux`
3. Build the snap from a clean checkout:
   - `snapcraft pack`
   - Or, after confirming Launchpad public/private upload policy:
     `snapcraft remote-build --build-for amd64,arm64`
4. Upload first to edge:
   ```sh
   VERSION=$(grep '^version:' snap/snapcraft.yaml | cut -d'"' -f2)
   snapcraft upload ./sendmux_${VERSION}_*.snap --release=edge
   ```
5. Smoke-test from the store on a separate Linux host:
   - `sudo snap install sendmux --edge`
   - `sendmux --help`
   - `sendmux profiles:list --json`
6. Promote only after verification:
   - Find the revision with `snapcraft revisions sendmux`.
   - Promote the verified revision with `snapcraft release sendmux <revision> stable`.
   - Re-test with `sudo snap install sendmux` or `sudo snap refresh sendmux --stable`.

## Maintenance

The snap follows the published `@sendmux/cli` npm release, not SDK libraries.

For each future CLI release:

1. Publish and verify `@sendmux/cli` on npm.
2. Update `snap/snapcraft.yaml`:
   - `version`
   - npm tarball URL in `parts.sendmux.source`
   - `parts.sendmux.source-checksum`
   - `parts.sendmux.npm-node-version` only when the CLI runtime target changes
3. Rebuild with `snapcraft pack`.
4. Repeat the edge smoke test before promoting to stable.

Checksum helper:

```sh
npm pack @sendmux/cli@<version> --pack-destination /tmp
shasum -a 512 /tmp/sendmux-cli-<version>.tgz
```

Then format the value as `sha512/<hex>` for `source-checksum`.

## CI Option

CI can be added later once Snapcraft credentials and a Linux build provider are
explicitly scoped. A safe first CI job would build the snap and upload only to
`edge`; stable promotion should remain manual until edge installs are verified.
