import { readFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:tls";

const require = createRequire(process.env.SENDMUX_MCP_TEST_REMOTE_PACKAGE);
const { Agent, setGlobalDispatcher } = require("undici");
appendFileSync(process.env.SENDMUX_MCP_TEST_PIDS, `${process.pid}\n`);

// Route the fixed production hostname to a TLS fixture without changing the CLI
// or disabling certificate verification. The real mcp-remote transport still runs.
setGlobalDispatcher(new Agent({
  connect(options, callback) {
    if (options.hostname !== "mcp.sendmux.ai") {
      callback(new Error(`Unexpected remote host: ${options.hostname}`));
      return;
    }
    const socket = connect({
      host: "127.0.0.1",
      port: Number(process.env.SENDMUX_MCP_TEST_PORT),
      servername: options.hostname,
      ca: readFileSync(process.env.SENDMUX_MCP_TEST_CERT),
    }, () => callback(null, socket));
    socket.once("error", callback);
  },
}));
