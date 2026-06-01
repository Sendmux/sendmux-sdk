import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const distDir = join(root, ".tmp", "ruby-dist");
const releasedPaths = process.env.RUBY_PATHS_RELEASED ?? "";
const packages = [
  { name: "core", path: "packages/ruby/core" },
  { name: "sending", path: "packages/ruby/sending" },
  { name: "mailbox", path: "packages/ruby/mailbox" },
  { name: "management", path: "packages/ruby/management" },
  { name: "sdk", path: "packages/ruby/sdk" },
];

const selected = packages.filter((pkg) => releasedPaths.includes(pkg.path));
if (selected.length === 0) {
  console.log("No Ruby package paths were released; skipping RubyGems publish");
  process.exit(0);
}

for (const pkg of selected) {
  const localFiles = readdirSync(distDir).filter((file) => file.startsWith(`sendmux-${pkg.name}-`) && file.endsWith(".gem"));
  if (localFiles.length !== 1) {
    throw new Error(`Expected one local gem for sendmux-${pkg.name}, found ${localFiles.length}`);
  }
  const [gemFile] = localFiles;
  if (!gemFile) {
    throw new Error(`No local gem found for sendmux-${pkg.name}`);
  }
  run("gem", ["push", join(distDir, gemFile)]);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
