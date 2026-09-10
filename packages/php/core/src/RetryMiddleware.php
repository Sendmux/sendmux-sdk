<?php

declare(strict_types=1);

namespace Sendmux\Core;

use DateTimeImmutable;
use DateTimeInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\RetryMiddleware as GuzzleRetryMiddleware;
use GuzzleHttp\Promise\PromiseInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Throwable;

final class RetryMiddleware
{
    public static function create(?RetryOptions $options = null): callable
    {
        $options ??= new RetryOptions();

        return static function (callable $handler) use ($options): callable {
            return static function (
                RequestInterface $request,
                array $requestOptions
            ) use (
                $handler,
                $options
            ): PromiseInterface {
                $started = hrtime(true) / 1_000_000;
                $delay = 0;
                $retry = new GuzzleRetryMiddleware(
                    static function (
                        int $retries,
                        RequestInterface $request,
                        ?ResponseInterface $response = null,
                        ?Throwable $exception = null
                    ) use (
                        $options,
                        $started,
                        &$delay
                    ): bool {
                        if (!self::shouldRetry($retries, $request, $response, $exception, $options)) {
                            return false;
                        }
                        $delay = self::delayMilliseconds($retries + 1, $response, $options);
                        return $delay < PHP_INT_MAX
                            && ($options->maxElapsedMilliseconds === null
                                || hrtime(true) / 1_000_000 - $started + $delay < $options->maxElapsedMilliseconds);
                    },
                    $handler,
                    static function () use (&$delay): int {
                        return $delay;
                    }
                );
                return $retry($request, $requestOptions);
            };
        };
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

        if ($response === null || !self::isRetryableStatus($response->getStatusCode())) {
            return false;
        }

        $body = $response->getBody();
        if (!$body->isSeekable()) {
            return false;
        }
        $position = $body->tell();
        try {
            $body->rewind();
            $payload = json_decode($body->getContents(), true);
        } finally {
            $body->seek($position);
        }

        return !(is_array($payload) && is_array($payload['error'] ?? null)
            && ($payload['error']['retryable'] ?? null) === false);
    }

    public static function delayMilliseconds(
        int $retries,
        ?ResponseInterface $response,
        RetryOptions $options
    ): int {
        if ($response !== null) {
            $retryAfter = self::retryAfterMilliseconds($response->getHeaderLine('Retry-After'));
            if ($retryAfter !== null) {
                return $retryAfter;
            }

            $rateLimitReset = self::rateLimitResetMilliseconds($response->getHeaderLine('X-RateLimit-Reset'));
            if ($rateLimitReset !== null) {
                return $rateLimitReset;
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

        if (preg_match('/\A[0-9]+\z/D', $value) === 1) {
            $milliseconds = (float) $value * 1000;
            return $milliseconds >= PHP_INT_MAX ? PHP_INT_MAX : (int) $milliseconds;
        }

        $date = DateTimeImmutable::createFromFormat(DateTimeInterface::RFC7231, $value);
        if ($date === false) {
            return null;
        }

        return max(0, ($date->getTimestamp() - time()) * 1000);
    }

    private static function rateLimitResetMilliseconds(string $value): ?int
    {
        if (preg_match('/\A[0-9]+\z/D', $value) !== 1) {
            return null;
        }

        $milliseconds = max(0, ((float) $value - time()) * 1000);
        return $milliseconds >= PHP_INT_MAX ? PHP_INT_MAX : (int) $milliseconds;
    }
}
