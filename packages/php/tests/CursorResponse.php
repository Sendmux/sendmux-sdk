<?php

declare(strict_types=1);

namespace Sendmux\Tests;

final class CursorResponse
{
    /**
     * @param list<int> $data
     */
    public function __construct(private readonly array $data, private readonly CursorPagination $pagination)
    {
    }

    /**
     * @return list<int>
     */
    public function getData(): array
    {
        return $this->data;
    }

    public function getPagination(): CursorPagination
    {
        return $this->pagination;
    }
}
