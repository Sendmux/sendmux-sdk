<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use ErrorException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Sendmux\Management\Model\ManagementCreateMailboxRequest;
use Sendmux\Sending\Model\AttachmentUploadIntentRequest;
use Sendmux\Sending\Model\UploadedAttachmentRef;

final class RequiredModelFieldsTest extends TestCase
{
    /** @return iterable<string, array{object, list<string>}> */
    public static function missingRequiredFields(): iterable
    {
        yield 'length and numeric constraints' => [
            new AttachmentUploadIntentRequest(),
            ["'filename' can't be null", "'size_bytes' can't be null"],
        ];
        yield 'identifier pattern' => [new UploadedAttachmentRef(), ["'attachment_id' can't be null"]];
        yield 'management email pattern' => [new ManagementCreateMailboxRequest(), ["'email' can't be null"]];
    }

    /** @param list<string> $expected */
    #[DataProvider('missingRequiredFields')]
    public function testMissingRequiredFieldsReturnOnlyRequiredErrors(
        AttachmentUploadIntentRequest|UploadedAttachmentRef|ManagementCreateMailboxRequest $model,
        array $expected
    ): void {
        set_error_handler(static function (int $severity, string $message): never {
            throw new ErrorException($message, 0, $severity);
        });
        try {
            $errors = $model->listInvalidProperties();
        } finally {
            restore_error_handler();
        }

        self::assertSame($expected, $errors);
    }
}
