# Changelog

## Unreleased

### Changed

- Breaking: successful `mailboxGetChanges()` responses use `MailboxChangesResponse` or `MailboxTypedChangesResponse` instead of `MailboxGetChanges200Response`. Update typed wrappers and response handling for the two data models; see the [3.0 migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING-3.0.md).
- Breaking: `mailboxListThreadMessages()` uses `MailboxThreadMessageSummaryCursorListResponse` instead of `MailboxMessageSummaryCursorListResponse`, including HTTP-info and resolved asynchronous forms. Five existing list responses replace `ResponseMeta` getter/setter types with operation-specific metadata classes. Update typed consumers and manual fixtures using the [response and metadata migration steps](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING-3.0.md#upgrade-your-application); thread-message metadata requires `thread_id` and permits absent `sync_state`.
- Apply the same response-model selection to HTTP-info and asynchronous calls. Reject success bodies that match neither declared model instead of producing an incomplete model.
- Breaking: `MailboxRealtimeMessage::getBody()` and `setBody()` use `MailboxRealtimeMessageBody` instead of `MailboxRealtimeMessageAllOfBody`, and the unused `Sendmux\Mailbox\Model\Mailbox` class is removed; `mailboxGetMe()` still returns `MailboxMeItemResponse` with `MailboxMe` data. The wire format is unchanged: the API now publishes `MailboxMe`, `MailboxMessage`, `MailboxRealtimeMessage`, and `MailboxThread` as flat schemas instead of `allOf` compositions. See the [3.0 migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING-3.0.md#upgrade-your-application).

### Fixed

- Reject a JSON `null` changes-response body with the documented `UnexpectedValueException` instead of PHP `Error`, across ordinary, HTTP-info, and asynchronous calls.

### Security

- Require Guzzle `^7.15.5`, PSR7 `^2.13.1`, and core `^2.1.1` for HTTP security fixes. If you use a custom persistent cookie jar, follow the [upgrade warning](README.md#installation) before updating.

## 2.1.0 (2026-09-11)

- Add `WithAccessToken` factories for REST OAuth tokens and callable providers.
- Require core 2.1 for OAuth authentication and retry handling.
- Preserve the published positional arguments for all five mailbox streaming methods.

## 2.0.0 (2026-09-08)

- Add `mailboxGetConnection()` without a target mailbox selector.
- Include short-lived attachment download URLs and upload intents.
- Preserve existing positional attachment arguments; append the optional download token after `contentType`.
- Require core 2.0 for scoped agent tokens.
- Reject malformed JSON consistently in synchronous and asynchronous responses.
- Validate missing required fields without passing null to string or pattern constraints.
- Breaking: message attachment getters can return null when the optional field is absent; see the [migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING.md).
