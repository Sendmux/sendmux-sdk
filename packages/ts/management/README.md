# @sendmux/management

Generated TypeScript client for the Sendmux Management API.

Install:

```sh
npm install @sendmux/management
```

Example:

```ts
import {
  createManagementClient,
  managementListDomains,
} from "@sendmux/management";

const client = createManagementClient({
  apiKey: process.env.SENDMUX_API_KEY!,
});

const domains = await managementListDomains({ client });
```

Use an `smx_root_*` API key.
