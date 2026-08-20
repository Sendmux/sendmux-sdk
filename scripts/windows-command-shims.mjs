import crossSpawn from "cross-spawn";
import { join } from "node:path";

export function spawnCommandSync(command, args, options = {}) {
  const { spawnSync = crossSpawn.sync, ...spawnOptions } = options;
  return spawnSync(command, args, spawnOptions);
}

export function nodeBinCandidates(binName, roots, options = {}) {
  const platform = options.platform ?? process.platform;
  const names = platform === "win32" ? [`${binName}.cmd`, `${binName}.CMD`, binName] : [binName];
  return roots.flatMap((root) => names.map((name) => join(root, name)));
}
