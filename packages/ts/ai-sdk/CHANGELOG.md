# Changelog

## [0.5.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.5.0...ts-ai-sdk-v0.5.1) (2026-09-19)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 2.0.1

## [0.5.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.4.0...ts-ai-sdk-v0.5.0) (2026-09-19)

### Changed

* **Breaking:** the `zod` peer dependency minimum is `3.25.76` (was `3.24.0`). Upgrade Zod `3.24` before adopting this release and keep `ai` and `zod` within the peer ranges accepted by your installed `ai` version ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388)). See [Upgrading to 0.5.0](README.md#upgrading-to-050).


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 2.0.0
    * @sendmux/sending bumped to 1.6.0


### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* **sdk:** verify Rust contracts and installed runtime consumers ([3703a89](https://github.com/Sendmux/sendmux-sdk/commit/3703a899cd234bee362bb51f52af15f85e9c1388))

## [0.4.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.3.3...ts-ai-sdk-v0.4.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [0.3.3](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.3.2...ts-ai-sdk-v0.3.3) (2026-09-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 1.5.0
    * @sendmux/sending bumped to 1.4.0

## [0.3.2](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.3.1...ts-ai-sdk-v0.3.2) (2026-08-19)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 1.4.1

## [0.3.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.3.0...ts-ai-sdk-v0.3.1) (2026-08-07)


### Bug Fixes

* **packages:** add registry metadata and full READMEs to the framework wrappers ([#136](https://github.com/Sendmux/sendmux-sdk/issues/136)) ([936280e](https://github.com/Sendmux/sendmux-sdk/commit/936280e217fa0a1eb84debf8e808807bc613940f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 1.4.1

## [0.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.2.1...ts-ai-sdk-v0.3.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))
* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([d994ca3](https://github.com/Sendmux/sendmux-sdk/commit/d994ca39e44dde10be73fb8cb375c27704ef2d81))


### Bug Fixes

* **ai-sdk,langchain:** address review - idempotency, HTML breaks, mailbox floor ([c31a005](https://github.com/Sendmux/sendmux-sdk/commit/c31a0054ef1a7c2c1a9c5c1b668b2688ab6d01e1))

## [0.2.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.2.0...ts-ai-sdk-v0.2.1) (2026-07-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 1.4.0

## [0.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-ai-sdk-v0.1.0...ts-ai-sdk-v0.2.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))
* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([d994ca3](https://github.com/Sendmux/sendmux-sdk/commit/d994ca39e44dde10be73fb8cb375c27704ef2d81))


### Bug Fixes

* **ai-sdk,langchain:** address review - idempotency, HTML breaks, mailbox floor ([c31a005](https://github.com/Sendmux/sendmux-sdk/commit/c31a0054ef1a7c2c1a9c5c1b668b2688ab6d01e1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sendmux/mailbox bumped to 1.4.0
