import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const ruby = commandWithRbenv("ruby");
const bundle = commandWithRbenv("bundle");
const gem = commandWithRbenv("gem");
const packages = ["core", "sending", "mailbox", "management", "sdk"];

run(bundle, ["install"]);

for (const name of packages) {
  const version = readVersion(name);
  const gemFile = `sendmux-${name}-${version}.gem`;
  run(gem, ["build", `sendmux-${name}.gemspec`], { cwd: `${root}/packages/ruby/${name}` });
  run(gem, ["specification", gemFile, "name"], { cwd: `${root}/packages/ruby/${name}` });
  rmSync(`${root}/packages/ruby/${name}/${gemFile}`, { force: true });
}

runShell(`find packages/ruby -name '*.rb' -print0 | xargs -0 -n 1 ${ruby.join(" ")} -c`);
run(bundle, ["exec", "rubocop", "packages/ruby"]);
run(bundle, ["exec", "ruby", "-Ipackages/ruby/tests", "packages/ruby/tests/test_core.rb"]);

function commandWithRbenv(command) {
  if (existsSync(`${process.env.HOME}/.rbenv/bin/rbenv`) || existsSync("/opt/homebrew/bin/rbenv")) {
    return ["rbenv", "exec", command];
  }
  return [command];
}

function readVersion(name) {
  const moduleName = name === "sdk" ? "sdk" : name;
  const source = readFileSync(`${root}/packages/ruby/${name}/lib/sendmux/${moduleName}/version.rb`, "utf8");
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

function runShell(command) {
  const result = spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}
