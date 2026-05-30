# Sendmux SDK Monorepo

Polyglot SDK, MCP server, and CLI workspace for Sendmux.

The layout follows the verified build playbook:

- `packages/ts/core`
- `packages/ts/sending`
- `packages/ts/mailbox`
- `packages/ts/management`
- `packages/ts/sdk`
- `packages/python/{core,sending,mailbox,management,sdk}`
- `packages/go/{core,sending,mailbox,management,sdk}`
- `packages/php/{core,sending,mailbox,management,sdk}`
- `packages/ruby/{core,sending,mailbox,management,sdk}`

Generated clients and runtime helpers will land in later build phases.
