# sendmux/mailbox

[![Packagist version](https://img.shields.io/packagist/v/sendmux/mailbox.svg)](https://packagist.org/packages/sendmux/mailbox)
[![PHP version](https://img.shields.io/packagist/dependency-v/sendmux/mailbox/php.svg)](https://packagist.org/packages/sendmux/mailbox)
[![License](https://img.shields.io/packagist/l/sendmux/mailbox.svg)](https://packagist.org/packages/sendmux/mailbox)

Sendmux Mailbox API client for PHP.

Read the PHP SDK guide at [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php).

## Requirements

- PHP 8.2 or newer.
- Composer.
- A mailbox-scoped API key with the `smx_mbx_` prefix.

## Installation

```bash
composer require sendmux/mailbox:^1.0
```

## Usage

Create the Mailbox API client with a mailbox-scoped key.

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Sendmux\Mailbox\ClientFactory;

$mailboxApi = ClientFactory::createMailboxAPIApi(
    getenv('SENDMUX_MAILBOX_API_KEY') ?: ''
);
```

The generated `MailboxAPIApi` exposes mailbox methods such as `mailboxGetMe()`, `mailboxListMessages()`, `mailboxSendMessage()`, and `mailboxUploadAttachment()`.

## Features

- Validates `smx_mbx_` API keys before configuring the client.
- Uses `https://app.sendmux.ai/api/v1` by default.
- Adds retry and rate-limit backoff behaviour through `sendmux/core`.
- Covers mailbox identity, folders, messages, attachments, submissions, threads, quota, usage, and event streams.
- Includes generated models for Mailbox API requests and responses.

## Related packages

| Package | Use it for |
| --- | --- |
| [`sendmux/core`](https://packagist.org/packages/sendmux/core) | Shared helpers for auth, headers, retries, pagination, and errors. |
| [`sendmux/sending`](https://packagist.org/packages/sendmux/sending) | Sending API client. |
| [`sendmux/management`](https://packagist.org/packages/sendmux/management) | Management API client. |
| [`sendmux/sdk`](https://packagist.org/packages/sendmux/sdk) | Umbrella package that installs all PHP SDK surfaces. |

## Support

For help, include the package name, version, API surface, and sanitised request details. Do not include API keys, tokens, passwords, webhook secrets, customer data, or private account details.

- PHP SDK guide: [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- API keys guide: [sendmux.ai/docs/guides/api-keys](https://sendmux.ai/docs/guides/api-keys)
- Source repository: [github.com/Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## License

MIT. See [LICENSE](LICENSE).
