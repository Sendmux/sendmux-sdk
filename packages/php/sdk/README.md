# sendmux/sdk

[![Packagist version](https://img.shields.io/packagist/v/sendmux/sdk.svg)](https://packagist.org/packages/sendmux/sdk)
[![PHP version](https://img.shields.io/packagist/dependency-v/sendmux/sdk/php.svg)](https://packagist.org/packages/sendmux/sdk)
[![License](https://img.shields.io/packagist/l/sendmux/sdk.svg)](https://packagist.org/packages/sendmux/sdk)

Umbrella package for Sendmux PHP SDK clients.

Read the PHP SDK guide at [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php).

## Requirements

- PHP 8.2 or newer.
- Composer.
- A Sendmux API key for each API surface you call.

## Installation

```bash
composer require sendmux/sdk:^1.0
```

## Usage

The umbrella package installs the core, sending, mailbox, and management packages together. Create clients through the surface package factories.

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Sendmux\Mailbox\ClientFactory as MailboxFactory;
use Sendmux\Management\ClientFactory as ManagementFactory;
use Sendmux\Sending\ClientFactory as SendingFactory;

$sending = SendingFactory::createEmailsApi(
    getenv('SENDMUX_MAILBOX_API_KEY') ?: ''
);

$mailbox = MailboxFactory::createMailboxAPIApi(
    getenv('SENDMUX_MAILBOX_API_KEY') ?: ''
);

$management = ManagementFactory::createMailboxesApi(
    getenv('SENDMUX_ROOT_API_KEY') ?: ''
);
```

> [!NOTE]
> `sendmux/sdk` installs all PHP SDK surfaces. It does not replace the surface factories.

## Included packages

| Package | Use it for | API key |
| --- | --- | --- |
| [`sendmux/core`](https://packagist.org/packages/sendmux/core) | Shared helpers for auth, headers, retries, pagination, and errors. | Any Sendmux API key. |
| [`sendmux/sending`](https://packagist.org/packages/sendmux/sending) | Sending API client. | `smx_mbx_` |
| [`sendmux/mailbox`](https://packagist.org/packages/sendmux/mailbox) | Mailbox API client. | `smx_mbx_` |
| [`sendmux/management`](https://packagist.org/packages/sendmux/management) | Management API client. | `smx_root_` |

The package also exposes `Sendmux\Sdk\Sdk::VERSION` for package-version checks.

## Support

For help, include the package name, version, API surface, and sanitised request details. Do not include API keys, tokens, passwords, webhook secrets, customer data, or private account details.

- PHP SDK guide: [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php)
- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- API keys guide: [sendmux.ai/docs/guides/api-keys](https://sendmux.ai/docs/guides/api-keys)
- Source repository: [github.com/Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## License

MIT. See [LICENSE](LICENSE).
