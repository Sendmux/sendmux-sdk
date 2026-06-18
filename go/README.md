# Sendmux Go SDK

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go.svg)](https://pkg.go.dev/sendmux.ai/go)

Official Sendmux Go module for the Sending, Mailbox, and Management APIs.

## Install

```sh
go get sendmux.ai/go@latest
```

## Packages

| Package | Import path | API key |
| --- | --- | --- |
| Core helpers | `sendmux.ai/go/core` | n/a |
| Sending client | `sendmux.ai/go/sending` | `smx_mbx_*` |
| Mailbox client | `sendmux.ai/go/mailbox` | `smx_mbx_*` |
| Management client | `sendmux.ai/go/management` | `smx_root_*` |
| Module anchor | `sendmux.ai/go/sdk` | n/a |

## Sending quickstart

```go
package main

import (
	"context"
	"fmt"
	"os"

	"sendmux.ai/go/sending"
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

	"sendmux.ai/go/mailbox"
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

	"sendmux.ai/go/management"
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

## Runtime behaviour

- `sending.New` and `mailbox.New` accept mailbox-compatible tokens with the `smx_mbx_` or `smx_agent_` prefix.
- `management.New` accepts root API keys with the `smx_root_` prefix.
- Each surface supports `WithBaseURL`, `WithHTTPClient`, and `WithRetryOptions`.
- Mutation methods accept idempotency headers through helpers such as `sending.IdempotencyKey`.
- Resource reads that support conditional requests expose helpers such as `management.IfNoneMatch` and `management.IfMatch`.
- Error response unions can be mapped with `APIErrorFromResponse` on the matching surface package.

## Documentation

- Guides: <https://docs.sendmux.ai>
- Sending API: <https://docs.sendmux.ai/sending-api/introduction>
- Mailbox API: <https://docs.sendmux.ai/mailbox-api/introduction>
- Management API: <https://docs.sendmux.ai/api/introduction>

## Support

For support, email [contact@sendmux.ai](mailto:contact@sendmux.ai).
