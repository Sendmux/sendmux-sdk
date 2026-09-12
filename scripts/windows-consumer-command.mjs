import { readFileSync } from "node:fs";
import crossSpawn from "cross-spawn";

// The bootstrap joins the retained Windows Job before starting this bridge.
// Keep cross-spawn's existing executable/.cmd parsing rather than reproducing it.
const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
console.error(JSON.stringify({ owner_pid: process.pid, command: "windows-command-bridge" }));
const child = crossSpawn(request.command, request.args, { cwd: request.cwd, stdio: "inherit" });
console.error(JSON.stringify({ child_pid: child.pid, command: request.command, cwd: request.cwd }));
child.once("error", () => { process.exitCode = 1; });
child.once("close", (code) => { process.exitCode = code ?? 1; });
