# Changelog

## [3.0.1](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v3.0.0...python-sdk-v3.0.1) (2026-09-21)


### Bug Fixes

* **python-sdk:** raise the mailbox and management floors to 2.0.2 and 2.0.1 ([466f5e4](https://github.com/Sendmux/sendmux-sdk/commit/466f5e44a4d9bfb71c7d5bd0bf0f6a0e7ab5c60c))


### Documentation

* **python-sdk:** drop stale Unreleased changelog block shipped in 3.0.0 ([912dfcf](https://github.com/Sendmux/sendmux-sdk/commit/912dfcf3372df43449fdcd75f5d4ea211ab94754))

## [3.0.0](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v2.0.0...python-sdk-v3.0.0) (2026-09-18)


### ⚠ BREAKING CHANGES

* **python-sdk:** provider lists expose ProviderListItem while details retain ProviderItem with variables. Requires Management 2 and prepares the SDK 3 release; published SDK versions remain immutable.

### Bug Fixes

* **python-sdk:** adopt Management 2 and Sending 1.6 producer floors ([d296c8f](https://github.com/Sendmux/sendmux-sdk/commit/d296c8f550e1754b2190b8a5f028c96bff4404b1))


### Documentation

* **python-sdk:** classify raised Sending floor as breaking ([c91c415](https://github.com/Sendmux/sendmux-sdk/commit/c91c415d57845fe7950c057fc93e46ef8b7ccdf3))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.2.0...python-sdk-v2.0.0) (2026-09-15)


### ⚠ BREAKING CHANGES

* The `mailbox` module's thread-message lists return `MailboxThreadMessageSummaryCursorListResponse` instead of the ordinary message-list response type, with required `meta.thread_id` and optional typed `meta.sync_state`; ordinary message lists remain thread-independent.
* Upgrade `sendmux-sdk`, `sendmux-mailbox`, the lockfile, and affected call sites together; restore them together to roll back. See [Version 2.0.0 migration](README.md#version-200-migration).


### Bug Fixes

* align Python SDK mailbox floor ([57c43c4](https://github.com/Sendmux/sendmux-sdk/commit/57c43c47f9adc1d5c16bdc6904b5681794b8ab1f))
* prepare mailbox SDK major releases ([dc01472](https://github.com/Sendmux/sendmux-sdk/commit/dc014724f7f6eb6b93293e6acbcc1a36c5060ebb))
* **python-sdk:** require `sendmux-core>=1.3.1,<2.0.0`, `sendmux-mailbox>=2.0.0,<3.0.0`, and `sendmux-sending>=1.5.1,<2.0.0` to adopt the Mailbox 2 response contract and propagate the core exception-mapping fix

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.1.1...python-sdk-v1.2.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [1.1.1](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.1.0...python-sdk-v1.1.1) (2026-09-08)


### Bug Fixes

* **python-sdk:** require connection-capable components ([#179](https://github.com/Sendmux/sendmux-sdk/issues/179)) ([df3bf12](https://github.com/Sendmux/sendmux-sdk/commit/df3bf12f0dc6ce4e39dd36550d49187e8b9aabfb))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.0.4...python-sdk-v1.1.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))


### Bug Fixes

* **python-sdk:** require current component versions ([a77fa59](https://github.com/Sendmux/sendmux-sdk/commit/a77fa59a69fd10bbf014d0ed1f0d7693305b7adb))
* **python-sdk:** require current component versions ([31d2557](https://github.com/Sendmux/sendmux-sdk/commit/31d255772e5f3e1ba0149c1ca3928b176659edfd))

## [1.0.4](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.0.3...python-sdk-v1.0.4) (2026-06-19)


### Bug Fixes

* **python:** add package metadata classifiers ([9a79f5d](https://github.com/Sendmux/sendmux-sdk/commit/9a79f5d118766c5a59fdc9e568f4cf08874f1486))

## [1.0.3](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.0.2...python-sdk-v1.0.3) (2026-06-18)


### Documentation

* update Sendmux docs links ([24b89cb](https://github.com/Sendmux/sendmux-sdk/commit/24b89cb851dd8f37dd1304eb292681892bad077d))

## [1.0.2](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.0.1...python-sdk-v1.0.2) (2026-06-17)


### Documentation

* expand Python package READMEs ([6d82e19](https://github.com/Sendmux/sendmux-sdk/commit/6d82e1990d5a4efbde7b8107deae58bd99d35b89))

## [1.0.1](https://github.com/Sendmux/sendmux-sdk/compare/python-sdk-v1.0.0...python-sdk-v1.0.1) (2026-06-17)


### Bug Fixes

* **python:** publish dists with supported metadata ([e5506e7](https://github.com/Sendmux/sendmux-sdk/commit/e5506e71410a61a7ddcf547f67f863ff2cfc60d6))

## 1.0.0 (2026-06-01)


### Features

* **python-sdk:** add generated Python packages ([82c4a84](https://github.com/Sendmux/sendmux-sdk/commit/82c4a84976b4d9802f993b07302430546a323543))
