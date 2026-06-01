<?php

declare(strict_types=1);

namespace Sendmux\Tests;

final class ResponseMeta
{
    public function __construct(private readonly string $requestId)
    {
    }

    public function getRequestId(): string
    {
        return $this->requestId;
    }
}
