<?php

declare(strict_types=1);

// phpcs:disable PSR1.Files.SideEffects

namespace Sendmux\Mailbox\Model;

/*
 * Deprecated name of MailboxSubmissionEnvelopeAddress, kept as a class alias until sendmux/mailbox 4.0.
 */
@trigger_error(
    'Sendmux\Mailbox\Model\MailboxSubmissionEnvelopeRcptToInner is deprecated; use '
    . 'Sendmux\Mailbox\Model\MailboxSubmissionEnvelopeAddress. It will be removed in sendmux/mailbox 4.0.',
    E_USER_DEPRECATED
);
class_alias(MailboxSubmissionEnvelopeAddress::class, __NAMESPACE__ . '\MailboxSubmissionEnvelopeRcptToInner');

if (false) {
    /**
     * @deprecated use MailboxSubmissionEnvelopeAddress
     */
    class MailboxSubmissionEnvelopeRcptToInner extends MailboxSubmissionEnvelopeAddress
    {
    }
}
