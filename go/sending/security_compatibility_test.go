package sending_test

import (
	"context"

	"sendmux.ai/go/mailbox"
	"sendmux.ai/go/management"
	"sendmux.ai/go/sending"
)

type legacySendingSecurity struct{}

func (legacySendingSecurity) BearerAuth(context.Context, sending.OperationName) (sending.BearerAuth, error) {
	return sending.BearerAuth{Token: "legacy-token"}, nil
}

func (legacySendingSecurity) HandleBearerAuth(ctx context.Context, _ sending.OperationName, _ sending.BearerAuth) (context.Context, error) {
	return ctx, nil
}

type legacyMailboxSecurity struct{}

func (legacyMailboxSecurity) BearerAuth(context.Context, mailbox.OperationName) (mailbox.BearerAuth, error) {
	return mailbox.BearerAuth{Token: "legacy-token"}, nil
}

func (legacyMailboxSecurity) HandleBearerAuth(ctx context.Context, _ mailbox.OperationName, _ mailbox.BearerAuth) (context.Context, error) {
	return ctx, nil
}

type legacyManagementSecurity struct{}

func (legacyManagementSecurity) BearerAuth(context.Context, management.OperationName) (management.BearerAuth, error) {
	return management.BearerAuth{Token: "legacy-token"}, nil
}

func (legacyManagementSecurity) HandleBearerAuth(ctx context.Context, _ management.OperationName, _ management.BearerAuth) (context.Context, error) {
	return ctx, nil
}

// Existing custom authentication implementations must remain source-compatible.
var (
	_ sending.SecuritySource     = legacySendingSecurity{}
	_ sending.SecurityHandler    = legacySendingSecurity{}
	_ mailbox.SecuritySource     = legacyMailboxSecurity{}
	_ mailbox.SecurityHandler    = legacyMailboxSecurity{}
	_ management.SecuritySource  = legacyManagementSecurity{}
	_ management.SecurityHandler = legacyManagementSecurity{}
)
