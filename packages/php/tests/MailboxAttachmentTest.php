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

final class MailboxAttachmentTest extends TestCase
{
    /** @return iterable<string, array{string}> */
    public static function attachmentMethods(): iterable
    {
        foreach (['', 'WithHttpInfo', 'Async', 'AsyncWithHttpInfo', 'Request'] as $suffix) {
            yield 'attachment' . $suffix => ['mailboxGetMessageAttachment' . $suffix];
        }
    }

    #[DataProvider('attachmentMethods')]
    public function testExistingPositionalContentTypeIsPreserved(string $method): void
    {
        $history = [];
        $handler = HandlerStack::create(new MockHandler([new Response(200)]));
        $handler->push(Middleware::history($history));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));

        $result = $api->$method(
            'message_123',
            'attachment_123',
            'bytes=0-99',
            'mailbox_123',
            'application/octet-stream'
        );
        if ($result instanceof PromiseInterface) {
            $result->wait();
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

        self::assertSame('application/octet-stream', $request->getHeaderLine('Content-Type'));
        self::assertSame('bytes=0-99', $request->getHeaderLine('Range'));
        self::assertSame('mailbox_id=mailbox_123', $request->getUri()->getQuery());
    }

    #[DataProvider('attachmentMethods')]
    public function testDownloadTokenIsAppendedAfterExistingArguments(string $method): void
    {
        $history = [];
        $handler = HandlerStack::create(new MockHandler([new Response(200)]));
        $handler->push(Middleware::history($history));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));

        $result = $api->$method(
            'message_123',
            'attachment_123',
            null,
            null,
            'application/octet-stream',
            'download_123'
        );
        if ($result instanceof PromiseInterface) {
            $result->wait();
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

        self::assertSame('application/octet-stream', $request->getHeaderLine('Content-Type'));
        self::assertSame('download_token=download_123', $request->getUri()->getQuery());
    }
}
