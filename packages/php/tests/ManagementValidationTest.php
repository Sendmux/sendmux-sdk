<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use Sendmux\Management\Model\ManagementCreateMailboxRequest;
use PHPUnit\Framework\TestCase;

final class ManagementValidationTest extends TestCase
{
    public function testMailboxEmailValidationRejectsLineBreaks(): void
    {
        foreach (["agent@example.com\n", "agent@example.com\r", "agent@example.com\r\n"] as $email) {
            $request = new ManagementCreateMailboxRequest(['email' => $email]);

            self::assertFalse($request->valid(), sprintf('Expected %s to be rejected', json_encode($email)));
        }
    }

    public function testMailboxEmailValidationAcceptsAValidFullValue(): void
    {
        $request = new ManagementCreateMailboxRequest(['email' => 'agent@example.com']);

        self::assertTrue($request->valid());
        self::assertSame('agent@example.com', $request->getEmail());
    }
}
