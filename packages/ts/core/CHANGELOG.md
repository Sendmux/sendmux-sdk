# Changelog

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-core-v1.2.0...ts-core-v2.0.0) (2026-09-21)


### ⚠ BREAKING CHANGES

* **go:** the Go mailbox and management packages drop the Nil<Union>1 member fields of the eight provider quota unions and de-wrap five nullable fields to their canonical types; see the evidence file for the full list.

### Bug Fixes

* **go:** regenerate against the deployed v1.8.250 schema removes the quota union member fields and de-wraps five nullable fields ([628561d](https://github.com/Sendmux/sendmux-sdk/commit/628561d72e4094163b742923211140a6618755e2))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-core-v1.1.0...ts-core-v1.2.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-core-v1.0.0...ts-core-v1.1.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))

## 1.0.0 (2026-05-30)


### Features

* add TypeScript SDK reference implementation ([3b38a86](https://github.com/Sendmux/sendmux-sdk/commit/3b38a860d5ff6c2d6bfb30e7f75e1405b6ab3e45))
