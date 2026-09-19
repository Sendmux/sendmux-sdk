# Sendmux Go SDK

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/v2.svg)](https://pkg.go.dev/sendmux.ai/go/v2)

Official Sendmux Go module for the Sending, Mailbox, and Management APIs.

## Install

Requires Go 1.23 or newer.

```sh
go get sendmux.ai/go/v2@v2.0.0
```

## Packages

| Package | Import path | API key |
| --- | --- | --- |
| Core helpers | `sendmux.ai/go/v2/core` | n/a |
| Sending client | `sendmux.ai/go/v2/sending` | `smx_mbx_*` or owner-approved `smx_agent_*` |
| Mailbox client | `sendmux.ai/go/v2/mailbox` | `smx_mbx_*` or `smx_agent_*` |
| Management client | `sendmux.ai/go/v2/management` | `smx_root_*` |
| Module anchor | `sendmux.ai/go/v2/sdk` | n/a |

## Connection checks

Check the authenticated team and credential before using the API:

```go
package main

import (
	"context"
	"fmt"
	"os"

	"sendmux.ai/go/v2/management"
)

func main() {
	client, err := management.New(os.Getenv("SENDMUX_API_KEY"))
	if err != nil {
		panic(err)
	}

	res, err := client.ManagementGetConnection(context.Background(), management.ManagementGetConnectionParams{})
	if err != nil {
		panic(err)
	}
	success, ok := res.(*management.ConnectionResponseHeaders)
	if !ok {
		panic(fmt.Sprintf("connection check failed: %T", res))
	}
	fmt.Println(success.Response.Data.Label)
}
```

The Mailbox and Sending clients expose `MailboxGetConnection` and `SendingGetConnection` with their corresponding empty parameter structs. These checks send no email and require no mailbox selector.

Use `ConnectionInvoker` for a connection-check interface. Existing `Invoker` and `Handler` implementations stay compatible; server handlers can optionally implement `ConnectionInvoker` to serve the new operation.

## Sending quickstart

```go
package main

import (
	"context"
	"fmt"
	"os"

	"sendmux.ai/go/v2/sending"
)

func main() {
	ctx := context.Background()

	client, err := sending.New(os.Getenv("SENDMUX_SENDING_API_KEY"))
	if err != nil {
		panic(err)
	}

	res, err := client.SendingSendEmail(ctx, &sending.EmailSendRequest{
		From: sending.Address{
			Email: "sender@example.com",
			Name:  sending.NewOptString("Sender"),
		},
		To: sending.EmailSendRequestTo{
			Email: "recipient@example.com",
		},
		Subject:  "Hello from Sendmux",
		HTMLBody: "<p>Hello.</p>",
		TextBody: sending.NewOptString("Hello."),
	}, sending.SendingSendEmailParams{
		IdempotencyKey: sending.IdempotencyKey("email_123"),
	})
	if err != nil {
		panic(err)
	}

	success, ok := res.(*sending.SendSuccessResponse)
	if !ok {
		panic(fmt.Sprintf("send failed: %T", res))
	}

	data := success.GetData()
	fmt.Println(data.GetMessageID())
}
```

## Mailbox quickstart

```go
package main

import (
	"context"
	"fmt"
	"os"

	"sendmux.ai/go/v2/mailbox"
)

func main() {
	ctx := context.Background()

	client, err := mailbox.New(os.Getenv("SENDMUX_MAILBOX_API_KEY"))
	if err != nil {
		panic(err)
	}

	res, err := client.MailboxListMessages(ctx, mailbox.MailboxListMessagesParams{
		Limit: mailbox.NewOptInt(25),
	})
	if err != nil {
		panic(err)
	}

	page, ok := res.(*mailbox.MailboxMessageSummaryCursorListResponse)
	if !ok {
		panic(fmt.Sprintf("list messages failed: %T", res))
	}

	for _, message := range page.GetData() {
		fmt.Println(message.GetID())
	}
}
```

## Management quickstart

```go
package main

import (
	"context"
	"fmt"
	"os"

	"sendmux.ai/go/v2/management"
)

func main() {
	ctx := context.Background()

	client, err := management.New(os.Getenv("SENDMUX_API_KEY"))
	if err != nil {
		panic(err)
	}

	res, err := client.ManagementListDomains(ctx, management.ManagementListDomainsParams{
		Limit: management.NewOptInt(25),
	})
	if err != nil {
		panic(err)
	}

	page, ok := res.(*management.DomainItemCursorListResponse)
	if !ok {
		panic(fmt.Sprintf("list domains failed: %T", res))
	}

	for _, domain := range page.GetData() {
		fmt.Println(domain.GetID(), domain.GetDomain())
	}
}
```

## OAuth access tokens

All three surface packages expose `NewWithAccessToken(token, opts...)` and `NewWithTokenProvider(provider, opts...)`. The provider has signature `func(context.Context) (string, error)` and runs for each authenticated request with its request context. Your application owns token storage, expiry checks and refresh coordination.

Use a bare REST access token with the operation's required scopes and mailbox access. See [OAuth for REST APIs](https://sendmux.ai/docs/developer-tools/oauth). Existing `New` constructors retain API-key prefix validation.

## Version 2 migration

`sendmux.ai/go/v2` is a new major module. Version 1 (`sendmux.ai/go`, last release `go/v1.6.1`) keeps working unchanged and is not retracted.

1. Require the v2 module and change every Sendmux import in the same commit, then run `go mod tidy` to drop the v1 requirement:

   ```sh
   go get sendmux.ai/go/v2@v2.0.0
   ```

   | v1 import | v2 import |
   | --- | --- |
   | `sendmux.ai/go/core` | `sendmux.ai/go/v2/core` |
   | `sendmux.ai/go/sending` | `sendmux.ai/go/v2/sending` |
   | `sendmux.ai/go/mailbox` | `sendmux.ai/go/v2/mailbox` |
   | `sendmux.ai/go/management` | `sendmux.ai/go/v2/management` |
   | `sendmux.ai/go/sdk` | `sendmux.ai/go/v2/sdk` |

   Do not mix v1 and v2 imports in one binary: `core.APIError`, `core.RetryOptions` and every generated type are distinct types in each major version.

2. **Mailbox.** `MailboxListThreadMessages` returns `*mailbox.MailboxThreadMessageSummaryCursorListResponse`; its metadata has a required `ThreadID` and an optional `SyncState`. A type assertion on `*mailbox.MailboxMessageSummaryCursorListResponse` for that call no longer matches, and constructed thread results must use `MailboxThreadMessageSummaryCursorListResponseMeta` and `MailboxThreadMessageSummaryCursorListResponseOk`. `MailboxListMessages` still returns `*mailbox.MailboxMessageSummaryCursorListResponse`, whose metadata gains an optional `SyncState`. Identity, quota, submission and thread list metadata gain typed `IdentityState` or `QueryState` fields. `MailboxMessage.Attachments` is `[]mailbox.MailboxAttachment`, the same type `MailboxMessageSummary` and `MailboxMessageContent` already use; the v1-only `mailbox.MailboxMessageAttachmentsItem` type no longer exists, and `GetAttachments`/`SetAttachments` use `MailboxAttachment`.

3. **Management.** `ManagementListProviders` returns `[]management.ProviderListItem` in `ProviderItemCursorListResponse.Data` instead of `[]management.ProviderItem`; the list item carries no `Variables`. The provider detail type `ProviderItem` gains `Variables management.ProviderVariables` (`map[string]string`), `ProviderCreateBody` and `ProviderUpdateBody` gain optional `Variables`, and `ProviderAllowedActions` gains `UpdateVariables`. `DeliveryLogItem` and `DeliveryLogDetail` gain `DeliveryGroup []string`. Because of the new map and slice fields, `ProviderItem`, `ProviderCreateBody`, `ProviderUpdateBody`, `OptProviderCreateBody`, `OptProviderUpdateBody` and `DeliveryLogItem` are no longer comparable with `==` and cannot be used as map keys.

4. **Sending (additive).** `EmailSendRequest.DeliveryGroup` narrows the eligible provider pool for one send to one delivery group or a list of groups:

   ```go
   request.DeliveryGroup = sending.NewOptEmailSendRequestDeliveryGroup(
   	sending.NewStringArrayEmailSendRequestDeliveryGroup([]string{"dgrp_primary", "dgrp_backup"}),
   )
   ```

   Use `sending.NewStringEmailSendRequestDeliveryGroup("dgrp_primary")` for a single group.

To roll back, restore the v1 module requirement, imports, constructed response types, and lock or vendor state together.

## Runtime behaviour

- `sending.New` accepts send-capable `smx_mbx_` keys or owner-approved Sending-resource `smx_agent_` tokens.
- `mailbox.New` accepts mailbox `smx_mbx_` keys or scoped `smx_agent_` tokens.
- `management.New` accepts root API keys with the `smx_root_` prefix.
- Each surface supports `WithBaseURL`, `WithHTTPClient`, and `WithRetryOptions`.
- Mutation methods accept idempotency headers through helpers such as `sending.IdempotencyKey`.
- Resource reads that support conditional requests expose helpers such as `management.IfNoneMatch` and `management.IfMatch`.
- Error response unions can be mapped with `APIErrorFromResponse` on the matching surface package.

## Documentation

- Guides: <https://sendmux.ai/docs>
- Sending API: <https://sendmux.ai/docs/sending-api/introduction>
- Mailbox API: <https://sendmux.ai/docs/mailbox-api/introduction>
- Management API: <https://sendmux.ai/docs/api/introduction>

## Support

For support, email [contact@sendmux.ai](mailto:contact@sendmux.ai).
