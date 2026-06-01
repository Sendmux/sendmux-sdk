<?php

declare(strict_types=1);

namespace Sendmux\Management;

use Sendmux\Management\Api\BillingApi;
use Sendmux\Management\Api\DomainFiltersApi;
use Sendmux\Management\Api\DomainsApi;
use Sendmux\Management\Api\EmailsApi;
use Sendmux\Management\Api\InboxesApi;
use Sendmux\Management\Api\MailboxFiltersApi;
use Sendmux\Management\Api\MailboxesApi;
use Sendmux\Management\Api\SendingAccountsApi;
use Sendmux\Management\Api\WebhooksApi;
use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\HandlerStack;
use Sendmux\Core\ApiKeySurface;
use Sendmux\Core\Auth;
use Sendmux\Core\RetryMiddleware;
use Sendmux\Core\RetryOptions;

final class ClientFactory
{
    public static function configuration(string $apiKey, ?string $baseUrl = null): Configuration
    {
        $configuration = new Configuration();
        if ($baseUrl !== null && $baseUrl !== '') {
            $configuration->setHost($baseUrl);
        }

        /** @var Configuration $configured */
        $configured = Auth::configureBearer($configuration, $apiKey, ApiKeySurface::Root);
        return $configured;
    }

    public static function httpClient(?RetryOptions $retryOptions = null): ClientInterface
    {
        $stack = HandlerStack::create();
        $stack->push(RetryMiddleware::create($retryOptions), 'sendmux_retry');

        return new Client(['handler' => $stack]);
    }

    public static function createBillingApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): BillingApi {
        return new BillingApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createDomainFiltersApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): DomainFiltersApi {
        return new DomainFiltersApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createDomainsApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): DomainsApi {
        return new DomainsApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createEmailsApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): EmailsApi {
        return new EmailsApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createInboxesApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): InboxesApi {
        return new InboxesApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createMailboxFiltersApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): MailboxFiltersApi {
        return new MailboxFiltersApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createMailboxesApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): MailboxesApi {
        return new MailboxesApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createSendingAccountsApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): SendingAccountsApi {
        return new SendingAccountsApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }

    public static function createWebhooksApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): WebhooksApi {
        return new WebhooksApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }
}
