# Sendmux Go core helpers

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/core.svg)](https://pkg.go.dev/sendmux.ai/go/core)

Shared runtime helpers used by the Sendmux Go surface packages.

## Install

```sh
go get sendmux.ai/go@latest
```

## Import

```go
import "sendmux.ai/go/core"
```

## What it provides

- API-key prefix validation with `ValidateAPIKey` and `KeySurface`.
- Shared `APIError`, `ErrorIssue`, `SuccessEnvelope`, and `Pagination` types.
- Retry-aware HTTP clients through `NewHTTPClient`, `NewRetryingTransport`, and `RetryOptions`.
- Cursor iteration through `IterateCursor` for code that adapts a response type to the `core.Page` interface.

## Example

```go
package main

import (
	"net/http"
	"os"
	"time"

	"sendmux.ai/go/core"
)

func newHTTPClient() *http.Client {
	if err := core.ValidateAPIKey(os.Getenv("SENDMUX_API_KEY"), core.KeySurfaceRoot); err != nil {
		panic(err)
	}

	return core.NewHTTPClient(nil, core.RetryOptions{
		MaxAttempts: 4,
		BaseDelay:   250 * time.Millisecond,
		MaxDelay:    5 * time.Second,
	})
}
```

Most applications should import `sendmux.ai/go/sending`, `sendmux.ai/go/mailbox`, or `sendmux.ai/go/management` directly. Those packages apply the core helpers for you.

## Documentation

- Guides: <https://sendmux.ai/docs>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/core>
