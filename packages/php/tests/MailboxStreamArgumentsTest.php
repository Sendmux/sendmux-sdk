<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\RequestInterface;
use Sendmux\Mailbox\Api\MailboxAPIApi;
use Sendmux\Mailbox\ApiException;

final class MailboxStreamArgumentsTest extends TestCase
{
    /** @return iterable<string, array{string, string|null}> */
    public static function streamMethods(): iterable
    {
        foreach (['', 'WithHttpInfo', 'Async', 'AsyncWithHttpInfo', 'Request'] as $suffix) {
            yield 'selected mailbox' . $suffix => ['mailboxStreamEvents' . $suffix, 'mailbox_123'];
            yield 'implicit mailbox' . $suffix => ['mailboxStreamEvents' . $suffix, null];
        }
    }

    #[DataProvider('streamMethods')]
    public function testPublishedPositionalArgumentsReachRequest(string $method, ?string $mailboxId): void
    {
        $history = [];
        $handler = HandlerStack::create(new MockHandler([new Response(401)]));
        $handler->push(Middleware::history($history));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));
        $result = null;

        try {
            $result = $api->$method('message.received', 'resume-query', 15, 60, 'resume-header', $mailboxId);
            if ($result instanceof PromiseInterface) {
                $result->wait();
            }
        } catch (ApiException $error) {
            self::assertSame(401, $error->getCode());
        }

        if ($result instanceof RequestInterface) {
            $request = $result;
        } else {
            self::assertIsArray($history);
            self::assertCount(1, $history);
            $transaction = $history[0];
            self::assertIsArray($transaction);
            $request = $transaction['request'];
            self::assertInstanceOf(RequestInterface::class, $request);
        }

        parse_str($request->getUri()->getQuery(), $query);
        self::assertSame('GET', $request->getMethod());
        self::assertSame('message.received', $query['event_types'] ?? null);
        self::assertSame('resume-query', $query['last_event_id'] ?? null);
        self::assertSame('15', $query['ping'] ?? null);
        self::assertSame('60', $query['close_after'] ?? null);
        self::assertSame($mailboxId, $query['mailbox_id'] ?? null);
        self::assertSame('resume-header', $request->getHeaderLine('Last-Event-ID'));
    }
}
