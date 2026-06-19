# @sendmux/core

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fcore)](https://www.npmjs.com/package/@sendmux/core)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fcore)](https://www.npmjs.com/package/@sendmux/core)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fcore)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Shared runtime helpers and public types for the Sendmux TypeScript SDK packages.

## Documentation

- Sendmux docs: [sendmux.ai/docs](https://sendmux.ai/docs)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A JavaScript runtime with the standard Fetch API.
- A surface package such as `@sendmux/sending`, `@sendmux/mailbox`, or `@sendmux/management` for API operations.

## Installation

```sh
npm install @sendmux/core
```

## Usage

Validate a key prefix and prepare request headers before calling a surface package.

```ts
import {
  assertApiKeyKind,
  conditionalHeaders,
  idempotencyHeaders,
} from "@sendmux/core";

assertApiKeyKind(process.env.SENDMUX_MAILBOX_API_KEY!, "mailbox");

const headers = {
  ...idempotencyHeaders("idem_123"),
  ...conditionalHeaders({ ifNoneMatch: 'W/"etag"' }),
};
```

## Helpers

- `assertApiKeyKind` validates `smx_root_*` prefixes for root clients and mailbox-compatible `smx_mbx_*` or `smx_agent_*` prefixes for mailbox clients.
- `paginate` iterates cursor-paginated Sendmux list responses.
- `idempotencyHeaders`, `conditionalHeaders`, and `responseEtag` cover idempotency and conditional requests.
- `createRetryingFetch` retries safe requests and idempotent `POST` requests with replayable bodies.
- `SendmuxApiError`, `mapApiError`, and `createErrorInterceptor` normalise API errors.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name and version.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
