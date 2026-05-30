# @sendmux/sdk

Optional umbrella package for the Sendmux TypeScript SDK.

Install:

```sh
npm install @sendmux/sdk
```

The umbrella package re-exports:

- `core` from `@sendmux/core`
- `sending` from `@sendmux/sending`
- `mailbox` from `@sendmux/mailbox`
- `management` from `@sendmux/management`

For smaller installs, prefer the per-surface packages directly.

Use this package when an integration needs more than one Sendmux API surface and a single import point is simpler than managing surface packages individually.
