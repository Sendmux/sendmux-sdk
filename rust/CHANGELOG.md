# Changelog

## Unreleased

### Changed

- **Breaking:** `Attachment` is an enum for inline content or uploaded
  references. Replace struct literals and direct field access with the
  constructors or enum variants described in [the Rust upgrade notes](README.crates.io.md#unreleased-rust-contract-changes).
- **Breaking:** `Response<T>` includes `pagination`. Add `pagination: None`
  to response fixtures without cursor metadata. See [the Rust upgrade notes](README.crates.io.md#unreleased-rust-contract-changes).

### Added

- Single and batch sends accept one delivery group or a list of groups that narrows the eligible provider pool.

- Six list methods accept cursors through their `*_with_cursor` variants.
  Pass `pagination.next_cursor` to advance when `has_more` is true.
- Single and batch sends accept `Attachment::uploaded(attachment_id)` for
  existing Sending attachment references.

### Security

- Raw Mailbox and Management requests reject absolute URLs, authority paths,
  and backslash paths before resolving credentials or sending HTTP requests.
  Supply paths relative to the configured API base.

## [0.4.0](https://github.com/Sendmux/sendmux-sdk/compare/rust-v0.3.0...rust-v0.4.0) (2026-09-11)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [0.3.0](https://github.com/Sendmux/sendmux-sdk/compare/rust-v0.2.0...rust-v0.3.0) (2026-09-08)


### Features

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))

## [0.2.0](https://github.com/Sendmux/sendmux-sdk/compare/rust-v0.1.0...rust-v0.2.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))

## 0.1.0

- Initial Sendmux Rust SDK crate.
