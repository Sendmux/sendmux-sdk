<?php

declare(strict_types=1);

namespace Sendmux\Core;

enum ApiKeySurface: string
{
    case Root = 'root';
    case Mailbox = 'mailbox';
}
