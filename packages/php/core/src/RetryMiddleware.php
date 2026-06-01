<?php

declare(strict_types=1);

namespace Sendmux\Core;

use DateTimeImmutable;
use DateTimeInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Middleware;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Throwable;

final class RetryMiddleware
{
    public static function create(?RetryOptions $options = null): callable
    {
        $options ??= new RetryOptions();

        return Middleware::retry(
            static fn (
                int $retries,
                RequestInterface $request,
                ?ResponseInterface $response = null,
                ?Throwable $exception = null
            ): bool => self::shouldRetry($retries, $request, $response, $exception, $options),
            static fn (int $retries, ?ResponseInterface $response = null): int => self::delayMilliseconds(
                $retries,
                $response,
                $options
            )
        );
    }

    public static function shouldRetry(
        int $retries,
        RequestInterface $request,
        ?ResponseInterface $response,
        ?Throwable $exception,
        RetryOptions $options
    ): bool {
        if ($retries >= $options->maxAttempts - 1) {
            return false;
        }

        if (!self::isRetryableRequest($request)) {
            return false;
        }

        if ($exception instanceof ConnectException) {
            return true;
        }

        return $response !== null && self::isRetryableStatus($response->getStatusCode());
    }

    public static function delayMilliseconds(
        int $retries,
        ?ResponseInterface $response,
        RetryOptions $options
    ): int {
        if ($response !== null) {
            $retryAfter = self::retryAfterMilliseconds($response->getHeaderLine('Retry-After'));
            if ($retryAfter !== null) {
                return min($retryAfter, $options->maxDelayMilliseconds);
            }

            $rateLimitReset = self::rateLimitResetMilliseconds($response->getHeaderLine('X-RateLimit-Reset'));
            if ($rateLimitReset !== null) {
                return min($rateLimitReset, $options->maxDelayMilliseconds);
            }
        }

        $delay = min(
            $options->baseDelayMilliseconds * (2 ** max(0, $retries)),
            $options->maxDelayMilliseconds
        );

        if (!$options->jitter || $delay === 0) {
            return $delay;
        }

        return random_int((int) floor($delay / 2), $delay);
    }

    public static function isRetryableStatus(int $statusCode): bool
    {
        return in_array($statusCode, [408, 409, 425, 429, 500, 502, 503, 504], true);
    }

    private static function isRetryableRequest(RequestInterface $request): bool
    {
        $method = strtoupper($request->getMethod());
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return true;
        }

        return $method === 'POST'
            && $request->hasHeader('Idempotency-Key')
            && self::hasReplayableBody($request);
    }

    private static function hasReplayableBody(RequestInterface $request): bool
    {
        $body = $request->getBody();
        return $body->getSize() === 0 || $body->isSeekable();
    }

    private static function retryAfterMilliseconds(string $value): ?int
    {
        if ($value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return max(0, (int) ceil((float) $value * 1000));
        }

        $date = DateTimeImmutable::createFromFormat(DateTimeInterface::RFC7231, $value);
        if ($date === false) {
            return null;
        }

        return max(0, ($date->getTimestamp() - time()) * 1000);
    }

    private static function rateLimitResetMilliseconds(string $value): ?int
    {
        if ($value === '' || !is_numeric($value)) {
            return null;
        }

        return max(0, ((int) $value - time()) * 1000);
    }
}
