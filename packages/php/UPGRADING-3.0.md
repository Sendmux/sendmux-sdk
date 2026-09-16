# Migrate PHP Mailbox and SDK from 2.x to 3.0

This guide is for PHP applications that use `sendmux/mailbox` or the
`sendmux/sdk` umbrella package. Version 3.0 changes the successful response
models for `mailboxGetChanges()` so both legacy and typed changes retain
their data. It also separates thread-message list responses and replaces
generic list metadata with operation-specific models. Update your Composer
constraint, response type declarations, and manually constructed metadata.

The core, Sending, and Management packages use `^2.1.1` dependency
constraints for maintained HTTP security fixes. They remain on 2.x.

## Before you begin

- Use PHP 8.2 or newer and Composer.
- Commit your application, `composer.json`, and `composer.lock` so you can
  restore them together if you need to roll back.
- Before updating Mailbox directly, confirm that Packagist lists
  [`sendmux/mailbox` version 3.0.0](https://packagist.org/packages/sendmux/mailbox)
  and [`sendmux/core` version 2.1.1](https://packagist.org/packages/sendmux/core).
  Before updating the umbrella SDK, confirm that Packagist lists
  [`sendmux/sdk` version 3.0.0](https://packagist.org/packages/sendmux/sdk),
  [`sendmux/mailbox` version 3.0.0](https://packagist.org/packages/sendmux/mailbox),
  and version 2.1.1 of [`sendmux/core`](https://packagist.org/packages/sendmux/core),
  [`sendmux/sending`](https://packagist.org/packages/sendmux/sending), and
  [`sendmux/management`](https://packagist.org/packages/sendmux/management).
  Until Packagist lists every version required for your installation path,
  retain your existing Composer constraints.
- If you use 1.x, apply the [PHP 2.0 migration guide](UPGRADING.md) first.
- If your custom Guzzle client uses `FileCookieJar` or `SessionCookieJar`,
  back up its state and re-authenticate into a fresh jar when upgrading.
  Guzzle rejects old records without a boolean `HostOnly`; do not guess
  that value. Default Sendmux clients do not enable cookies. See the
  [upstream migration warning](https://github.com/guzzle/guzzle/security/advisories/GHSA-wm3w-8rrp-j577).

## Upgrade your application

1. In your application directory, update the package you install directly.
   For the umbrella SDK, run:

   ```bash
   composer require sendmux/sdk:^3.0 --with-all-dependencies
   ```

   If you install only Mailbox, run this command instead:

   ```bash
   composer require sendmux/mailbox:^3.0 --with-all-dependencies
   ```

   If both packages are direct dependencies, update both in one command:

   ```bash
   composer require sendmux/sdk:^3.0 sendmux/mailbox:^3.0 \
     --with-all-dependencies
   ```

   Composer resolves Mailbox and the umbrella SDK, when installed, to 3.x.
   The umbrella SDK keeps core, Sending, and Management on 2.x.

2. Replace assumptions about `MailboxGetChanges200Response` in your imports,
   type declarations, subclasses, and response handling. For example, a
   wrapper that previously expected only the typed data model looked like:

   ```php
   use Sendmux\Mailbox\Model\MailboxGetChanges200Response;
   use Sendmux\Mailbox\Model\MailboxTypedChanges;

   function changesData(
       MailboxGetChanges200Response $response
   ): MailboxTypedChanges {
       return $response->getData();
   }
   ```

   Accept both successful response models and their corresponding data:

   ```php
   use Sendmux\Mailbox\Model\MailboxChanges;
   use Sendmux\Mailbox\Model\MailboxChangesResponse;
   use Sendmux\Mailbox\Model\MailboxTypedChanges;
   use Sendmux\Mailbox\Model\MailboxTypedChangesResponse;

   function changesData(
       MailboxChangesResponse|MailboxTypedChangesResponse $response
   ): MailboxChanges|MailboxTypedChanges {
       return $response->getData();
   }
   ```

   Legacy data provides `getCreated()`, `getUpdated()`, `getDestroyed()`,
   and `getNewState()`. Typed data provides `getTypes()`; for example,
   `getTypes()->getMessages()` returns `MailboxChanges` or null when that
   type is absent. Branch on the model before using model-specific getters.

   Apply the same change to responses from `mailboxGetChangesWithHttpInfo()`
   and resolved asynchronous calls. Method arguments are unchanged.
   With the default client, non-success responses still raise `ApiException`.
   Invalid JSON raises `ApiException`; valid JSON matching neither response
   model raises `UnexpectedValueException`. The declared `ApiError` union
   member remains unchanged; the breaking change concerns successful responses.

3. Replace `MailboxMessageSummaryCursorListResponse` with
   `MailboxThreadMessageSummaryCursorListResponse` wherever you type a
   successful `mailboxListThreadMessages()` result. Both classes remain
   available, but neither extends the other. Ordinary message-list responses
   still use `MailboxMessageSummaryCursorListResponse`.

   Apply the replacement to all four call forms:

   | Method | Successful result location |
   | --- | --- |
   | `mailboxListThreadMessages()` | Return value |
   | `mailboxListThreadMessagesWithHttpInfo()` | First element of `[response, status, headers]` |
   | `mailboxListThreadMessagesAsync()` | Resolved promise value |
   | `mailboxListThreadMessagesAsyncWithHttpInfo()` | First element of the resolved tuple |

   Update imports, typed wrappers, subclass overrides, and promise callbacks.
   For example, replace the old wrapper declaration:

   ```php
   use Sendmux\Mailbox\Model\MailboxMessageSummaryCursorListResponse;

   function threadRequestId(
       MailboxMessageSummaryCursorListResponse $response
   ): string {
       return $response->getMeta()->getRequestId();
   }
   ```

   Use the distinct thread response instead:

   ```php
   use Sendmux\Mailbox\Model\MailboxThreadMessageSummaryCursorListResponse;

   function threadRequestId(
       MailboxThreadMessageSummaryCursorListResponse $response
   ): string {
       return $response->getMeta()->getRequestId();
   }
   ```

   Method arguments, HTTP-info tuple structure, and the declared `ApiError`
   union member are unchanged.

4. Replace `ResponseMeta` in typed metadata consumers and in manually
   constructed response fixtures. For these five existing response classes,
   both `getMeta()` and `setMeta()` change from `ResponseMeta` to the listed
   class in `Sendmux\Mailbox\Model`:

   | Response class | 3.0 metadata class | Optional state field |
   | --- | --- | --- |
   | `MailboxIdentityCursorListResponse` | `MailboxIdentityListMeta` | `identity_state` |
   | `MailboxMessageSummaryCursorListResponse` | `MailboxSyncMeta` | `sync_state` |
   | `MailboxQuotaCursorListResponse` | `MailboxQueryMeta` | `query_state` |
   | `MailboxSubmissionCursorListResponse` | `MailboxQueryMeta` | `query_state` |
   | `MailboxThreadSummaryCursorListResponse` | `MailboxQueryMeta` | `query_state` |

   Each class requires `request_id`; none extends `ResponseMeta`. For example,
   replace `new ResponseMeta(['request_id' => 'request_example'])` with
   `new MailboxSyncMeta(['request_id' => 'request_example'])` when constructing
   an ordinary message-list response or calling its `setMeta()` method.

   The distinct thread-message response uses `MailboxThreadMessagesMeta`,
   which requires both `request_id` and `thread_id`; `sync_state` is optional.
   An empty `data` list does not remove the thread ID requirement. When you
   validate manually constructed responses, validate their metadata explicitly:
   the envelope's `valid()` does not recursively validate nested metadata.

   With your application's Composer autoloader loaded, this fixture needs no
   API call and prints `request_example thread_example`:

   ```php
   use Sendmux\Mailbox\Model\CursorPagination;
   use Sendmux\Mailbox\Model\MailboxThreadMessageSummaryCursorListResponse;
   use Sendmux\Mailbox\Model\MailboxThreadMessagesMeta;

   $meta = new MailboxThreadMessagesMeta([
       'request_id' => 'request_example',
       'thread_id' => 'thread_example',
   ]);
   $response = new MailboxThreadMessageSummaryCursorListResponse();
   $response->setMeta($meta);
   $response->setOk(true);
   $response->setData([]);
   $response->setPagination(new CursorPagination(['has_more' => false]));
   if (!$response->valid() || !$response->getMeta()->valid()) {
       throw new UnexpectedValueException('Invalid thread response or metadata');
   }
   echo $response->getMeta()->getRequestId(), ' ',
       $response->getMeta()->getThreadId(), PHP_EOL;
   ```

## Verify the migration

Run this command in your application directory:

```bash
composer show 'sendmux/*'
```

Confirm that Mailbox and the umbrella SDK, if installed, are 3.x, while
core, Sending, and Management remain 2.x. Run your application's type checks
and tests for legacy changes, typed changes, thread-message lists, metadata
construction, and failed requests. Successful responses must preserve the
matching data model. Test empty ordinary and thread-message lists with absent
optional state, and explicitly reject thread metadata missing `thread_id`.
Malformed JSON and non-success requests must still follow your `ApiException`
handling; unmatched valid JSON, including `null`, must follow your
`UnexpectedValueException` handling.

## Roll back

Restore the application code, `composer.json`, and `composer.lock` from the
same pre-upgrade revision, then run `composer install`. This package change
does not migrate server data; returning to 2.x also returns to its previous
changes-response behavior.

For client setup and API methods, see the [Mailbox package guide](mailbox/README.md).
