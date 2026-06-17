# Sendmux Go mailbox client

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/mailbox.svg)](https://pkg.go.dev/sendmux.ai/go/mailbox)

Go client for reading and managing granted mailbox data.

## Install

```sh
go get sendmux.ai/go@latest
```

## Import

```go
import "sendmux.ai/go/mailbox"
```

## Authentication

Use a mailbox-scoped API key with the `smx_mbx_` prefix. `mailbox.New` validates the prefix before creating the client.

## Quickstart

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

## Multi-mailbox grants

When a credential grants access to more than one mailbox, set `MailboxID` on list and read parameters that support it:

```go
params := mailbox.MailboxListMessagesParams{
	MailboxID: mailbox.NewOptString("mbx_123"),
	Limit:     mailbox.NewOptInt(25),
}
```

## Client options

- `WithBaseURL` overrides the API base URL.
- `WithHTTPClient` supplies the base HTTP client.
- `WithRetryOptions` configures retry and rate-limit backoff behaviour.
- `IfMatch` and `IfNoneMatch` set conditional request headers where supported.
- `APIErrorFromResponse` maps generated error responses into `core.APIError`.

## Documentation

- Mailbox guide: <https://docs.sendmux.ai/guides/mailboxes>
- Mailbox API: <https://docs.sendmux.ai/mailbox-api/introduction>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/mailbox>
