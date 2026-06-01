<?php

declare(strict_types=1);

namespace Sendmux\Core;

final class Headers
{
    /**
     * @return array{Idempotency-Key?: string}
     */
    public static function idempotency(?string $key = null): array
    {
        return $key === null || $key === '' ? [] : ['Idempotency-Key' => $key];
    }

    /**
     * @return array{If-Match?: string, If-None-Match?: string}
     */
    public static function conditional(?string $ifMatch = null, ?string $ifNoneMatch = null): array
    {
        $headers = [];

        if ($ifMatch !== null && $ifMatch !== '') {
            $headers['If-Match'] = $ifMatch;
        }

        if ($ifNoneMatch !== null && $ifNoneMatch !== '') {
            $headers['If-None-Match'] = $ifNoneMatch;
        }

        return $headers;
    }
}
