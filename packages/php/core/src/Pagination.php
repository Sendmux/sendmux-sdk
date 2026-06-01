<?php

declare(strict_types=1);

namespace Sendmux\Core;

use Generator;
use RuntimeException;

final class Pagination
{
    /**
     * @param callable(?string): object $fetchPage
     * @return Generator<int, mixed, void, void>
     */
    public static function iterate(callable $fetchPage): Generator
    {
        $cursor = null;

        while (true) {
            $response = $fetchPage($cursor);

            foreach (self::data($response) as $item) {
                yield $item;
            }

            $pagination = self::pagination($response);
            $hasMore = self::boolValue($pagination, 'getHasMore', 'has_more');

            if (!$hasMore) {
                return;
            }

            $nextCursor = self::stringValue($pagination, 'getNextCursor', 'next_cursor');
            if ($nextCursor === null || $nextCursor === '' || $nextCursor === $cursor) {
                throw new RuntimeException('Sendmux cursor pagination did not return a new next_cursor');
            }

            $cursor = $nextCursor;
        }
    }

    /**
     * @return iterable<mixed>
     */
    private static function data(object $response): iterable
    {
        if (!method_exists($response, 'getData')) {
            throw new RuntimeException('Sendmux cursor response is missing getData()');
        }

        $data = $response->getData();
        if (!is_iterable($data)) {
            throw new RuntimeException('Sendmux cursor response data is not iterable');
        }

        return $data;
    }

    private static function pagination(object $response): object
    {
        if (!method_exists($response, 'getPagination')) {
            throw new RuntimeException('Sendmux cursor response is missing getPagination()');
        }

        $pagination = $response->getPagination();
        if (!is_object($pagination)) {
            throw new RuntimeException('Sendmux cursor response pagination is not an object');
        }

        return $pagination;
    }

    private static function boolValue(object $source, string $getter, string $arrayKey): bool
    {
        $value = self::readValue($source, $getter, $arrayKey);
        return $value === true;
    }

    private static function stringValue(object $source, string $getter, string $arrayKey): ?string
    {
        $value = self::readValue($source, $getter, $arrayKey);
        return is_string($value) ? $value : null;
    }

    private static function readValue(object $source, string $getter, string $arrayKey): mixed
    {
        if (method_exists($source, $getter)) {
            return $source->{$getter}();
        }

        if ($source instanceof \ArrayAccess && $source->offsetExists($arrayKey)) {
            return $source->offsetGet($arrayKey);
        }

        return null;
    }
}
