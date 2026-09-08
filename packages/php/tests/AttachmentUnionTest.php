<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Sendmux\Sending\Model\Attachment;

final class AttachmentUnionTest extends TestCase
{
    /** @return iterable<string, array{array<string, string>}> */
    public static function validAttachments(): iterable
    {
        yield 'inline' => [['content' => 'Zml4dHVyZQ==', 'filename' => 'fixture.txt']];
        yield 'uploaded' => [['attachment_id' => 'att_aaaaaaaaaaaaaaaaaaaaaaaa']];
    }

    /** @param array<string, string> $values */
    #[DataProvider('validAttachments')]
    public function testEachAttachmentFormSerializesAndValidates(array $values): void
    {
        $attachment = new Attachment($values);

        self::assertSame($values, json_decode(json_encode($attachment, JSON_THROW_ON_ERROR), true));
        self::assertSame([], $attachment->listInvalidProperties());
    }

    public function testMixedAttachmentFormsAreRejected(): void
    {
        $attachment = new Attachment([
            'attachment_id' => 'att_aaaaaaaaaaaaaaaaaaaaaaaa',
            'content' => 'Zml4dHVyZQ==',
            'filename' => 'fixture.txt',
        ]);

        self::assertNotEmpty($attachment->listInvalidProperties());
    }
}
