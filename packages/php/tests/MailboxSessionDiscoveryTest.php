<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use Sendmux\Mailbox\Api\MailboxAPIApi;
use Sendmux\Mailbox\Model\MailboxSessionResponse;

final class MailboxSessionDiscoveryTest extends TestCase
{
    public function testSessionResponsePreservesAdvertisedScheduleHorizon(): void
    {
        $response = $this->sessionResponse();

        self::assertSame(30, $response->getData()->getLimits()->getDraftScheduleDaysMax());
        $payload = json_decode(json_encode($response, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($payload);
        self::assertIsArray($payload['data']);
        self::assertIsArray($payload['data']['limits']);
        self::assertSame(30, $payload['data']['limits']['draft_schedule_days_max']);
    }

    public function testSessionLimitsRequireAdvertisedScheduleHorizon(): void
    {
        $response = $this->sessionResponse(false);

        self::assertFalse($response->getData()->getLimits()->valid());
    }

    private function sessionResponse(bool $includeHorizon = true): MailboxSessionResponse
    {
        $fixture = file_get_contents(__DIR__ . '/../../../scripts/fixtures/mailbox-session-discovery.json');
        self::assertNotFalse($fixture);
        $payload = json_decode($fixture, true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($payload);
        self::assertIsArray($payload['data']);
        self::assertIsArray($payload['data']['limits']);
        if (!$includeHorizon) {
            unset($payload['data']['limits']['draft_schedule_days_max']);
        }
        $handler = HandlerStack::create(new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], json_encode($payload, JSON_THROW_ON_ERROR)),
        ]));
        $api = new MailboxAPIApi(new Client(['handler' => $handler]));

        $response = $api->mailboxGetSession();
        self::assertInstanceOf(MailboxSessionResponse::class, $response);

        return $response;
    }
}
