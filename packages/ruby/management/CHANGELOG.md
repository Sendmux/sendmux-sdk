# Changelog

## Unreleased

### Features

* Add provider variable management fields and delivery-group fields to delivery logs.

## [2.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ruby-management/v2.0.0...ruby-management/v2.0.1) (2026-09-19)


### Bug Fixes

* regenerate SDKs from the deployed flattened response schemas (docs 86b0f45) ([628b161](https://github.com/Sendmux/sendmux-sdk/commit/628b161d2692775ac1f4830c1d64c024ba04ed83))
* **ruby-management:** regenerate the flattened webhook secret response model ([b002849](https://github.com/Sendmux/sendmux-sdk/commit/b00284908ee07980f25badafaba90f4bd4eb6b25))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-management/v1.3.0...ruby-management/v2.0.0) (2026-09-18)

### Changed

* **Breaking:** `management_list_providers` returns `ProviderListItem` instead of `ProviderItem`; list entries don't expose `variables`, while detail `ProviderItem` requires a variables hash. Update list-specific class checks and fetch detail when you need variables. See [Migrate from 1.x to 2.0](README.md#migrate-from-1x-to-20).

### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* correct generated client contracts ([dd31abe](https://github.com/Sendmux/sendmux-sdk/commit/dd31abed8e264e05f4717388a0d4ada83e47d7e3))
* **sdk:** adopt final provider contract description and provenance ([a9bdaf5](https://github.com/Sendmux/sendmux-sdk/commit/a9bdaf58f0db684328458e269ba8aff515334d0b))
* **sdk:** adopt final provider contract description and provenance ([815278e](https://github.com/Sendmux/sendmux-sdk/commit/815278e76587dcba314c51202b8e764250e51ef3))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-management/v1.2.0...ruby-management/v1.3.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-management/v1.1.1...ruby-management/v1.2.0) (2026-09-08)


### Features

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))


### Bug Fixes

* anchor generated Ruby email validation ([a87933b](https://github.com/Sendmux/sendmux-sdk/commit/a87933b507c572104b1832818e7db0587ad0352b))
* reject mailbox email line breaks in generated clients ([7934cbe](https://github.com/Sendmux/sendmux-sdk/commit/7934cbe13f1d966878239e7c1d9e75ba44927937))
* sync mailbox reliability clients ([fad78fa](https://github.com/Sendmux/sendmux-sdk/commit/fad78faf1d495c31bc0e0c40ef7d605f72727431))
* sync mailbox reliability clients ([e8e7148](https://github.com/Sendmux/sendmux-sdk/commit/e8e7148e21f8fdba790c89331e8a2e144f86be4b))

## [1.1.1](https://github.com/Sendmux/sendmux-sdk/compare/ruby-management/v1.1.0...ruby-management/v1.1.1) (2026-08-07)


### Bug Fixes

* **sdk:** regenerate management clients for the Amazon SES identity fields ([#137](https://github.com/Sendmux/sendmux-sdk/issues/137)) ([b0a3d63](https://github.com/Sendmux/sendmux-sdk/commit/b0a3d63f7d836d3d0e290a5b8c4e315a1a017e43))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-management/v1.0.0...ruby-management/v1.1.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## 1.0.0 (2026-06-02)


### Features

* **ruby:** add generated SDK packages ([f097fdf](https://github.com/Sendmux/sendmux-sdk/commit/f097fdf6afcbc2a048d9fdb1c9a669fff2a7ca4f))

## 1.0.0

- Initial generated Ruby Management API package.
