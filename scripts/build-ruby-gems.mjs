import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const distDir = join(root, ".tmp", "ruby-dist");
const packages = ["core", "sending", "mailbox", "management", "sdk"];
const gem = commandWithRbenv("gem");

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });

for (const name of packages) {
  const version = readVersion(name);
  const packageDir = join(root, "packages", "ruby", name);
  run(gem, ["build", `sendmux-${name}.gemspec`], { cwd: packageDir });
  const built = readdirSync(packageDir).find((file) => file === `sendmux-${name}-${version}.gem`);
  if (!built) {
    throw new Error(`No gem built for sendmux-${name}`);
  }
  renameSync(join(packageDir, built), join(distDir, built));
}

console.log(`Built Ruby gems in ${distDir}`);

function commandWithRbenv(command) {
  if (process.env.CI || (!existsSync(`${process.env.HOME}/.rbenv/bin/rbenv`) && !existsSync("/opt/homebrew/bin/rbenv"))) {
    return [command];
  }
  return ["rbenv", "exec", command];
}

function readVersion(name) {
  const source = readFileSync(join(root, "packages", "ruby", name, "lib", "sendmux", name, "version.rb"), "utf8");
  const match = source.match(/VERSION = ['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(`Could not read Ruby version for ${name}`);
  }
  return match[1];
}

function run(commandParts, args, options = {}) {
  const [command, ...prefixArgs] = commandParts;
  const result = spawnSync(command, [...prefixArgs, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${[command, ...prefixArgs, ...args].join(" ")} failed with exit code ${result.status}`);
  }
}
