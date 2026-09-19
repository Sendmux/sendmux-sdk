# Sendmux Go SDK anchor

[![Go Reference](https://pkg.go.dev/badge/sendmux.ai/go/v2/sdk.svg)](https://pkg.go.dev/sendmux.ai/go/v2/sdk)

Package `sdk` anchors the Sendmux Go module. It does not re-export the surface clients.

## Install

```sh
go get sendmux.ai/go/v2@v2.0.0
```

## Use the surface packages

Most applications should import the package for the API surface they need:

```go
import (
	"sendmux.ai/go/v2/mailbox"
	"sendmux.ai/go/v2/management"
	"sendmux.ai/go/v2/sending"
)
```

| Surface | Import path | API key |
| --- | --- | --- |
| Sending | `sendmux.ai/go/v2/sending` | `smx_mbx_*` or owner-approved `smx_agent_*` |
| Mailbox | `sendmux.ai/go/v2/mailbox` | `smx_mbx_*` or `smx_agent_*` |
| Management | `sendmux.ai/go/v2/management` | `smx_root_*` |
| Core helpers | `sendmux.ai/go/v2/core` | n/a |

All three surface packages also provide `NewWithAccessToken` and `NewWithTokenProvider` for [REST OAuth](https://sendmux.ai/docs/developer-tools/oauth).

## Documentation

- Guides: <https://sendmux.ai/docs>
- Go reference: <https://pkg.go.dev/sendmux.ai/go/v2/sdk>

Upgrading from `sendmux.ai/go` v1? See the [version 2 migration](../README.md#version-2-migration) before changing imports.
