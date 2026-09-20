# Changelog

## [2.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ruby-mailbox/v2.0.0...ruby-mailbox/v2.0.1) (2026-09-20)


### Deprecated

* `Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody` is now a deprecated constant aliasing `Sendmux::Mailbox::Generated::MailboxRealtimeMessageBody`, the class of `MailboxRealtimeMessage#body`. Referencing the old constant still works and, with `Warning[:deprecated]` enabled (`ruby -W:deprecated`), warns that it is deprecated; the alias is removed in the next major, 3.0 ([f1108bf](https://github.com/Sendmux/sendmux-sdk/commit/f1108bf40f6c1ff3f3948b49c9ae9dd22b33b3d9)).

### Changed

* Models are regenerated from the deployed flattened response schemas (docs 86b0f45): `MailboxMe`, `MailboxMessage`, `MailboxRealtimeMessage` and `MailboxThread` are flat objects instead of `allOf` compositions and carry the same attributes, so the wire format is unchanged, `MailboxRealtimeMessageBody` is the generated name of the realtime message body, and those four classes no longer define the generator's `openapi_all_of` introspection method. The `Sendmux::Mailbox::Generated::Mailbox` model, which no operation, README, guide or test referenced, is removed without a deprecation period; `mailbox_get_me` keeps returning `MailboxMe`, which carries the same attributes plus `quota_used_bytes` ([9c05be1](https://github.com/Sendmux/sendmux-sdk/commit/9c05be1bdad88fdcbbbeedf174adce01a6a48ae7)).

### Bug Fixes

* regenerate SDKs from the deployed flattened response schemas (docs 86b0f45) ([628b161](https://github.com/Sendmux/sendmux-sdk/commit/628b161d2692775ac1f4830c1d64c024ba04ed83))
* **ruby-mailbox:** keep MailboxRealtimeMessageAllOfBody as a deprecated constant ([f1108bf](https://github.com/Sendmux/sendmux-sdk/commit/f1108bf40f6c1ff3f3948b49c9ae9dd22b33b3d9))
* **ruby-mailbox:** regenerate flattened mailbox response models ([9c05be1](https://github.com/Sendmux/sendmux-sdk/commit/9c05be1bdad88fdcbbbeedf174adce01a6a48ae7))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-mailbox/v1.4.0...ruby-mailbox/v2.0.0) (2026-09-19)

### Changed

* **Breaking:** `mailbox_list_thread_messages` returns `MailboxThreadMessageSummaryCursorListResponse`, whose `meta.thread_id` is required and whose optional `meta.sync_state` is typed; thread-message results you construct (fixtures, mocks, wrappers) must now supply `thread_id`, while reading results is unaffected. `mailbox_list_messages` keeps `MailboxMessageSummaryCursorListResponse`; message, identity, submission, quota, and thread list responses replace the generic `ResponseMeta` with `MailboxSyncMeta`, `MailboxIdentityListMeta`, or `MailboxQueryMeta`, which add optional typed state metadata (`sync_state`, `identity_state`, `query_state`) ([87f54eb](https://github.com/Sendmux/sendmux-sdk/commit/87f54eb1679994ddcbdd68ad25d674ad6978f57f)). See [Migrate from 1.x to 2.0](README.md#migrate-from-1x-to-20).

### Bug Fixes

* prepare mailbox SDK major releases ([dc01472](https://github.com/Sendmux/sendmux-sdk/commit/dc014724f7f6eb6b93293e6acbcc1a36c5060ebb))
* **sdk:** preserve streaming arguments and prepare PHP OAuth release ([#207](https://github.com/Sendmux/sendmux-sdk/issues/207)) ([c534588](https://github.com/Sendmux/sendmux-sdk/commit/c53458875cef0bbd601c982308d84bc4e87c961c))

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-mailbox/v1.3.0...ruby-mailbox/v1.4.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-mailbox/v1.2.0...ruby-mailbox/v1.3.0) (2026-09-08)


### Features

* regenerate mailbox models for short-lived attachment download URLs and upload intents
* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-mailbox/v1.1.0...ruby-mailbox/v1.2.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ruby-mailbox/v1.0.0...ruby-mailbox/v1.1.0) (2026-07-03)


### Features

* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))
* **sdk:** make mailbox attachments agent-ready ([457ed62](https://github.com/Sendmux/sendmux-sdk/commit/457ed62cf32c91aeac1cfe230d50f4f0b922e7cb))


### Bug Fixes

* **sdk:** preserve attachment compatibility checks ([e92a1c2](https://github.com/Sendmux/sendmux-sdk/commit/e92a1c250a062f2f39a4f78c166c9e3a743e97ee))
* **sdk:** regenerate attachment download auth models ([6803890](https://github.com/Sendmux/sendmux-sdk/commit/6803890bad5aba610d5c6ad16ca98d7186ef9347))
* **sdk:** tolerate realtime events without attachments ([2d2b117](https://github.com/Sendmux/sendmux-sdk/commit/2d2b117945445b0478cf3f1d4f07b1038097f05f))

## 1.0.0 (2026-06-02)


### Features

* **ruby:** add generated SDK packages ([f097fdf](https://github.com/Sendmux/sendmux-sdk/commit/f097fdf6afcbc2a048d9fdb1c9a669fff2a7ca4f))

## 1.0.0

- Initial generated Ruby Mailbox API package.
