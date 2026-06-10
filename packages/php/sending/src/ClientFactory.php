<?php

declare(strict_types=1);

namespace Sendmux\Sending;

use Sendmux\Sending\Api\EmailsApi;
use Sendmux\Sending\Api\MetaApi;
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
        $configured = Auth::configureBearer($configuration, $apiKey, ApiKeySurface::Mailbox);
        return $configured;
    }

    public static function httpClient(?RetryOptions $retryOptions = null): ClientInterface
    {
        $stack = HandlerStack::create();
        $stack->push(RetryMiddleware::create($retryOptions), 'sendmux_retry');

        return new Client(['handler' => $stack]);
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

    public static function createMetaApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): MetaApi {
        return new MetaApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }
}
