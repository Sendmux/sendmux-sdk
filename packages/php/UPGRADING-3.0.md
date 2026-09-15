# Migrate PHP Mailbox and SDK from 2.x to 3.0

This guide is for PHP applications that use `sendmux/mailbox` or the
`sendmux/sdk` umbrella package. Version 3.0 changes the successful response
models for `mailboxGetChanges()` so both legacy and typed changes retain
their data. Update your Composer constraint and any code that assumes the
old response class.

The core, Sending, and Management packages use `^2.1.1` dependency
constraints for maintained HTTP security fixes. They remain on 2.x.

## Before you begin

- Use PHP 8.2 or newer and Composer.
- Commit your application, `composer.json`, and `composer.lock` so you can
  restore them together if you need to roll back.
- Before updating, confirm that Packagist lists
  [`sendmux/mailbox` version 3.0.0](https://packagist.org/packages/sendmux/mailbox)
  or [`sendmux/sdk` version 3.0.0](https://packagist.org/packages/sendmux/sdk),
  as applicable, and the required [`sendmux/core`](https://packagist.org/packages/sendmux/core),
  [`sendmux/sending`](https://packagist.org/packages/sendmux/sending), and
  [`sendmux/management`](https://packagist.org/packages/sendmux/management)
  dependencies at version 2.1.1. Until Packagist lists every required version,
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

## Verify the migration

Run this command in your application directory:

```bash
composer show 'sendmux/*'
```

Confirm that Mailbox and the umbrella SDK, if installed, are 3.x, while
core, Sending, and Management remain 2.x. Run your application's type checks
and tests for legacy changes, typed changes, and failed requests; successful
responses must preserve the matching data model, and failed requests must
still follow your `ApiException` handling.

## Roll back

Restore the application code, `composer.json`, and `composer.lock` from the
same pre-upgrade revision, then run `composer install`. This package change
does not migrate server data; returning to 2.x also returns to its previous
changes-response behavior.

For client setup and API methods, see the [Mailbox package guide](mailbox/README.md).
