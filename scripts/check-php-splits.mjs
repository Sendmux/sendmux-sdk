import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const splitRoot = join(root, ".tmp", "php-splits");
const consumerRoot = join(root, ".tmp", "php-split-consumer");
// Local path versions are fixture inputs; public versions belong to split tags.
const packages = [
  { name: "core", composer: "sendmux/core", repo: "sendmux-php-core", fixtureVersion: "2.1.1" },
  { name: "sending", composer: "sendmux/sending", repo: "sendmux-php-sending", fixtureVersion: "2.1.1" },
  { name: "mailbox", composer: "sendmux/mailbox", repo: "sendmux-php-mailbox", fixtureVersion: "3.0.0" },
  { name: "management", composer: "sendmux/management", repo: "sendmux-php-management", fixtureVersion: "2.1.1" },
  { name: "sdk", composer: "sendmux/sdk", repo: "sendmux-php-sdk", fixtureVersion: "3.0.0" },
];

rmSync(splitRoot, { force: true, recursive: true });
rmSync(consumerRoot, { force: true, recursive: true });
mkdirSync(splitRoot, { recursive: true });
mkdirSync(consumerRoot, { recursive: true });

for (const pkg of packages) {
  const source = join(root, "packages", "php", pkg.name);
  const target = join(splitRoot, pkg.repo);
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !path.includes(`${source}/vendor`),
  });
  for (const requiredFile of ["README.md", "LICENSE"]) {
    if (!existsSync(join(target, requiredFile))) {
      throw new Error(`${pkg.repo} split is missing ${requiredFile}`);
    }
  }
  const manifestPath = join(target, "composer.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.repositories = packages
    .filter((candidate) => manifest.require?.[candidate.composer])
    .map((candidate) => ({
      type: "path",
      url: `../${candidate.repo}`,
      options: {
        symlink: false,
        versions: {
          [candidate.composer]: candidate.fixtureVersion,
        },
      },
    }));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("composer", ["validate", "--strict", "composer.json"], { cwd: target });
}

writeFileSync(
  join(consumerRoot, "composer.json"),
  `${JSON.stringify(
    {
      name: "sendmux/php-split-consumer",
      type: "project",
      repositories: packages.map((pkg) => ({
        type: "path",
        url: `../php-splits/${pkg.repo}`,
        options: {
          symlink: false,
          versions: {
            [pkg.composer]: pkg.fixtureVersion,
          },
        },
      })),
      require: {
        "sendmux/sdk": packages.find((pkg) => pkg.name === "sdk").fixtureVersion,
      },
      config: {
        "sort-packages": true,
      },
    },
    null,
    2,
  )}\n`,
);

run("composer", ["install", "--no-interaction", "--no-progress"], { cwd: consumerRoot });
for (const pkg of packages) {
  const target = join(splitRoot, pkg.repo);
  run("composer", ["install", "--no-interaction", "--no-progress", "--prefer-dist"], { cwd: target });
  run("composer", ["check-platform-reqs"], { cwd: target });
}
run("composer", ["check-platform-reqs"], { cwd: consumerRoot });
console.log(`PHP split dry-run verified in ${splitRoot}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
