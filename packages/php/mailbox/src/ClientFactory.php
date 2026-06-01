<?php

declare(strict_types=1);

namespace Sendmux\Mailbox;

use Sendmux\Mailbox\Api\MailboxAPIApi;
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

    public static function createMailboxAPIApi(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): MailboxAPIApi {
        return new MailboxAPIApi(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }
}
