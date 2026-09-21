# Changelog

## [3.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-sdk/v2.0.0...ruby-sdk/v3.0.0) (2026-09-21)


### ⚠ BREAKING CHANGES

* **go:** the Go mailbox and management packages drop the Nil<Union>1 member fields of the eight provider quota unions and de-wrap five nullable fields to their canonical types; see the evidence file for the full list.

### Bug Fixes

* **go:** regenerate against the deployed v1.8.250 schema removes the quota union member fields and de-wraps five nullable fields ([628561d](https://github.com/Sendmux/sendmux-sdk/commit/628561d72e4094163b742923211140a6618755e2))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-sdk/v1.3.0...ruby-sdk/v2.0.0) (2026-09-19)


### Changed

* **Breaking:** the umbrella now requires `sendmux-management >= 2.0.0, < 3.0` and `sendmux-mailbox >= 2.0.0, < 3.0`, so `Sendmux::SDK.management(...)` and `Sendmux::SDK.mailbox(...)` return the 2.0 result classes: sending-account list entries are `ProviderListItem` (no `variables`) while `management_get_provider` returns `ProviderItem` with a required `variables` hash, and `mailbox_list_thread_messages` returns `MailboxThreadMessageSummaryCursorListResponse` whose `meta.thread_id` is required. Code that only reads results keeps working; class checks and constructed fixtures must follow [Migrate from 1.x to 2.0](README.md#migrate-from-1x-to-20) ([3c4fe75](https://github.com/Sendmux/sendmux-sdk/commit/3c4fe755c8be1b3afcd9b25aeb0aa4bb65be8556), [051a621](https://github.com/Sendmux/sendmux-sdk/commit/051a6215f1ef2a8400696baba9a84d8b8d9d9aae)).

### Dependencies

* `sendmux-mailbox >= 2.0.0, < 3.0` (was `>= 1.4.0, < 2.0`), `sendmux-management >= 2.0.0, < 3.0` (was `>= 1.3.0, < 2.0`), `sendmux-sending >= 1.5.0, < 2.0` (was `>= 1.4.0, < 2.0`; [eaf5a80](https://github.com/Sendmux/sendmux-sdk/commit/eaf5a80d19abaca9db21e9c093a8713ad972d934)); `sendmux-core >= 1.3.0, < 2.0` unchanged.

### ⚠ BREAKING CHANGES

* **ruby-sdk:** adopt Mailbox 2 producer floor
* **ruby-sdk:** adopt Management 2 producer floor

### Bug Fixes

* prepare mailbox SDK major releases ([dc01472](https://github.com/Sendmux/sendmux-sdk/commit/dc014724f7f6eb6b93293e6acbcc1a36c5060ebb))
* **ruby-sdk:** adopt Mailbox 2 producer floor ([051a621](https://github.com/Sendmux/sendmux-sdk/commit/051a6215f1ef2a8400696baba9a84d8b8d9d9aae))
* **ruby-sdk:** adopt Management 2 producer floor ([3c4fe75](https://github.com/Sendmux/sendmux-sdk/commit/3c4fe755c8be1b3afcd9b25aeb0aa4bb65be8556))
* **ruby-sdk:** require released sending 1.5.0 ([eaf5a80](https://github.com/Sendmux/sendmux-sdk/commit/eaf5a80d19abaca9db21e9c093a8713ad972d934))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-sdk/v1.2.0...ruby-sdk/v1.3.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-sdk/v1.1.0...ruby-sdk/v1.2.0) (2026-09-08)


### Features

* **ruby-sdk:** require connection-capable client versions ([175f89f](https://github.com/Sendmux/sendmux-sdk/commit/175f89f9dbe72bb84a4c65b6db77d0223ce80d3f))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-sdk/v1.0.0...ruby-sdk/v1.1.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))


### Bug Fixes

* **ruby-release:** require current component versions ([0e609e7](https://github.com/Sendmux/sendmux-sdk/commit/0e609e72630e05c29f93121dbac23946d0be7fe3))
* **ruby-release:** require current component versions ([6c4a97f](https://github.com/Sendmux/sendmux-sdk/commit/6c4a97f544aecde91e91e9649ddc9c824081eeb4))

## 1.0.0 (2026-06-02)


### Features

* **ruby:** add generated SDK packages ([f097fdf](https://github.com/Sendmux/sendmux-sdk/commit/f097fdf6afcbc2a048d9fdb1c9a669fff2a7ca4f))

## 1.0.0

- Initial Ruby umbrella package.
