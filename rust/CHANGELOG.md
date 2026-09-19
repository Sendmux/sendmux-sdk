# Changelog

## [0.5.1](https://github.com/Sendmux/sendmux-sdk/compare/rust-v0.5.0...rust-v0.5.1) (2026-09-19)


### Bug Fixes

* regenerate SDKs from the deployed flattened response schemas (docs 86b0f45) ([628b161](https://github.com/Sendmux/sendmux-sdk/commit/628b161d2692775ac1f4830c1d64c024ba04ed83))

## [0.5.0](https://github.com/Sendmux/sendmux-sdk/compare/rust-v0.4.0...rust-v0.5.0) (2026-09-19)


### Changed

* **Breaking:** `Attachment` is an enum: `Inline(InlineAttachment)` or `Uploaded(UploadedAttachmentRef)`. Replace struct literals and direct field access with `Attachment::base64(filename, content)` / `Attachment::uploaded(attachment_id)` or match the variants ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)). See [0.5.0 Rust contract changes](README.crates.io.md#050-rust-contract-changes).
* **Breaking:** `Response<T>` gains `pagination: Option<CursorPagination>`; add `pagination: None` to response fixtures without cursor metadata ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)).
* **Breaking:** `Error` gains the `InvalidRequestPath` variant; exhaustive `match` arms must add it ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)).

### Added

* Single and batch sends accept one delivery group or a list of groups (`delivery_group`) that narrows the eligible provider pool ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a)).
* Six list methods accept cursors through `*_with_cursor` variants; pass `pagination.next_cursor` while `has_more` is true ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)).
* Single and batch sends accept `Attachment::uploaded(attachment_id)` for existing Sending attachment references ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)).

### Security

* Raw Mailbox and Management requests reject absolute URLs, authority paths, and backslash paths before resolving credentials or sending HTTP requests; supply paths relative to the configured API base ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)).


### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* **sdk:** adopt final provider contract description and provenance ([a9bdaf5](https://github.com/Sendmux/sendmux-sdk/commit/a9bdaf58f0db684328458e269ba8aff515334d0b))
* **sdk:** adopt final provider contract description and provenance ([815278e](https://github.com/Sendmux/sendmux-sdk/commit/815278e76587dcba314c51202b8e764250e51ef3))
* **sdk:** verify Rust contracts and installed runtime consumers ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388))

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
