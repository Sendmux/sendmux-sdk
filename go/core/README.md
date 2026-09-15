# Sendmux Go core helpers

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/v2/core.svg)](https://pkg.go.dev/sendmux.ai/go/v2/core)

Shared runtime helpers used by the Sendmux Go surface packages.

## Install

This source targets the unpublished `go/v2.0.0` release. Run this command only after that tag is available:

```sh
go get sendmux.ai/go/v2@v2.0.0
```

## Import

```go
import "sendmux.ai/go/v2/core"
```

## What it provides

- API-key prefix validation with `ValidateAPIKey` and `KeySurface`.
- Bare access-token validation with `ValidateAccessToken`.
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

	"sendmux.ai/go/v2/core"
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

Use `KeySurfaceSending` for send-capable `smx_mbx_` keys or owner-approved Sending-resource `smx_agent_` tokens, `KeySurfaceMailbox` for `smx_mbx_` keys or scoped `smx_agent_` tokens, and `KeySurfaceRoot` for `smx_root_` keys.

Most applications should import `sendmux.ai/go/v2/sending`, `sendmux.ai/go/v2/mailbox`, or `sendmux.ai/go/v2/management` directly. Those packages apply the core helpers for you.

## Documentation

- Guides: <https://sendmux.ai/docs>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/v2/core>

The v2 module and reference pages are release candidates until tag `go/v2.0.0` is published.
