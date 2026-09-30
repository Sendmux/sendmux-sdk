# Sendmux MCP for Node.js

Connect a stdio MCP client to `https://mcp.sendmux.ai/mcp` with OAuth. Requires Node.js 22 or later, an internet connection, and a Sendmux account. Python is not required.

Add this server to your MCP client's configuration:

```json
{
  "mcpServers": {
    "sendmux": {
      "command": "npx",
      "args": ["-y", "sendmux-mcp"]
    }
  }
}
```

On first connection, complete the browser sign-in and approve the requested access. Confirm that your client lists the Sendmux tools after sign-in.

This package uses a pinned `mcp-remote` dependency to forward requests to the hosted server. The hosted server owns the tools and permissions. The endpoint and HTTP transport are fixed; this command does not accept connection arguments. Diagnostics go to stderr; stdout carries MCP messages.

For local API-key operation, use the separate [Python package](https://pypi.org/project/sendmux-mcp/). See the [MCP guide](https://sendmux.ai/docs/ai-integrations/mcp) for hosted authentication and client setup.
