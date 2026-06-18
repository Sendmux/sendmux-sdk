# Sendmux Go management client

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/management.svg)](https://pkg.go.dev/sendmux.ai/go/management)

Go client for managing domains, mailboxes, sending accounts, billing, logs, and webhooks.

## Install

```sh
go get sendmux.ai/go@latest
```

## Import

```go
import "sendmux.ai/go/management"
```

## Authentication

Use a root API key with the `smx_root_` prefix. `management.New` validates the prefix before creating the client.

## Quickstart

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

## Client options

- `WithBaseURL` overrides the API base URL.
- `WithHTTPClient` supplies the base HTTP client.
- `WithRetryOptions` configures retry and rate-limit backoff behaviour.
- `IdempotencyKey` sets the `Idempotency-Key` header for create and action requests.
- `IfMatch` and `IfNoneMatch` set conditional request headers where supported.
- `APIErrorFromResponse` maps generated error responses into `core.APIError`.

## Documentation

- Management API: <https://sendmux.ai/docs/api/introduction>
- Domain guide: <https://sendmux.ai/docs/guides/domain-management>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/management>
