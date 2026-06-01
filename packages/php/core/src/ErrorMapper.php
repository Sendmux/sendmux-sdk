<?php

declare(strict_types=1);

namespace Sendmux\Core;

use Throwable;

final class ErrorMapper
{
    public static function fromThrowable(Throwable $throwable): SendmuxApiError
    {
        if ($throwable instanceof SendmuxApiError) {
            return $throwable;
        }

        $headers = self::headers($throwable);
        $rawBody = self::rawBody($throwable);
        $payload = self::payload($rawBody);
        $code = $throwable->getCode();
        $statusCode = is_int($code) && $code > 0 ? $code : null;
        $message = self::stringPath($payload, ['error', 'message'])
            ?: ($throwable->getMessage() ?: 'Sendmux API request failed');

        return new SendmuxApiError(
            $statusCode,
            self::stringPath($payload, ['error', 'code']) ?? 'request_failed',
            $message,
            self::boolPath($payload, ['error', 'retryable']) ?? self::defaultRetryable($statusCode),
            self::stringPath($payload, ['meta', 'request_id']) ?? self::header($headers, 'x-request-id'),
            $headers,
            $rawBody
        );
    }

    /**
     * @param array<string, list<string>|string> $headers
     */
    public static function fromErrorResponse(mixed $response, int $statusCode, array $headers = []): SendmuxApiError
    {
        return new SendmuxApiError(
            $statusCode,
            self::responseString($response, ['getError', 'getCode']) ?? 'request_failed',
            self::responseString($response, ['getError', 'getMessage']) ?? 'Sendmux API request failed',
            self::responseBool($response, ['getError', 'getRetryable']) ?? self::defaultRetryable($statusCode),
            self::responseString($response, ['getMeta', 'getRequestId']) ?? self::header($headers, 'x-request-id'),
            $headers,
            null
        );
    }

    /**
     * @return array<string, list<string>|string>
     */
    private static function headers(Throwable $throwable): array
    {
        if (!method_exists($throwable, 'getResponseHeaders')) {
            return [];
        }

        $headers = $throwable->getResponseHeaders();
        return self::normaliseHeaders($headers);
    }

    private static function rawBody(Throwable $throwable): ?string
    {
        if (!method_exists($throwable, 'getResponseBody')) {
            return null;
        }

        $body = $throwable->getResponseBody();
        if (is_string($body)) {
            return $body;
        }

        if (is_object($body)) {
            $encoded = json_encode($body);
            return $encoded === false ? null : $encoded;
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function payload(?string $rawBody): ?array
    {
        if ($rawBody === null || $rawBody === '') {
            return null;
        }

        $decoded = json_decode($rawBody, true);
        return self::stringKeyedArray($decoded);
    }

    /**
     * @return array<string, list<string>|string>
     */
    private static function normaliseHeaders(mixed $headers): array
    {
        if (!is_array($headers)) {
            return [];
        }

        $normalised = [];
        foreach ($headers as $key => $value) {
            if (!is_string($key)) {
                continue;
            }

            if (is_string($value)) {
                $normalised[$key] = $value;
                continue;
            }

            if (!is_array($value)) {
                continue;
            }

            $values = [];
            foreach ($value as $headerValue) {
                if (is_string($headerValue)) {
                    $values[] = $headerValue;
                }
            }

            $normalised[$key] = $values;
        }

        return $normalised;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function stringKeyedArray(mixed $value): ?array
    {
        if (!is_array($value)) {
            return null;
        }

        $result = [];
        foreach ($value as $key => $item) {
            if (!is_string($key)) {
                return null;
            }

            $result[$key] = $item;
        }

        return $result;
    }

    /**
     * @param array<string, mixed>|null $payload
     * @param list<string> $path
     */
    private static function stringPath(?array $payload, array $path): ?string
    {
        $value = self::path($payload, $path);
        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param array<string, mixed>|null $payload
     * @param list<string> $path
     */
    private static function boolPath(?array $payload, array $path): ?bool
    {
        $value = self::path($payload, $path);
        return is_bool($value) ? $value : null;
    }

    /**
     * @param array<string, mixed>|null $payload
     * @param list<string> $path
     */
    private static function path(?array $payload, array $path): mixed
    {
        $value = $payload;
        foreach ($path as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return null;
            }

            $value = $value[$part];
        }

        return $value;
    }

    /**
     * @param list<string> $path
     */
    private static function responseString(mixed $response, array $path): ?string
    {
        $value = self::responseValue($response, $path);
        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param list<string> $path
     */
    private static function responseBool(mixed $response, array $path): ?bool
    {
        $value = self::responseValue($response, $path);
        return is_bool($value) ? $value : null;
    }

    /**
     * @param list<string> $path
     */
    private static function responseValue(mixed $value, array $path): mixed
    {
        foreach ($path as $method) {
            if (!is_object($value) || !method_exists($value, $method)) {
                return null;
            }

            $value = $value->{$method}();
        }

        return $value;
    }

    /**
     * @param array<string, list<string>|string> $headers
     */
    private static function header(array $headers, string $name): ?string
    {
        foreach ($headers as $key => $value) {
            if (strtolower($key) !== $name) {
                continue;
            }

            if (is_string($value)) {
                return $value;
            }

            return $value[0] ?? null;
        }

        return null;
    }

    private static function defaultRetryable(?int $statusCode): bool
    {
        return $statusCode === 429 || ($statusCode !== null && $statusCode >= 500);
    }
}
