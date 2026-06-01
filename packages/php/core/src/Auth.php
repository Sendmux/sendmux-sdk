<?php

declare(strict_types=1);

namespace Sendmux\Core;

use InvalidArgumentException;

final class Auth
{
    public static function assertApiKeySurface(string $apiKey, ApiKeySurface $expected): ApiKeySurface
    {
        $actual = str_starts_with($apiKey, 'smx_mbx_')
            ? ApiKeySurface::Mailbox
            : (str_starts_with($apiKey, 'smx_root_') ? ApiKeySurface::Root : null);

        if ($actual === null) {
            throw new InvalidArgumentException('Sendmux API keys must start with smx_root_ or smx_mbx_');
        }

        if ($actual !== $expected) {
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
