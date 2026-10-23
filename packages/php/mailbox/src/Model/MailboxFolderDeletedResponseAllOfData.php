<?php

declare(strict_types=1);

// phpcs:disable PSR1.Files.SideEffects

namespace Sendmux\Mailbox\Model;

/*
 * Deprecated name of MailboxDraftDeleteResponseAllOfData, kept as a class alias until sendmux/mailbox 4.0.
 */
@trigger_error(
    'Sendmux\Mailbox\Model\MailboxFolderDeletedResponseAllOfData is deprecated; use '
    . 'Sendmux\Mailbox\Model\MailboxDraftDeleteResponseAllOfData. It will be removed in sendmux/mailbox 4.0.',
    E_USER_DEPRECATED
);
class_alias(MailboxDraftDeleteResponseAllOfData::class, __NAMESPACE__ . '\MailboxFolderDeletedResponseAllOfData');

if (false) {
    /**
     * @deprecated use MailboxDraftDeleteResponseAllOfData
     */
    class MailboxFolderDeletedResponseAllOfData extends MailboxDraftDeleteResponseAllOfData
    {
    }
}
