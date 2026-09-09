<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Sendmux\Sending\Api\MetaApi;
use Sendmux\Sending\ApiException;

final class ConnectionResponseTest extends TestCase
{
    /** @return iterable<string, array{string}> */
    public static function invalidJsonBodies(): iterable
    {
        yield 'malformed' => ['{invalid'];
        yield 'empty' => [''];
    }

    #[DataProvider('invalidJsonBodies')]
    public function testAsyncConnectionRejectsMalformedJson(string $body): void
    {
        $handler = HandlerStack::create(new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], $body),
        ]));
        $api = new MetaApi(new Client(['handler' => $handler]));

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Error JSON decoding server response');
        $api->sendingGetConnectionAsync()->wait();
    }
}
