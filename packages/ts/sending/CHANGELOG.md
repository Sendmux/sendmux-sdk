# Changelog

## Unreleased

### Features

* add one delivery group or a list of `delivery_group` IDs to email send requests

* add Node file attachment helper for Sending API email sends

## [1.6.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-sending-v1.5.0...ts-sending-v1.6.0) (2026-09-18)


### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* preserve attachment idempotency across composite sends ([5549549](https://github.com/Sendmux/sendmux-sdk/commit/554954947126eb2bdf56e1bf675ebc2b908a8216))
* **sending:** bound attachment file reads before upload ([83cb780](https://github.com/Sendmux/sendmux-sdk/commit/83cb7802a0e35d0779dad2f2c7d69e21c6d3d8d3))
* **sending:** reject excess files before attachment uploads ([3a1deca](https://github.com/Sendmux/sendmux-sdk/commit/3a1deca72f3fac51bb3843fce175ba2cd367e7c7))

## [1.5.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-sending-v1.4.0...ts-sending-v1.5.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))


### Bug Fixes

* resolve TypeScript credential providers once per request ([4740163](https://github.com/Sendmux/sendmux-sdk/commit/474016356e4e307497ef875acbf62a988e16f96c))

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-sending-v1.3.0...ts-sending-v1.4.0) (2026-09-08)


### Features

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-sending-v1.2.0...ts-sending-v1.3.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-sending-v1.1.0...ts-sending-v1.2.0) (2026-07-03)


### Features

* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-sending-v1.0.0...ts-sending-v1.1.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))

## 1.0.0 (2026-05-30)


### Features

* add TypeScript SDK reference implementation ([3b38a86](https://github.com/Sendmux/sendmux-sdk/commit/3b38a860d5ff6c2d6bfb30e7f75e1405b6ab3e45))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/core bumped to 1.0.0
