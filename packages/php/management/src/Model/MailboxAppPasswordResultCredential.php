<?php

declare(strict_types=1);

// phpcs:disable PSR1.Files.SideEffects

namespace Sendmux\Management\Model;

/*
 * Deprecated name of MailboxCredential, kept as a class alias until sendmux/management 3.0.
 */
@trigger_error(
    'Sendmux\Management\Model\MailboxAppPasswordResultCredential is deprecated; use '
    . 'Sendmux\Management\Model\MailboxCredential. It will be removed in sendmux/management 3.0.',
    E_USER_DEPRECATED
);
class_alias(MailboxCredential::class, __NAMESPACE__ . '\MailboxAppPasswordResultCredential');

if (false) {
    /**
     * @deprecated use MailboxCredential
     */
    class MailboxAppPasswordResultCredential extends MailboxCredential
    {
    }
}
