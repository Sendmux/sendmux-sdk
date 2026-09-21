<?php

declare(strict_types=1);

// phpcs:disable PSR1.Files.SideEffects

namespace Sendmux\Mailbox\Model;

/*
 * Deprecated name of MailboxMessageContent, kept as a class alias until sendmux/mailbox 4.0.
 */
@trigger_error(
    'Sendmux\Mailbox\Model\MailboxMessageContentResponseAllOfData is deprecated; use '
    . 'Sendmux\Mailbox\Model\MailboxMessageContent. It will be removed in sendmux/mailbox 4.0.',
    E_USER_DEPRECATED
);
class_alias(MailboxMessageContent::class, __NAMESPACE__ . '\MailboxMessageContentResponseAllOfData');

if (false) {
    /**
     * @deprecated use MailboxMessageContent
     */
    class MailboxMessageContentResponseAllOfData extends MailboxMessageContent
    {
    }
}
