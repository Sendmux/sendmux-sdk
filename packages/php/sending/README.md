# sendmux/sending

[![Packagist version](https://img.shields.io/packagist/v/sendmux/sending.svg)](https://packagist.org/packages/sendmux/sending)
[![PHP version](https://img.shields.io/packagist/dependency-v/sendmux/sending/php.svg)](https://packagist.org/packages/sendmux/sending)
[![License](https://img.shields.io/packagist/l/sendmux/sending.svg)](https://packagist.org/packages/sendmux/sending)

Sendmux Sending API client for PHP.

Read the PHP SDK guide at [docs.sendmux.ai/sdks/php](https://docs.sendmux.ai/sdks/php).

## Requirements

- PHP 8.2 or newer.
- Composer.
- A mailbox-scoped API key with the `smx_mbx_` prefix.

## Installation

```bash
composer require sendmux/sending:^1.0
```

## Usage

Create the API group client with a mailbox-scoped key.

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Sendmux\Sending\ClientFactory;

$emails = ClientFactory::createEmailsApi(
    getenv('SENDMUX_MAILBOX_API_KEY') ?: ''
);

$meta = ClientFactory::createMetaApi(
    getenv('SENDMUX_MAILBOX_API_KEY') ?: ''
);
```

The generated `EmailsApi` exposes `sendingSendEmail()` and `sendingSendEmailBatch()`. The generated `MetaApi` exposes `sendingGetOpenApiSpec()`.

## Features

- Validates `smx_mbx_` API keys before configuring the client.
- Uses `https://smtp.sendmux.ai/api/v1` by default.
- Adds retry and rate-limit backoff behaviour through `sendmux/core`.
- Maps generated API responses into the shared Sendmux envelope and error model.
- Includes generated models for single-send and batch-send requests and responses.

## Related packages

| Package | Use it for |
| --- | --- |
| [`sendmux/core`](https://packagist.org/packages/sendmux/core) | Shared helpers for auth, headers, retries, pagination, and errors. |
| [`sendmux/mailbox`](https://packagist.org/packages/sendmux/mailbox) | Mailbox API client. |
| [`sendmux/management`](https://packagist.org/packages/sendmux/management) | Management API client. |
| [`sendmux/sdk`](https://packagist.org/packages/sendmux/sdk) | Umbrella package that installs all PHP SDK surfaces. |

## Support

For help, include the package name, version, API surface, and sanitised request details. Do not include API keys, tokens, passwords, webhook secrets, customer data, or private account details.

- PHP SDK guide: [docs.sendmux.ai/sdks/php](https://docs.sendmux.ai/sdks/php)
- Sending API reference: [docs.sendmux.ai/sending-api/introduction](https://docs.sendmux.ai/sending-api/introduction)
- API keys guide: [docs.sendmux.ai/guides/api-keys](https://docs.sendmux.ai/guides/api-keys)
- Source repository: [github.com/Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## License

MIT. See [LICENSE](LICENSE).
