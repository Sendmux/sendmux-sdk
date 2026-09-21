# Changelog

## [2.0.2](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v2.0.1...ts-management-v2.0.2) (2026-09-21)


### Fixed

* **Nullable quota ranges and credentials:** `ProviderQuotaRange` and `MailboxCredential` were declared nullable at the type itself while the responses wrapped them in `& { [key: string]: unknown }` intersections, a composition a `null` value can never satisfy, so a `null` quota range or credential was invisible to the compiler; nullability now sits on the properties that carry it — `ProviderQuotas.per_second`, `per_minute`, `per_hour` and `per_day` are `ProviderQuotaRange | null`, and `MailboxCreateResult.credential` is `MailboxCredential | null` (`null` when credential generation failed; call `POST /mailboxes/{id}/keys` to retry) — while `MailboxAppPasswordResult.credential` is a plain `MailboxCredential` and the `ProviderCreateBody` and `ProviderUpdateBody` quota fields accept `number | ProviderQuotaRange | null`. No operation was added, removed or renamed.

### Bug Fixes

* **ts-management:** regenerate management types from the deployed v1.8.250 schema ([2f4a156](https://github.com/Sendmux/sendmux-sdk/commit/2f4a15669e445a0cabf60974e96684f6f8dd8745))

## [2.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v2.0.0...ts-management-v2.0.1) (2026-09-19)


### Bug Fixes

* regenerate SDKs from the deployed flattened response schemas (docs 86b0f45) ([628b161](https://github.com/Sendmux/sendmux-sdk/commit/628b161d2692775ac1f4830c1d64c024ba04ed83))
* **ts-management:** regenerate the flattened webhook secret response type ([6d56336](https://github.com/Sendmux/sendmux-sdk/commit/6d563364bbd9deb0c2dfc13cda1dce7d24421bf7))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.4.0...ts-management-v2.0.0) (2026-09-18)

### Changed

* **Breaking:** `managementListProviders` returns `ProviderListItem` entries without `variables`, while `managementGetProvider` returns `ProviderItem` with required `variables`. List entries no longer satisfy the detail type; use separate list/detail types and fetch a detail result when you need variables. See [Migrate from 1.x to 2.0](README.md#migrate-from-1x-to-20).

### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* **sdk:** adopt final provider contract description and provenance ([a9bdaf5](https://github.com/Sendmux/sendmux-sdk/commit/a9bdaf58f0db684328458e269ba8aff515334d0b))
* **sdk:** adopt final provider contract description and provenance ([815278e](https://github.com/Sendmux/sendmux-sdk/commit/815278e76587dcba314c51202b8e764250e51ef3))

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.3.0...ts-management-v1.4.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))


### Bug Fixes

* resolve TypeScript credential providers once per request ([4740163](https://github.com/Sendmux/sendmux-sdk/commit/474016356e4e307497ef875acbf62a988e16f96c))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.2.1...ts-management-v1.3.0) (2026-09-08)


### Features

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))

## [1.2.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.2.0...ts-management-v1.2.1) (2026-08-07)


### Bug Fixes

* **sdk:** regenerate management clients for the Amazon SES identity fields ([#137](https://github.com/Sendmux/sendmux-sdk/issues/137)) ([b0a3d63](https://github.com/Sendmux/sendmux-sdk/commit/b0a3d63f7d836d3d0e290a5b8c4e315a1a017e43))
* **ts:** preserve nullable enum members ([40868fe](https://github.com/Sendmux/sendmux-sdk/commit/40868fee3ea8ccd4f40ef4588ce942980a3329ff))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.1.0...ts-management-v1.2.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.0.1...ts-management-v1.1.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## [1.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-management-v1.0.0...ts-management-v1.0.1) (2026-07-01)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/core bumped to 1.1.0

## 1.0.0 (2026-05-30)


### Features

* add TypeScript SDK reference implementation ([3b38a86](https://github.com/Sendmux/sendmux-sdk/commit/3b38a860d5ff6c2d6bfb30e7f75e1405b6ab3e45))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/core bumped to 1.0.0
