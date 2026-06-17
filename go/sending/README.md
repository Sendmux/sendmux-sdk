# Sendmux Go sending client

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/sending.svg)](https://pkg.go.dev/sendmux.ai/go/sending)

Go client for Sendmux email sending.

## Install

```sh
go get sendmux.ai/go@latest
```

## Import

```go
import "sendmux.ai/go/sending"
```

## Authentication

Use a mailbox-scoped API key with the `smx_mbx_` prefix. `sending.New` validates the prefix before creating the client.

## Quickstart

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

## Client options

- `WithBaseURL` overrides the API base URL.
- `WithHTTPClient` supplies the base HTTP client.
- `WithRetryOptions` configures retry and rate-limit backoff behaviour.
- `IdempotencyKey` sets the `Idempotency-Key` header for send requests.
- `APIErrorFromResponse` maps generated error responses into `core.APIError`.

## Documentation

- Sending guide: <https://docs.sendmux.ai/guides/sending-via-http>
- Sending API: <https://docs.sendmux.ai/sending-api/introduction>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/sending>
