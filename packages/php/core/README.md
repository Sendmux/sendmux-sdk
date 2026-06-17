# sendmux/core

[![Packagist version](https://img.shields.io/packagist/v/sendmux/core.svg)](https://packagist.org/packages/sendmux/core)
[![PHP version](https://img.shields.io/packagist/dependency-v/sendmux/core/php.svg)](https://packagist.org/packages/sendmux/core)
[![License](https://img.shields.io/packagist/l/sendmux/core.svg)](https://packagist.org/packages/sendmux/core)

Shared runtime helpers for Sendmux PHP SDK packages.

Read the PHP SDK guide at [docs.sendmux.ai/sdks/php](https://docs.sendmux.ai/sdks/php).

## Requirements

- PHP 8.2 or newer.
- Composer.

## Installation

```bash
composer require sendmux/core:^1.0
```

## Usage

Use `sendmux/core` directly when you need the shared helper layer without a generated API client.

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Sendmux\Core\ApiKeySurface;
use Sendmux\Core\Auth;
use Sendmux\Core\Headers;
use Sendmux\Core\RetryOptions;

$apiKey = getenv('SENDMUX_MAILBOX_API_KEY') ?: '';

Auth::assertApiKeySurface($apiKey, ApiKeySurface::Mailbox);

$headers = array_merge(
    Headers::idempotency('order-123'),
    Headers::conditional(ifMatch: '"mailbox-etag"')
);

$retryOptions = new RetryOptions(maxAttempts: 3);
```

## Features

- `Auth` validates `smx_root_` and `smx_mbx_` API key prefixes and configures bearer auth on generated clients.
- `Headers` builds `Idempotency-Key`, `If-Match`, and `If-None-Match` header arrays.
- `Pagination::iterate()` streams cursor-paginated responses.
- `RetryMiddleware` and `RetryOptions` add retry and rate-limit backoff behaviour.
- `ErrorMapper` maps generated exceptions into `SendmuxApiError`.

## Package map

| Package | Use it for |
| --- | --- |
| [`sendmux/sending`](https://packagist.org/packages/sendmux/sending) | Sending API client. |
| [`sendmux/mailbox`](https://packagist.org/packages/sendmux/mailbox) | Mailbox API client. |
| [`sendmux/management`](https://packagist.org/packages/sendmux/management) | Management API client. |
| [`sendmux/sdk`](https://packagist.org/packages/sendmux/sdk) | Umbrella package that installs all PHP SDK surfaces. |

## Support

For help, include the package name, version, API surface, and sanitised request details. Do not include API keys, tokens, passwords, webhook secrets, customer data, or private account details.

- SDK docs: [docs.sendmux.ai/sdks/php](https://docs.sendmux.ai/sdks/php)
- API keys guide: [docs.sendmux.ai/guides/api-keys](https://docs.sendmux.ai/guides/api-keys)
- Source repository: [github.com/Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## License

MIT. See [LICENSE](LICENSE).
