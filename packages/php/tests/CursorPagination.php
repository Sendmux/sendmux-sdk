<?php

declare(strict_types=1);

namespace Sendmux\Tests;

final class CursorPagination
{
    public function __construct(private readonly bool $hasMore, private readonly ?string $nextCursor)
    {
    }

    public function getHasMore(): bool
    {
        return $this->hasMore;
    }

    public function getNextCursor(): ?string
    {
        return $this->nextCursor;
    }
}
