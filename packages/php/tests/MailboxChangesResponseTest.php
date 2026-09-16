<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Sendmux\Mailbox\Api\MailboxAPIApi;
use Sendmux\Mailbox\ApiException;
use Sendmux\Mailbox\Model\MailboxChangesResponse;
use Sendmux\Mailbox\Model\MailboxTypedChangesResponse;
use UnexpectedValueException;

final class MailboxChangesResponseTest extends TestCase
{
    /** @return iterable<string, array{array<string, mixed>, class-string}> */
    public static function successfulResponses(): iterable
    {
        $changes = [
            'created' => [],
            'destroyed' => [],
            'has_more' => false,
            'new_state' => 'next-state',
            'old_state' => null,
            'updated' => [],
        ];
        yield 'legacy' => [$changes, MailboxChangesResponse::class];
        yield 'typed' => [['types' => ['messages' => $changes]], MailboxTypedChangesResponse::class];
    }

    /**
     * @param array<string, mixed> $data
     * @param class-string $expectedClass
     */
    #[DataProvider('successfulResponses')]
    public function testSuccessfulResponsePreservesDeclaredModelAndPayload(array $data, string $expectedClass): void
    {
        $payload = ['ok' => true, 'data' => $data, 'meta' => ['request_id' => 'request_example']];
        $handler = HandlerStack::create(new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], json_encode($payload, JSON_THROW_ON_ERROR)),
        ]));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));

        $response = $api->mailboxGetChanges();

        self::assertInstanceOf($expectedClass, $response);
        self::assertEquals($payload, json_decode(json_encode($response, JSON_THROW_ON_ERROR), true));
    }

    public function testMalformedJsonRetainsApiExceptionInAsyncCall(): void
    {
        $handler = HandlerStack::create(new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], '{'),
        ]));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Error JSON decoding server response');

        $api->mailboxGetChangesAsync()->wait();
    }

    /** @return iterable<string, array{string, string}> */
    public static function unmatchedResponses(): iterable
    {
        foreach (['', 'WithHttpInfo', 'Async', 'AsyncWithHttpInfo'] as $suffix) {
            yield 'null' . $suffix => ['mailboxGetChanges' . $suffix, 'null'];
            yield 'empty object' . $suffix => ['mailboxGetChanges' . $suffix, '{}'];
        }
    }

    #[DataProvider('unmatchedResponses')]
    public function testUnmatchedSuccessBodyRaisesDocumentedException(string $method, string $body): void
    {
        $handler = HandlerStack::create(new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], $body),
        ]));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));

        $this->expectException(UnexpectedValueException::class);
        $this->expectExceptionMessage('mailboxGetChanges response matches neither declared model');

        $result = $api->$method();
        if ($result instanceof PromiseInterface) {
            $result->wait();
        }
    }
}
