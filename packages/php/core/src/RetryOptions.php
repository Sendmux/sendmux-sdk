<?php

declare(strict_types=1);

namespace Sendmux\Core;

use InvalidArgumentException;

final class RetryOptions
{
    public function __construct(
        public readonly int $maxAttempts = 3,
        public readonly int $baseDelayMilliseconds = 250,
        public readonly int $maxDelayMilliseconds = 5000,
        public readonly bool $jitter = true,
    ) {
        if ($this->maxAttempts < 1) {
            throw new InvalidArgumentException('maxAttempts must be at least 1');
        }

        if ($this->baseDelayMilliseconds < 0 || $this->maxDelayMilliseconds < 0) {
            throw new InvalidArgumentException('retry delays must be non-negative');
        }
    }
}
