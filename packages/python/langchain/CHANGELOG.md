# Changelog

## [0.4.0](https://github.com/Sendmux/sendmux-sdk/compare/python-langchain-v0.3.0...python-langchain-v0.4.0) (2026-09-19)


### Changed

* **Dependency floors:** requires `sendmux-sending>=1.6.0,<2.0.0` and `sendmux-mailbox>=2.0.0,<3.0.0`; 0.3.0 accepted `>=1.5.0,<2.0.0` for both. Applications that also pin `sendmux-mailbox<2` or `sendmux-sending<1.6` no longer resolve, so upgrade them together. The three tools keep their names and existing arguments ([aea3b55](https://github.com/Sendmux/sendmux-sdk/commit/aea3b5599e92f6a7156bc79e70f26376103c2cb5), [3e9fbc5](https://github.com/Sendmux/sendmux-sdk/commit/3e9fbc571e9237cb0833a3ab93780bf59ee8e820)).

### Added

* `send_email` accepts an optional `delivery_group`, one delivery group ID or a list of IDs, that narrows the eligible provider pool for that send; omitting it keeps the previous routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a)). See the [`send_email` parameters](README.md#send_email).


### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* **python-langchain:** require sendmux-sending 1.6.0 ([cf9aaf9](https://github.com/Sendmux/sendmux-sdk/commit/cf9aaf9c93453a80b0f204a4522d1d317652f9b9))
* **python-langchain:** require sendmux-sending 1.6.0 ([3e9fbc5](https://github.com/Sendmux/sendmux-sdk/commit/3e9fbc571e9237cb0833a3ab93780bf59ee8e820))
* **python:** enforce Management and LangChain dependency floors ([#226](https://github.com/Sendmux/sendmux-sdk/issues/226)) ([aea3b55](https://github.com/Sendmux/sendmux-sdk/commit/aea3b5599e92f6a7156bc79e70f26376103c2cb5))


### Documentation

* **python-langchain:** document the delivery_group parameter ([18334ff](https://github.com/Sendmux/sendmux-sdk/commit/18334ffa04cf558d68d100629c6d4c5d3049193d))
* release-ready python-langchain 0.4.0 and go 2.0.0 shipped docs ([bcadb1f](https://github.com/Sendmux/sendmux-sdk/commit/bcadb1f9fdbd455b0cd5334280d45c9917470a56))

## [0.3.0](https://github.com/Sendmux/sendmux-sdk/compare/python-langchain-v0.2.1...python-langchain-v0.3.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [0.2.1](https://github.com/Sendmux/sendmux-sdk/compare/python-langchain-v0.2.0...python-langchain-v0.2.1) (2026-08-07)


### Bug Fixes

* **packages:** add registry metadata and full READMEs to the framework wrappers ([#136](https://github.com/Sendmux/sendmux-sdk/issues/136)) ([936280e](https://github.com/Sendmux/sendmux-sdk/commit/936280e217fa0a1eb84debf8e808807bc613940f))

## [0.2.0](https://github.com/Sendmux/sendmux-sdk/compare/python-langchain-v0.1.0...python-langchain-v0.2.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))
* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([d994ca3](https://github.com/Sendmux/sendmux-sdk/commit/d994ca39e44dde10be73fb8cb375c27704ef2d81))


### Bug Fixes

* **ai-sdk,langchain:** address review - idempotency, HTML breaks, mailbox floor ([c31a005](https://github.com/Sendmux/sendmux-sdk/commit/c31a0054ef1a7c2c1a9c5c1b668b2688ab6d01e1))
* **langchain:** build request models via model_validate (alias-safe) ([7729ebe](https://github.com/Sendmux/sendmux-sdk/commit/7729ebe48aab99af962603adb9ce370abd777aea))
