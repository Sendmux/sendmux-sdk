<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Sendmux\Core\ApiKeySurface;
use Sendmux\Core\Auth;
use Sendmux\Core\ErrorMapper;
use Sendmux\Core\Headers;
use Sendmux\Core\Pagination;
use Sendmux\Core\RetryMiddleware;
use Sendmux\Core\RetryOptions;
use Sendmux\Core\SendmuxApiError;

final class CoreTest extends TestCase
{
    public function testApiKeySurfaceValidation(): void
    {
        self::assertSame(ApiKeySurface::Root, Auth::assertApiKeySurface('smx_root_123', ApiKeySurface::Root));
        self::assertSame(ApiKeySurface::Mailbox, Auth::assertApiKeySurface('smx_mbx_123', ApiKeySurface::Mailbox));
        self::assertSame(ApiKeySurface::Mailbox, Auth::assertApiKeySurface('smx_agent_123', ApiKeySurface::Mailbox));
        self::assertSame(ApiKeySurface::Mailbox, Auth::assertApiKeySurface('smx_mbx_123', ApiKeySurface::Sending));
    }

    public function testAgentTokenIsRejectedForSendingSurface(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Auth::assertApiKeySurface('smx_agent_123', ApiKeySurface::Sending);
    }

    public function testAgentTokenIsRejectedForRootSurface(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Auth::assertApiKeySurface('smx_agent_123', ApiKeySurface::Root);
    }

    public function testHeaders(): void
    {
        self::assertSame(['Idempotency-Key' => 'idem_123'], Headers::idempotency('idem_123'));
        self::assertSame(
            ['If-Match' => '"v1"', 'If-None-Match' => '"v0"'],
            Headers::conditional('"v1"', '"v0"')
        );
    }

    public function testCursorIteration(): void
    {
        $pages = [
            null => new CursorResponse([1, 2], new CursorPagination(true, 'next')),
            'next' => new CursorResponse([3], new CursorPagination(false, null)),
        ];

        $items = iterator_to_array(Pagination::iterate(static fn (?string $cursor): object => $pages[$cursor]));

        self::assertSame([1, 2, 3], $items);
    }

    public function testCursorIterationRejectsMissingNextCursor(): void
    {
        $this->expectException(RuntimeException::class);

        iterator_to_array(Pagination::iterate(
            static fn (): object => new CursorResponse([], new CursorPagination(true, null))
        ));
    }

    public function testErrorMappingFromJsonBody(): void
    {
        $exception = new GeneratedApiException(
            429,
            ['X-Request-Id' => ['req_header']],
            json_encode([
                'ok' => false,
                'error' => [
                    'code' => 'rate_limit_exceeded',
                    'message' => 'Slow down.',
                    'retryable' => true,
                ],
                'meta' => ['request_id' => 'req_body'],
            ], JSON_THROW_ON_ERROR)
        );

        $mapped = ErrorMapper::fromThrowable($exception);

        self::assertSame(429, $mapped->statusCode);
        self::assertSame('rate_limit_exceeded', $mapped->apiCode);
        self::assertSame('Slow down.', $mapped->getMessage());
        self::assertTrue($mapped->retryable);
        self::assertSame('req_body', $mapped->requestId);
    }

    public function testErrorMappingFromGeneratedErrorResponse(): void
    {
        $mapped = ErrorMapper::fromErrorResponse(
            new ErrorResponse(new ErrorDetail('conflict', 'Already exists.', false), new ResponseMeta('req_model')),
            409,
            ['X-Request-Id' => ['req_header']]
        );

        self::assertInstanceOf(SendmuxApiError::class, $mapped);
        self::assertSame('conflict', $mapped->apiCode);
        self::assertSame('req_model', $mapped->requestId);
        self::assertFalse($mapped->retryable);
    }

    public function testRetryHonoursRetryAfterForIdempotentPost(): void
    {
        $request = new Request('POST', 'https://example.test', ['Idempotency-Key' => 'idem'], 'body');
        $response = new Response(429, ['Retry-After' => '1']);
        $options = new RetryOptions(maxAttempts: 2, jitter: false);

        self::assertTrue(RetryMiddleware::shouldRetry(0, $request, $response, null, $options));
        self::assertSame(1000, RetryMiddleware::delayMilliseconds(0, $response, $options));
    }

    public function testRetryDoesNotRetryNonIdempotentPost(): void
    {
        $request = new Request('POST', 'https://example.test', [], 'body');
        $response = new Response(429);

        self::assertFalse(RetryMiddleware::shouldRetry(0, $request, $response, null, new RetryOptions()));
    }

    public function testRetryDoesNotRetryDeleteByDefault(): void
    {
        $request = new Request('DELETE', 'https://example.test');
        $response = new Response(429);

        self::assertFalse(RetryMiddleware::shouldRetry(0, $request, $response, null, new RetryOptions()));
    }
}
