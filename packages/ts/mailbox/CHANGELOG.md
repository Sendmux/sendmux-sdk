# Changelog

## [2.0.2](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v2.0.1...ts-mailbox-v2.0.2) (2026-09-21)


### Fixed

* **Nullable references and threading headers:** `MailboxMessageContent`, `MailboxRawBody` and `MailboxSubmissionEnvelopeAddress` were declared nullable at the type itself while the responses wrapped them in `& { [key: string]: unknown }` intersections, a composition a `null` value can never satisfy, so a `null` `content`, `raw_body` or `mail_from` was invisible to the compiler; nullability now sits on the properties that carry it — `MailboxBatchGetItem.content: MailboxMessageContent | null`, `MailboxBatchGetItem.raw_body: MailboxRawBody | null` and `MailboxSubmissionEnvelope.mail_from: MailboxSubmissionEnvelopeAddress | null` — and `MailboxMessageContentResponse.data`, `MailboxThreadContentResponse.data`, `MailboxRawBodyResponse.data` and `MailboxSubmissionEnvelope.rcpt_to` are the plain named types. `MailboxMessage` now declares `message_id`, `in_reply_to` and `references` (`Array<string>`, angle brackets removed) and `reply_to` (`Array<MailboxAddress>`), matching the deployed app schema. No operation was added, removed or renamed, and no request type changed.

### Bug Fixes

* **ts-mailbox:** regenerate mailbox types from the deployed v1.8.250 schema ([3c7ca7e](https://github.com/Sendmux/sendmux-sdk/commit/3c7ca7ecfc044b76fd06a43d662cddb921d6649a))

## [2.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v2.0.0...ts-mailbox-v2.0.1) (2026-09-19)


### Bug Fixes

* regenerate SDKs from the deployed flattened response schemas (docs 86b0f45) ([628b161](https://github.com/Sendmux/sendmux-sdk/commit/628b161d2692775ac1f4830c1d64c024ba04ed83))
* **ts-mailbox:** regenerate flattened mailbox response types ([6d297d1](https://github.com/Sendmux/sendmux-sdk/commit/6d297d15d506b22ab6935bd537070a4b5dbb5c30))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.6.0...ts-mailbox-v2.0.0) (2026-09-18)

### Changed

* **Breaking:** `mailboxListThreadMessages` returns `MailboxThreadMessageSummaryCursorListResponse`, whose `meta.thread_id` is required and whose optional `meta.sync_state` is typed; thread-message results you construct (fixtures, mocks, annotated wrappers) must now supply `thread_id`, while reading results is unaffected. `mailboxListMessages` keeps `MailboxMessageSummaryCursorListResponse`; identity, submission, quota, and thread list responses expose optional typed state metadata (`identity_state`, `query_state`, `sync_state`) ([87f54eb](https://github.com/Sendmux/sendmux-sdk/commit/87f54eb1679994ddcbdd68ad25d674ad6978f57f)). See [Migrate from 1.x to 2.0](README.md#migrate-from-1x-to-20).

### Bug Fixes

* prepare mailbox SDK major releases ([dc01472](https://github.com/Sendmux/sendmux-sdk/commit/dc014724f7f6eb6b93293e6acbcc1a36c5060ebb))
* **sdk:** preserve streaming arguments and prepare PHP OAuth release ([#207](https://github.com/Sendmux/sendmux-sdk/issues/207)) ([c534588](https://github.com/Sendmux/sendmux-sdk/commit/c53458875cef0bbd601c982308d84bc4e87c961c))

## [1.6.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.5.0...ts-mailbox-v1.6.0) (2026-09-10)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))


### Bug Fixes

* resolve TypeScript credential providers once per request ([4740163](https://github.com/Sendmux/sendmux-sdk/commit/474016356e4e307497ef875acbf62a988e16f96c))

## [1.5.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.4.1...ts-mailbox-v1.5.0) (2026-09-08)


### Features

* expose short-lived attachment download URLs, upload intents, typed event streaming, and file attachment helpers

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))

## [1.4.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.4.0...ts-mailbox-v1.4.1) (2026-08-19)


### Bug Fixes

* **ts:** preserve nullable enum members ([40868fe](https://github.com/Sendmux/sendmux-sdk/commit/40868fee3ea8ccd4f40ef4588ce942980a3329ff))

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.3.0...ts-mailbox-v1.4.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.2.0...ts-mailbox-v1.3.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.1.0...ts-mailbox-v1.2.0) (2026-07-03)


### Features

* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))
* **sdk:** make mailbox attachments agent-ready ([457ed62](https://github.com/Sendmux/sendmux-sdk/commit/457ed62cf32c91aeac1cfe230d50f4f0b922e7cb))


### Bug Fixes

* **sdk:** harden attachment helper streaming ([f848991](https://github.com/Sendmux/sendmux-sdk/commit/f8489914c035b2ef032a0dead4b4bedcc30172ba))
* **sdk:** preserve attachment compatibility checks ([e92a1c2](https://github.com/Sendmux/sendmux-sdk/commit/e92a1c250a062f2f39a4f78c166c9e3a743e97ee))
* **sdk:** regenerate attachment download auth models ([6803890](https://github.com/Sendmux/sendmux-sdk/commit/6803890bad5aba610d5c6ad16ca98d7186ef9347))
* **sdk:** tolerate realtime events without attachments ([2d2b117](https://github.com/Sendmux/sendmux-sdk/commit/2d2b117945445b0478cf3f1d4f07b1038097f05f))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.0.1...ts-mailbox-v1.1.0) (2026-07-01)


### Features

* add TypeScript SDK reference implementation ([3b38a86](https://github.com/Sendmux/sendmux-sdk/commit/3b38a860d5ff6c2d6bfb30e7f75e1405b6ab3e45))

## [1.0.1](https://github.com/Sendmux/sendmux-sdk/compare/ts-mailbox-v1.0.0...ts-mailbox-v1.0.1) (2026-07-01)


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
