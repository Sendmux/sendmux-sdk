# Changelog

## Unreleased

### Changed

- Breaking: successful `mailboxGetChanges()` responses use `MailboxChangesResponse` or `MailboxTypedChangesResponse` instead of `MailboxGetChanges200Response`. Update typed wrappers and response handling for the two data models; see the [3.0 migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING-3.0.md).
- Apply the same response-model selection to HTTP-info and asynchronous calls. Reject success bodies that match neither declared model instead of producing an incomplete model.

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
