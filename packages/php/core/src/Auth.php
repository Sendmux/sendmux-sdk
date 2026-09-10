<?php

declare(strict_types=1);

namespace Sendmux\Core;

use InvalidArgumentException;
use GuzzleHttp\Middleware;
use Psr\Http\Message\RequestInterface;

final class Auth
{
    /** @param string|callable(): string $accessToken */
    public static function accessTokenMiddleware(string|callable $accessToken): callable
    {
        if (is_string($accessToken)) {
            self::assertAccessToken($accessToken);
        }

        return Middleware::mapRequest(static function (RequestInterface $request) use ($accessToken): RequestInterface {
            $token = is_string($accessToken) ? $accessToken : $accessToken();
            self::assertAccessToken($token);
            return $request->withHeader('Authorization', 'Bearer ' . $token);
        });
    }

    private static function assertAccessToken(mixed $token): void
    {
        if (!is_string($token) || preg_match('/\A[A-Za-z0-9._~+\/-]+=*\z/D', $token) !== 1) {
            throw new InvalidArgumentException('Access token must be a non-empty RFC 6750 bearer token');
        }
    }

    public static function assertApiKeySurface(string $apiKey, ApiKeySurface $expected): ApiKeySurface
    {
        $isMailboxKey = str_starts_with($apiKey, 'smx_mbx_');
        $isAgentToken = str_starts_with($apiKey, 'smx_agent_');
        $actual = $isMailboxKey || $isAgentToken
            ? ApiKeySurface::Mailbox
            : (str_starts_with($apiKey, 'smx_root_') ? ApiKeySurface::Root : null);

        if ($actual === null) {
            throw new InvalidArgumentException('Sendmux API keys must start with smx_root_, smx_mbx_, or smx_agent_');
        }

        $isCompatible = $actual === $expected
            || ($expected === ApiKeySurface::Sending && ($isMailboxKey || $isAgentToken))
            || ($expected === ApiKeySurface::Mailbox && $actual === ApiKeySurface::Mailbox);

        if (!$isCompatible) {
            throw new InvalidArgumentException(sprintf(
                'Expected a %s API key, received a %s API key',
                $expected->value,
                $actual->value
            ));
        }

        return $actual;
    }

    public static function configureBearer(object $configuration, string $apiKey, ApiKeySurface $expected): object
    {
        self::assertApiKeySurface($apiKey, $expected);

        if (!method_exists($configuration, 'setAccessToken')) {
            throw new InvalidArgumentException('Generated configuration does not support bearer access tokens');
        }

        $configuration->setAccessToken($apiKey);
        return $configuration;
    }
}
