# Sendmux Go SDK anchor

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/sdk.svg)](https://pkg.go.dev/sendmux.ai/go/sdk)

Package `sdk` anchors the Sendmux Go module. It does not re-export the surface clients.

## Install

```sh
go get sendmux.ai/go@latest
```

## Use the surface packages

Most applications should import the package for the API surface they need:

```go
import (
	"sendmux.ai/go/mailbox"
	"sendmux.ai/go/management"
	"sendmux.ai/go/sending"
)
```

| Surface | Import path | API key |
| --- | --- | --- |
| Sending | `sendmux.ai/go/sending` | `smx_mbx_*` |
| Mailbox | `sendmux.ai/go/mailbox` | `smx_mbx_*` |
| Management | `sendmux.ai/go/management` | `smx_root_*` |
| Core helpers | `sendmux.ai/go/core` | n/a |

## Documentation

- Guides: <https://docs.sendmux.ai>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/sdk>
