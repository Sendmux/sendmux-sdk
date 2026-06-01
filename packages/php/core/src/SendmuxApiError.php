<?php

declare(strict_types=1);

namespace Sendmux\Core;

use RuntimeException;

final class SendmuxApiError extends RuntimeException
{
    /**
     * @param array<string, list<string>|string> $headers
     */
    public function __construct(
        public readonly ?int $statusCode,
        public readonly string $apiCode,
        string $message,
        public readonly bool $retryable,
        public readonly ?string $requestId,
        public readonly array $headers = [],
        public readonly ?string $rawBody = null,
    ) {
        parent::__construct($message, $statusCode ?? 0);
    }
}
