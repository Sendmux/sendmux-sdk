<?php

declare(strict_types=1);

namespace Sendmux\Tests;

final class ErrorDetail
{
    public function __construct(
        private readonly string $code,
        private readonly string $message,
        private readonly bool $retryable
    ) {
    }

    public function getCode(): string
    {
        return $this->code;
    }

    public function getMessage(): string
    {
        return $this->message;
    }

    public function getRetryable(): bool
    {
        return $this->retryable;
    }
}
