<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use GuzzleHttp\Client;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;
use Sendmux\Core\RetryMiddleware;
use Sendmux\Core\RetryOptions;

final class OAuthRetryTest extends TestCase
{
    /** @return iterable<string, array{string, string}> */
    public static function serverDelays(): iterable
    {
        yield 'seconds' => ['Retry-After', '120'];
        yield 'overflow' => ['Retry-After', '999999999999999999999999999999999999'];
        yield 'date' => ['Retry-After', gmdate('D, d M Y H:i:s \G\M\T', time() + 120)];
        yield 'reset' => ['X-RateLimit-Reset', (string) (time() + 120)];
    }

    #[DataProvider('serverDelays')]
    public function testRetryBudgetReturnsOriginalResponse(string $header, string $value): void
    {
        $calls = 0;
        $body = '{"ok":false,"error":{"retryable":true}}';
        $stack = HandlerStack::create(static function () use (&$calls, $header, $value, $body) {
            ++$calls;
            return Create::promiseFor(new Response(503, [$header => $value, 'X-Request-Id' => 'req_budget'], $body));
        });
        $stack->push(RetryMiddleware::create(new RetryOptions(maxElapsedMilliseconds: 50)));
        $client = new Client(['handler' => $stack, 'http_errors' => false]);

        $response = $client->get('https://example.test');

        self::assertSame(1, $calls);
        self::assertSame(503, $response->getStatusCode());
        self::assertSame($value, $response->getHeaderLine($header));
        self::assertSame('req_budget', $response->getHeaderLine('X-Request-Id'));
        self::assertSame($body, $response->getBody()->getContents());
    }

    public function testServerDelayIsNotCappedAndIdempotencyKeyIsPreserved(): void
    {
        $attempts = [];
        $stack = HandlerStack::create(static function (RequestInterface $request, array $options) use (&$attempts) {
            $attempts[] = [$options['delay'] ?? 0, $request->getHeaderLine('Idempotency-Key')];
            return Create::promiseFor(count($attempts) === 1
                ? new Response(429, ['Retry-After' => '120'], '{"error":{"retryable":true}}')
                : new Response(200, [], 'accepted'));
        });
        $stack->push(RetryMiddleware::create(new RetryOptions(maxDelayMilliseconds: 1, jitter: false)));
        $client = new Client(['handler' => $stack]);

        $response = $client->post('https://example.test', ['headers' => ['Idempotency-Key' => 'idem_test']]);

        self::assertSame([[0, 'idem_test'], [120000, 'idem_test']], $attempts);
        self::assertSame('accepted', $response->getBody()->getContents());
    }

    public function testExplicitRetryableFalsePreservesResponse(): void
    {
        $body = '{"ok":false,"error":{"code":"service_unavailable","retryable":false}}';
        $calls = 0;
        $stack = HandlerStack::create(static function () use (&$calls, $body) {
            ++$calls;
            return Create::promiseFor(new Response(503, ['Retry-After' => '0', 'X-Request-Id' => 'req_test'], $body));
        });
        $stack->push(RetryMiddleware::create(new RetryOptions(maxAttempts: 3)));
        $client = new Client(['handler' => $stack, 'http_errors' => false]);

        $response = $client->get('https://example.test');

        self::assertSame(1, $calls);
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('req_test', $response->getHeaderLine('X-Request-Id'));
        self::assertSame($body, $response->getBody()->getContents());
    }
}
