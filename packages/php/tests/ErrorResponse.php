<?php

declare(strict_types=1);

namespace Sendmux\Tests;

final class ErrorResponse
{
    public function __construct(private readonly ErrorDetail $error, private readonly ResponseMeta $meta)
    {
    }

    public function getError(): ErrorDetail
    {
        return $this->error;
    }

    public function getMeta(): ResponseMeta
    {
        return $this->meta;
    }
}
