# Changelog

## [3.0.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v2.0.0...go/v3.0.0) (2026-09-21)


### ⚠ BREAKING CHANGES

* **go:** the module path is sendmux.ai/go/v3 (tag go/v3.0.0). Change the go.mod requirement and every sendmux.ai/go/v2/... import to sendmux.ai/go/v3/... together, then run go mod tidy; sendmux.ai/go/v2 v2.0.0 and sendmux.ai/go v1.6.1 keep working unchanged and are not retracted. See the README section "Version 3 migration".
* **go:** the Go mailbox and management packages drop the Nil<Union>1 member fields of the eight provider quota unions and de-wrap five nullable fields to their canonical types; see the evidence file for the full list.

### Bug Fixes

* **go:** keep the quota union member API of v2.0.0 as deprecated shims ([a1bbfdb](https://github.com/Sendmux/sendmux-sdk/commit/a1bbfdb1900fe0b86b87d74c1ba55cf9ca445e64))
* **go:** move the module path to sendmux.ai/go/v3 ([312ec46](https://github.com/Sendmux/sendmux-sdk/commit/312ec469a2c411ce092ea756bf1dcc5d1cb4a42b))
* **go:** regenerate against the deployed v1.8.250 schema removes the quota union member fields and de-wraps five nullable fields ([628561d](https://github.com/Sendmux/sendmux-sdk/commit/628561d72e4094163b742923211140a6618755e2))
* **go:** regenerate mailbox and management types from the deployed v1.8.250 schema ([99bf0b1](https://github.com/Sendmux/sendmux-sdk/commit/99bf0b15b521cba5889346ef1c3a283d74c9e617))

## [2.0.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.6.1...go/v2.0.0) (2026-09-19)


### Changed

* **Breaking:** the module path is `sendmux.ai/go/v2` (tag `go/v2.0.0`). Change the `go.mod` requirement and every `sendmux.ai/go/...` import to `sendmux.ai/go/v2/...` together, then `go mod tidy`; v1 (`sendmux.ai/go`, last release `go/v1.6.1`) is unchanged and not retracted ([dc01472](https://github.com/Sendmux/sendmux-sdk/commit/dc014724f7f6eb6b93293e6acbcc1a36c5060ebb)). See [Version 2 migration](README.md#version-2-migration).
* **Breaking (mailbox):** `MailboxListThreadMessages` returns `*MailboxThreadMessageSummaryCursorListResponse` (required `Meta.ThreadID`, optional `Meta.SyncState`); `*MailboxMessageSummaryCursorListResponse` no longer satisfies `MailboxListThreadMessagesRes`. `MailboxListMessages` keeps its type and gains optional `Meta.SyncState`; identity, quota, submission and thread list metadata gain typed `IdentityState` or `QueryState` ([87f54eb](https://github.com/Sendmux/sendmux-sdk/commit/87f54eb1679994ddcbdd68ad25d674ad6978f57f)). `MailboxMessage.Attachments` is `[]MailboxAttachment`, the type `MailboxMessageSummary` and `MailboxMessageContent` already use, and `GetAttachments`/`SetAttachments` follow it; the v1-only `MailboxMessageAttachmentsItem` type is removed. Replace the type name; the fields are the same ([1653051](https://github.com/Sendmux/sendmux-sdk/commit/1653051b2ad74ce815e609fafd23c21e1334679a)).
* **Breaking (management):** `ProviderItemCursorListResponse.Data` is `[]ProviderListItem`, which carries no `Variables`; `ProviderItem`, `ProviderCreateBody`, `ProviderUpdateBody`, `OptProviderCreateBody`, `OptProviderUpdateBody` and `DeliveryLogItem` gain map or slice fields and are no longer comparable ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a)).

### Added

* **management:** `ProviderItem.Variables`, `ProviderCreateBody.Variables` and `ProviderUpdateBody.Variables` (`ProviderVariables`, `map[string]string`), `ProviderAllowedActions.UpdateVariables`, and `DeliveryGroup []string` on `DeliveryLogItem` and `DeliveryLogDetail` ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a)).
* **sending:** `EmailSendRequest.DeliveryGroup` narrows the eligible provider pool for one send to a delivery group or a list of groups; build it with `NewStringEmailSendRequestDeliveryGroup` or `NewStringArrayEmailSendRequestDeliveryGroup` inside `NewOptEmailSendRequestDeliveryGroup` ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a)).


### ⚠ BREAKING CHANGES

* **go:** `mailbox.MailboxMessageAttachmentsItem` and its accessors are removed; `MailboxMessage.Attachments`, `(*MailboxMessage).GetAttachments` and `(*MailboxMessage).SetAttachments` use `[]mailbox.MailboxAttachment`. Replace the removed type name with `mailbox.MailboxAttachment`; the fields are the same.

### Features

* integrate combined provider variables and delivery routing ([81bbf22](https://github.com/Sendmux/sendmux-sdk/commit/81bbf221a357bf5d588eba654184ff34491473df))
* **sdk:** add provider variables and delivery group routing ([94f52d4](https://github.com/Sendmux/sendmux-sdk/commit/94f52d4e9f6157e197308541cc5987517bac7a4a))


### Bug Fixes

* **go:** regenerate flattened mailbox and management response types ([1653051](https://github.com/Sendmux/sendmux-sdk/commit/1653051b2ad74ce815e609fafd23c21e1334679a))
* **live-e2e:** enforce safe ownership and fresh certification ([610e283](https://github.com/Sendmux/sendmux-sdk/commit/610e283b0f2bb17ecb36d55000ea3416488d20f8))
* **live-e2e:** Go journal path, Go plan-failure contract, deleted-tombstone teardown ([d2e027d](https://github.com/Sendmux/sendmux-sdk/commit/d2e027d43ae9451304c0e71b2d700bfe3fd6289c))
* prepare mailbox SDK major releases ([dc01472](https://github.com/Sendmux/sendmux-sdk/commit/dc014724f7f6eb6b93293e6acbcc1a36c5060ebb))
* regenerate SDKs from the deployed flattened response schemas (docs 86b0f45) ([628b161](https://github.com/Sendmux/sendmux-sdk/commit/628b161d2692775ac1f4830c1d64c024ba04ed83))
* **sdk:** adopt final provider contract description and provenance ([a9bdaf5](https://github.com/Sendmux/sendmux-sdk/commit/a9bdaf58f0db684328458e269ba8aff515334d0b))
* **sdk:** adopt final provider contract description and provenance ([815278e](https://github.com/Sendmux/sendmux-sdk/commit/815278e76587dcba314c51202b8e764250e51ef3))

## [1.6.1](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.6.0...go/v1.6.1) (2026-09-11)


### Bug Fixes

* **sdk:** preserve streaming arguments and prepare PHP OAuth release ([#207](https://github.com/Sendmux/sendmux-sdk/issues/207)) ([c534588](https://github.com/Sendmux/sendmux-sdk/commit/c53458875cef0bbd601c982308d84bc4e87c961c))

## [1.6.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.5.0...go/v1.6.0) (2026-09-11)


### Features

* add REST OAuth clients and CLI token lifecycle ([cc4a3aa](https://github.com/Sendmux/sendmux-sdk/commit/cc4a3aa6110378641418a94455ed5b9a986e65ff))

## [1.5.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.4.1...go/v1.5.0) (2026-09-08)


### Features

* add connection checks across SDKs, CLI and MCP ([77f449e](https://github.com/Sendmux/sendmux-sdk/commit/77f449e2c8cba49bc8bc84c49c35baa61120866a))
* **sdk:** add connection checks across clients, CLI and MCP ([3e02c67](https://github.com/Sendmux/sendmux-sdk/commit/3e02c67dcab45e37dad7abbdd4c4e1bd0b1fbbe6))


### Bug Fixes

* preserve existing Handler and Invoker implementations when adding connection checks
* reject mailbox email line breaks in generated clients ([7934cbe](https://github.com/Sendmux/sendmux-sdk/commit/7934cbe13f1d966878239e7c1d9e75ba44927937))
* sync mailbox reliability clients ([fad78fa](https://github.com/Sendmux/sendmux-sdk/commit/fad78faf1d495c31bc0e0c40ef7d605f72727431))
* sync mailbox reliability clients ([e8e7148](https://github.com/Sendmux/sendmux-sdk/commit/e8e7148e21f8fdba790c89331e8a2e144f86be4b))

## [1.4.1](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.4.0...go/v1.4.1) (2026-08-07)


### Bug Fixes

* **go:** preserve API errors with response headers ([e23f33a](https://github.com/Sendmux/sendmux-sdk/commit/e23f33aee2f39d6efeca545d7a48ff792aac3370))
* **sdk:** regenerate management clients for the Amazon SES identity fields ([#137](https://github.com/Sendmux/sendmux-sdk/issues/137)) ([b0a3d63](https://github.com/Sendmux/sendmux-sdk/commit/b0a3d63f7d836d3d0e290a5b8c4e315a1a017e43))

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.3.0...go/v1.4.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.2.0...go/v1.3.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.1.0...go/v1.2.0) (2026-07-03)


### Features

* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))
* **sdk:** make mailbox attachments agent-ready ([457ed62](https://github.com/Sendmux/sendmux-sdk/commit/457ed62cf32c91aeac1cfe230d50f4f0b922e7cb))


### Bug Fixes

* **sdk:** preserve attachment compatibility checks ([e92a1c2](https://github.com/Sendmux/sendmux-sdk/commit/e92a1c250a062f2f39a4f78c166c9e3a743e97ee))
* **sdk:** regenerate attachment download auth models ([6803890](https://github.com/Sendmux/sendmux-sdk/commit/6803890bad5aba610d5c6ad16ca98d7186ef9347))
* **sdk:** sync attachment download security metadata ([8c133dd](https://github.com/Sendmux/sendmux-sdk/commit/8c133dd489f0e7c07de79df229778dd2e04a6f74))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.0.1...go/v1.1.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))

## [1.0.1](https://github.com/Sendmux/sendmux-sdk/compare/go/v1.0.0...go/v1.0.1) (2026-06-19)


### Bug Fixes

* **go:** add module license for pkg.go.dev ([db8da37](https://github.com/Sendmux/sendmux-sdk/commit/db8da372cc5c66024c7c53e1f4361063e2fa9faa))

## 1.0.0 (2026-06-01)


### Features

* **go:** add generated SDK packages ([8b8a732](https://github.com/Sendmux/sendmux-sdk/commit/8b8a73223c27bdb8c4cdea24c494b97b6cbd9293))
