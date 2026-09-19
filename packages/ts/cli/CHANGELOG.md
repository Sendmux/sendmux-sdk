# Changelog

## [1.7.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.6.0...ts-cli-v1.7.0) (2026-09-19)

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/sdk bumped to 2.0.0 (carries @sendmux/management 2.0.0, @sendmux/mailbox 2.0.0, @sendmux/sending 1.6.0 with `delivery_group` on sends)


### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **live-e2e:** certify attachment retention with bound upload evidence and immutable receipts ([8e272ca](https://github.com/Sendmux/sendmux-sdk/commit/8e272ca52a78fbfc46f38ee7225f56717a775e46))
* **live-e2e:** certify attachment retention with bound upload evidence and immutable receipts ([a3fc6cf](https://github.com/Sendmux/sendmux-sdk/commit/a3fc6cf2f1e33ccc8cfc5795ee8b6d129ba3427e))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* **cli:** bound agent authentication request lifetimes ([b3f0129](https://github.com/Sendmux/sendmux-sdk/commit/b3f0129b542190773f9346dfba535c1a711ee73e))
* **cli:** bound agent authentication response bodies ([0972d2e](https://github.com/Sendmux/sendmux-sdk/commit/0972d2e1ef18891deaaba0513a1572544eebc9e0))
* **cli:** recognise REST readiness error envelopes ([691ed25](https://github.com/Sendmux/sendmux-sdk/commit/691ed2589a95e681f08ed9ea7f804a312c7e975d))
* **cli:** reject agent authentication redirects ([34461a0](https://github.com/Sendmux/sendmux-sdk/commit/34461a02debd65a2bd93f9cca5b28bfa796ff1b9))
* **cli:** retain readiness response ownership through completion ([e482b37](https://github.com/Sendmux/sendmux-sdk/commit/e482b37633eb9ac4c422dcdf5c53a00ebf67102a))
* **cli:** retry Windows profile filesystem contention ([8e4a570](https://github.com/Sendmux/sendmux-sdk/commit/8e4a5702c0561b86db5558fb332a126d577be78a))
* preserve attachment idempotency across composite sends ([5549549](https://github.com/Sendmux/sendmux-sdk/commit/554954947126eb2bdf56e1bf675ebc2b908a8216))
* **sending:** bound attachment file reads before upload ([83cb780](https://github.com/Sendmux/sendmux-sdk/commit/83cb7802a0e35d0779dad2f2c7d69e21c6d3d8d3))
* **sending:** reject excess files before attachment uploads ([3a1deca](https://github.com/Sendmux/sendmux-sdk/commit/3a1deca72f3fac51bb3843fce175ba2cd367e7c7))

## [1.6.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.5.0...ts-cli-v1.6.0) (2026-09-11)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))


### Bug Fixes

* **cli:** keep OAuth callback page self-contained ([f35101a](https://github.com/Sendmux/sendmux-sdk/commit/f35101a1a744734ff586684714b4fd965ff333eb))

## [1.5.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.4.1...ts-cli-v1.5.0) (2026-09-08)


### Features

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **cli:** add durable agent onboarding ([96afdeb](https://github.com/Sendmux/sendmux-sdk/commit/96afdebdf488cce5bb1266d1a8609224c0eb4e1a))
* **cli:** add durable agent onboarding ([752c180](https://github.com/Sendmux/sendmux-sdk/commit/752c1802877bccf15202d5abb5955496f83242d6))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))


### Bug Fixes

* **cli:** address durable agent review ([b662c5d](https://github.com/Sendmux/sendmux-sdk/commit/b662c5dd1200b03232493e5602d8695927fd0bb5))
* **cli:** make profile mutations atomic ([5dd79d6](https://github.com/Sendmux/sendmux-sdk/commit/5dd79d68f9b936561ba957d2d1d824f139dbc081))
* **cli:** serialize profile config writes ([536b82e](https://github.com/Sendmux/sendmux-sdk/commit/536b82e533c1a9ee6367a46d52b10b02ca9d3a1c))

## [1.4.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.4.0...ts-cli-v1.4.1) (2026-08-19)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/sdk bumped to 1.4.1

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.3.2...ts-cli-v1.4.0) (2026-07-22)


### Features

* add oclif CLI package ([b8935c8](https://github.com/Sendmux/sendmux-sdk/commit/b8935c8d7d780e33c3dc46015816c605583f4cab))
* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))
* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))
* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))
* **sdk:** make mailbox attachments agent-ready ([457ed62](https://github.com/Sendmux/sendmux-sdk/commit/457ed62cf32c91aeac1cfe230d50f4f0b922e7cb))


### Bug Fixes

* **cli:** add npm license metadata ([1ddfc6c](https://github.com/Sendmux/sendmux-sdk/commit/1ddfc6ccf054f8318f585ee77ceb1a0870ee3b44))
* **cli:** add npm license metadata ([4c0a1ac](https://github.com/Sendmux/sendmux-sdk/commit/4c0a1ac7140817c25522c65e2b7485633dbde8f4))
* **sdk:** preserve attachment compatibility checks ([e92a1c2](https://github.com/Sendmux/sendmux-sdk/commit/e92a1c250a062f2f39a4f78c166c9e3a743e97ee))

## [1.3.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.3.0...ts-cli-v1.3.1) (2026-07-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/sdk bumped to 1.3.0

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.2.0...ts-cli-v1.3.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/sdk bumped to 1.3.0

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.1.0...ts-cli-v1.2.0) (2026-07-03)


### Features

* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))
* **sdk:** make mailbox attachments agent-ready ([457ed62](https://github.com/Sendmux/sendmux-sdk/commit/457ed62cf32c91aeac1cfe230d50f4f0b922e7cb))


### Bug Fixes

* **sdk:** preserve attachment compatibility checks ([e92a1c2](https://github.com/Sendmux/sendmux-sdk/commit/e92a1c250a062f2f39a4f78c166c9e3a743e97ee))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.0.1...ts-cli-v1.1.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))

## [1.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-cli-v1.0.0...ts-cli-v1.0.1) (2026-06-18)


### Bug Fixes

* **cli:** add npm license metadata ([1ddfc6c](https://github.com/Sendmux/sendmux-sdk/commit/1ddfc6ccf054f8318f585ee77ceb1a0870ee3b44))
* **cli:** add npm license metadata ([4c0a1ac](https://github.com/Sendmux/sendmux-sdk/commit/4c0a1ac7140817c25522c65e2b7485633dbde8f4))

## 1.0.0 (2026-06-03)


### Features

* add oclif CLI package ([b8935c8](https://github.com/Sendmux/sendmux-sdk/commit/b8935c8d7d780e33c3dc46015816c605583f4cab))

## 1.0.0

- Initial Sendmux CLI release.
