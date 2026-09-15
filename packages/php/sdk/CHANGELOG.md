# Changelog

## Unreleased

### Changed

- Breaking: require Mailbox `^3.0` for the corrected changes-response types. Follow the [3.0 migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING-3.0.md) before upgrading.
- Set `Sdk::VERSION` to `3.0.0`; keep core, Sending, and Management on 2.x.

### Security

- Require core, Sending, and Management `^2.1.1` so Composer selects their maintained HTTP dependency floors. If you use a custom persistent cookie jar, follow the [upgrade warning](README.md#installation) before updating.

## 2.1.0 (2026-09-11)

- Require the OAuth-capable 2.1 core, Sending, Mailbox and Management packages.
- Update the public SDK version constant to 2.1.0.

## 2.0.0 (2026-09-08)

- Require the connection-capable 2.0 core, Sending, Mailbox and Management packages.
- Update the public SDK version constant to 2.0.0.
