<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Sendmux\Sending\Model\Address;
use Sendmux\Sending\Model\Attachment;
use Sendmux\Sending\Model\BatchSendRequest;
use Sendmux\Sending\Model\EmailSendRequest;
use Sendmux\Sending\Model\EmailSendRequestDeliveryGroup;
use Sendmux\Sending\ObjectSerializer;

final class SendingDeliveryGroupTest extends TestCase
{
    /** @return iterable<string, array{string|list<string>}> */
    public static function validDeliveryGroups(): iterable
    {
        yield 'scalar' => ['dgrp_transactional'];
        yield 'list' => [['dgrp_transactional', 'dgrp_marketing']];
    }

    /** @param string|list<string> $deliveryGroup */
    #[DataProvider('validDeliveryGroups')]
    public function testDeliveryGroupSerializesAsItsWireValue(string|array $deliveryGroup): void
    {
        $union = new EmailSendRequestDeliveryGroup($deliveryGroup);

        self::assertSame($deliveryGroup, $this->jsonValue($union));

        $request = $this->request(['delivery_group' => $deliveryGroup]);
        $serializedRequest = $this->jsonObject($request);
        self::assertSame($deliveryGroup, $serializedRequest['delivery_group']);
        $attachments = $serializedRequest['attachments'];
        self::assertIsArray($attachments);
        $attachment = $attachments[0] ?? null;
        self::assertIsArray($attachment);
        self::assertSame(
            ['content' => 'Zml4dHVyZQ==', 'filename' => 'fixture.txt'],
            $attachment
        );

        $batch = new BatchSendRequest(['messages' => [$request]]);
        $serializedBatch = $this->jsonObject($batch);
        $messages = $serializedBatch['messages'];
        self::assertIsArray($messages);
        $message = $messages[0] ?? null;
        self::assertIsArray($message);
        self::assertSame($deliveryGroup, $message['delivery_group']);
    }

    public function testOmittedDeliveryGroupStaysOmitted(): void
    {
        self::assertArrayNotHasKey('delivery_group', $this->jsonObject($this->request()));
    }

    public function testExplicitNullDeliveryGroupStaysOmitted(): void
    {
        $request = $this->request(['delivery_group' => null]);

        self::assertArrayNotHasKey('delivery_group', $this->jsonObject($request));
        self::assertArrayNotHasKey(
            'delivery_group',
            $this->jsonObject(ObjectSerializer::sanitizeForSerialization($request))
        );
    }

    /** @param string|list<string> $deliveryGroup */
    #[DataProvider('validDeliveryGroups')]
    public function testObjectSerializerPreservesDeliveryGroupInPrimitiveAndRequestBodies(
        string|array $deliveryGroup
    ): void {
        self::assertSame(
            $deliveryGroup,
            ObjectSerializer::sanitizeForSerialization(new EmailSendRequestDeliveryGroup($deliveryGroup))
        );

        $request = $this->request(['delivery_group' => $deliveryGroup]);
        $serializedRequest = $this->jsonObject(ObjectSerializer::sanitizeForSerialization($request));
        self::assertSame($deliveryGroup, $serializedRequest['delivery_group']);
        self::assertSame(
            ['content' => 'Zml4dHVyZQ==', 'filename' => 'fixture.txt'],
            $this->firstObject($serializedRequest, 'attachments')
        );

        $batch = new BatchSendRequest(['messages' => [$request]]);
        $serializedBatch = $this->jsonObject(ObjectSerializer::sanitizeForSerialization($batch));
        self::assertSame($deliveryGroup, $this->firstObject($serializedBatch, 'messages')['delivery_group']);
    }

    /** @param string|list<string> $deliveryGroup */
    #[DataProvider('validDeliveryGroups')]
    public function testObjectSerializerDeserializesDeliveryGroupAndRequestBodies(string|array $deliveryGroup): void
    {
        $union = ObjectSerializer::deserialize($deliveryGroup, EmailSendRequestDeliveryGroup::class);
        self::assertInstanceOf(EmailSendRequestDeliveryGroup::class, $union);
        self::assertSame($deliveryGroup, ObjectSerializer::sanitizeForSerialization($union));

        $request = ObjectSerializer::deserialize($this->rawRequest($deliveryGroup), EmailSendRequest::class);
        self::assertInstanceOf(EmailSendRequest::class, $request);
        self::assertSame($deliveryGroup, $request->getDeliveryGroup());
        self::assertSame(
            $deliveryGroup,
            $this->jsonObject(ObjectSerializer::sanitizeForSerialization($request))['delivery_group']
        );

        $batch = ObjectSerializer::deserialize(
            ['messages' => [$this->rawRequest($deliveryGroup)]],
            BatchSendRequest::class
        );
        self::assertInstanceOf(BatchSendRequest::class, $batch);
        self::assertSame(
            $deliveryGroup,
            $this->firstObject(
                $this->jsonObject(ObjectSerializer::sanitizeForSerialization($batch)),
                'messages'
            )['delivery_group']
        );
    }

    /** @return iterable<string, array{string|list<string>}> */
    public static function invalidDeliveryGroups(): iterable
    {
        yield 'empty list' => [[]];
        yield 'too many groups' => [array_fill(0, 51, 'dgrp_transactional')];
        yield 'invalid scalar ID' => ['transactional'];
        yield 'invalid list ID' => [['dgrp_transactional', 'marketing']];
    }

    /** @param string|list<string> $deliveryGroup */
    #[DataProvider('invalidDeliveryGroups')]
    public function testInvalidDeliveryGroupIsRejected(string|array $deliveryGroup): void
    {
        $this->expectException(InvalidArgumentException::class);

        new EmailSendRequestDeliveryGroup($deliveryGroup);
    }

    /** @param array<string, mixed> $values */
    private function request(array $values = []): EmailSendRequest
    {
        return new EmailSendRequest([
            'attachments' => [new Attachment([
                'content' => 'Zml4dHVyZQ==',
                'filename' => 'fixture.txt',
            ])],
            'from' => new Address(['email' => 'sender@example.com']),
            'html_body' => '<p>Fixture</p>',
            'subject' => 'Fixture',
            'to' => new Address(['email' => 'recipient@example.com']),
            ...$values,
        ]);
    }

    /**
     * @param string|list<string> $deliveryGroup
     * @return array<string, mixed>
     */
    private function rawRequest(string|array $deliveryGroup): array
    {
        return [
            'attachments' => [[
                'content' => 'Zml4dHVyZQ==',
                'filename' => 'fixture.txt',
            ]],
            'delivery_group' => $deliveryGroup,
            'from' => ['email' => 'sender@example.com'],
            'html_body' => '<p>Fixture</p>',
            'subject' => 'Fixture',
            'to' => ['email' => 'recipient@example.com'],
        ];
    }

    /** @return mixed */
    private function jsonValue(mixed $value): mixed
    {
        return json_decode(json_encode($value, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
    }

    /** @return array<mixed> */
    private function jsonObject(mixed $value): array
    {
        $decoded = $this->jsonValue($value);
        self::assertIsArray($decoded);

        return $decoded;
    }

    /**
     * @param array<mixed> $object
     * @return array<mixed>
     */
    private function firstObject(array $object, string $field): array
    {
        $values = $object[$field];
        self::assertIsArray($values);
        $first = $values[0] ?? null;
        self::assertIsArray($first);

        return $first;
    }
}
