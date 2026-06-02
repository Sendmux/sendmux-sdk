# @sendmux/cli

Agent-drivable command line interface for Sendmux.

Install:

```sh
npm install -g @sendmux/cli
```

Configure a profile:

```sh
sendmux profiles:set default --api-key smx_root_... --default
sendmux profiles:set mailbox --api-key smx_mbx_...
```

Use `--json` on API commands to emit the raw Sendmux response envelope:

```sh
sendmux mailbox:messages:list --profile mailbox --query limit=25 --json
sendmux management:domains:list --profile default --json
sendmux sending:send --profile default --body '{"from":"sender@example.com","to":["user@example.com"],"subject":"Hello","text":"Hello"}' --json
```

Commands reject mismatched key types before making a network request.
