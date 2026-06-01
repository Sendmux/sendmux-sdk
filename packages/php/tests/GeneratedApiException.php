<?php

declare(strict_types=1);

namespace Sendmux\Tests;

use Exception;

final class GeneratedApiException extends Exception
{
    /**
     * @param array<string, list<string>> $headers
     */
    public function __construct(
        int $statusCode,
        private readonly array $headers,
        private readonly string $body
    ) {
        parent::__construct('Generated API exception', $statusCode);
    }

    /**
     * @return array<string, list<string>>
     */
    public function getResponseHeaders(): array
    {
        return $this->headers;
    }

    public function getResponseBody(): string
    {
        return $this->body;
    }
}
