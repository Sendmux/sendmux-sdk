# sendmux/management

[![Packagist version](https://img.shields.io/packagist/v/sendmux/management.svg)](https://packagist.org/packages/sendmux/management)
[![PHP version](https://img.shields.io/packagist/dependency-v/sendmux/management/php.svg)](https://packagist.org/packages/sendmux/management)
[![License](https://img.shields.io/packagist/l/sendmux/management.svg)](https://packagist.org/packages/sendmux/management)

Sendmux Management API client for PHP.

Read the PHP SDK guide at [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php).

## Requirements

- PHP 8.2 or newer.
- Composer.
- A team-scoped API key with the `smx_root_` prefix.

## Installation

```bash
composer require sendmux/management:^2.0
```

Upgrading from 1.x? Read the [PHP 2.0 migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING.md) before changing your Composer constraint.

## Usage

Create the generated API group you need with a team-scoped key.

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Sendmux\Management\ClientFactory;

$connection = ClientFactory::createConnectionApi(
    getenv('SENDMUX_ROOT_API_KEY') ?: ''
);

$mailboxes = ClientFactory::createMailboxesApi(
    getenv('SENDMUX_ROOT_API_KEY') ?: ''
);

$domains = ClientFactory::createDomainsApi(
    getenv('SENDMUX_ROOT_API_KEY') ?: ''
);

$webhooks = ClientFactory::createWebhooksApi(
    getenv('SENDMUX_ROOT_API_KEY') ?: ''
);
```

Use `$connection->managementGetConnection()` to test credentials and retrieve team and credential details.

The factory also exposes clients for billing, domain filters, emails, inboxes, mailbox filters, sending accounts, and webhooks.

## Features

- Validates `smx_root_` API keys before configuring the client.
- Uses `https://app.sendmux.ai/api/v1` by default.
- Adds retry and rate-limit backoff behaviour through `sendmux/core`.
- Covers domains, sending accounts, mailboxes, filters, webhooks, logs, metrics, and billing data.
- Includes generated models for Management API requests and responses.

## Related packages

| Package | Use it for |
| --- | --- |
| [`sendmux/core`](https://packagist.org/packages/sendmux/core) | Shared helpers for auth, headers, retries, pagination, and errors. |
| [`sendmux/sending`](https://packagist.org/packages/sendmux/sending) | Sending API client. |
| [`sendmux/mailbox`](https://packagist.org/packages/sendmux/mailbox) | Mailbox API client. |
| [`sendmux/sdk`](https://packagist.org/packages/sendmux/sdk) | Umbrella package that installs all PHP SDK surfaces. |

## Support

For help, include the package name, version, API surface, and sanitised request details. Do not include API keys, tokens, passwords, webhook secrets, customer data, or private account details.

- PHP SDK guide: [sendmux.ai/docs/sdks/php](https://sendmux.ai/docs/sdks/php)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- API keys guide: [sendmux.ai/docs/guides/api-keys](https://sendmux.ai/docs/guides/api-keys)
- Source repository: [github.com/Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## License

MIT. See [LICENSE](LICENSE).
