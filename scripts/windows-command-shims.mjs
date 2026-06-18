import { join } from "node:path";

export function commandForWindowsShim(command, args, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" || !isWindowsCommandShim(command)) {
    return { args, command };
  }

  return {
    args: ["/d", "/s", "/c", command, ...args],
    command: options.comSpec || "cmd.exe",
  };
}

export function nodeBinCandidates(binName, roots, options = {}) {
  const platform = options.platform ?? process.platform;
  const names = platform === "win32" ? [`${binName}.cmd`, `${binName}.CMD`, binName] : [binName];
  return roots.flatMap((root) => names.map((name) => join(root, name)));
}

function isWindowsCommandShim(command) {
  return /\.(cmd|bat)$/i.test(command);
}
