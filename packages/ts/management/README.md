# @sendmux/management

[![npm version](https://img.shields.io/npm/v/@sendmux%2Fmanagement)](https://www.npmjs.com/package/@sendmux/management)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/@sendmux%2Fmanagement)](https://www.npmjs.com/package/@sendmux/management)
[![Licence](https://img.shields.io/npm/l/@sendmux%2Fmanagement)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated TypeScript client for the Sendmux Management API.

## Documentation

- Management API reference: [docs.sendmux.ai/api/introduction](https://docs.sendmux.ai/api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- A root Sendmux API key with the `smx_root_*` prefix.
- A JavaScript runtime with the standard Fetch API.

## Installation

```sh
npm install @sendmux/management
```

## Usage

```ts
import {
  createManagementClient,
  managementListDomains,
} from "@sendmux/management";

const client = createManagementClient({
  apiKey: process.env.SENDMUX_API_KEY!,
});

const domains = await managementListDomains({ client });

console.log(domains.data);
```

The package exports every generated Management operation plus:

- `createManagementClient`
- `configureManagement`
- `ManagementClient`

## Conditional requests

Use `conditionalHeaders` from `@sendmux/core` for operations that accept `If-Match` or `If-None-Match`.

```ts
import { conditionalHeaders } from "@sendmux/core";
import {
  createManagementClient,
  managementGetDomain,
} from "@sendmux/management";

const client = createManagementClient({
  apiKey: process.env.SENDMUX_API_KEY!,
});

const domain = await managementGetDomain({
  client,
  path: { public_id: "mdom_123" },
  headers: conditionalHeaders({ ifNoneMatch: 'W/"etag"' }),
});

console.log(domain.data);
```

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
