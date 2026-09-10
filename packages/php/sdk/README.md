# sendmux/sdk

[![Packagist version](https://img.shields.io/packagist/v/sendmux/sdk.svg)](https://packagist.org/packages/sendmux/sdk)
[![PHP version](https://img.shields.io/packagist/dependency-v/sendmux/sdk/php.svg)](https://packagist.org/packages/sendmux/sdk)
[![License](https://img.shields.io/packagist/l/sendmux/sdk.svg)](https://packagist.org/packages/sendmux/sdk)

Umbrella package for Sendmux PHP SDK clients.

Read the PHP SDK guide at [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php).

## Requirements

- PHP 8.2 or newer.
- Composer.
- A Sendmux API key or REST OAuth grant for each API surface you call.

## Installation

```bash
composer require sendmux/sdk:^2.0
```

Upgrading from 1.x? Read the [PHP 2.0 migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING.md) before changing your Composer constraint.

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

For OAuth, use each factory’s `WithAccessToken` variant, such as `SendingFactory::createMetaApiWithAccessToken($accessToken)`. It accepts a bare token or a callable returning one; see [OAuth setup and lifecycle](https://sendmux.ai/docs/developer-tools/oauth).

## Included packages

| Package | Use it for | API key |
| --- | --- | --- |
| [`sendmux/core`](https://packagist.org/packages/sendmux/core) | Shared helpers for auth, headers, retries, pagination, and errors. | Any Sendmux API key. |
| [`sendmux/sending`](https://packagist.org/packages/sendmux/sending) | Sending API client. | `smx_mbx_` or owner-approved `smx_agent_` |
| [`sendmux/mailbox`](https://packagist.org/packages/sendmux/mailbox) | Mailbox API client. | `smx_mbx_` or scoped `smx_agent_` |
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
