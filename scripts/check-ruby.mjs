import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const ruby = commandWithRbenv("ruby");
const bundle = commandWithRbenv("bundle");
const gem = commandWithRbenv("gem");
const packages = ["core", "sending", "mailbox", "management", "sdk"];

checkGeneratedRubyHeaderStringification();
run(bundle, ["install"]);

for (const name of packages) {
  const version = readVersion(name);
  const gemFile = `sendmux-${name}-${version}.gem`;
  run(gem, ["build", `sendmux-${name}.gemspec`], { cwd: `${root}/packages/ruby/${name}` });
  run(gem, ["specification", gemFile, "name"], { cwd: `${root}/packages/ruby/${name}` });
  rmSync(`${root}/packages/ruby/${name}/${gemFile}`, { force: true });
}

runShell(`find packages/ruby -name '*.rb' -print0 | xargs -0 -n 1 ${ruby.join(" ")} -c`);
checkRubyDependencyFloors();
run(bundle, ["exec", "rubocop", "packages/ruby"]);
run(bundle, ["exec", "ruby", "-Ipackages/ruby/tests", "packages/ruby/tests/test_core.rb"]);
run(bundle, ["exec", "ruby", "-Ipackages/ruby/tests", "packages/ruby/tests/test_management_validation.rb"]);

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

function checkRubyDependencyFloors() {
  const manifest = JSON.parse(readFileSync(`${root}/.release-please-manifest.json`, "utf8"));
  const changedPackages = readChangedRubyPackages();
  const dependencyChecks = [
    {
      packageName: "sending",
      gemspecPath: "packages/ruby/sending/sendmux-sending.gemspec",
      dependencies: [["sendmux-core", manifest["packages/ruby/core"]]],
    },
    {
      packageName: "sdk",
      gemspecPath: "packages/ruby/sdk/sendmux-sdk.gemspec",
      dependencies: [
        ["sendmux-core", manifest["packages/ruby/core"]],
        ["sendmux-mailbox", manifest["packages/ruby/mailbox"]],
        ["sendmux-management", manifest["packages/ruby/management"]],
        ["sendmux-sending", manifest["packages/ruby/sending"]],
      ],
    },
  ];

  for (const { packageName, gemspecPath, dependencies } of dependencyChecks) {
    const source = readFileSync(`${root}/${gemspecPath}`, "utf8");
    const enforceManifestFloor = changedPackages.has(packageName);
    for (const [dependency, minimumVersion] of dependencies) {
      if (typeof minimumVersion !== "string") {
        throw new Error(`Could not read release manifest version for ${dependency}`);
      }

      const dependencyPattern = new RegExp(
        `spec\\.add_dependency '${dependency}', '>= ([^']+)', '< 2\\.0'`,
      );
      const actualVersion = source.match(dependencyPattern)?.[1];
      if (!actualVersion) {
        throw new Error(`${gemspecPath} must require ${dependency} with an explicit >= floor and < 2.0 upper bound`);
      }
      if (enforceManifestFloor && compareSemver(actualVersion, minimumVersion) < 0) {
        throw new Error(`${gemspecPath} must require ${dependency} >= ${minimumVersion}; found >= ${actualVersion}`);
      }
    }
  }
}

function checkGeneratedRubyHeaderStringification() {
  const generatedClients = [
    "packages/ruby/sending/lib/sendmux_sending_generated/api_client.rb",
    "packages/ruby/mailbox/lib/sendmux_mailbox_generated/api_client.rb",
    "packages/ruby/management/lib/sendmux_management_generated/api_client.rb",
  ];

  for (const clientPath of generatedClients) {
    const source = readFileSync(`${root}/${clientPath}`, "utf8");
    if (!source.includes("request.headers = stringify_header_params(header_params)")) {
      throw new Error(`${clientPath} must stringify header values before assigning request.headers`);
    }
    if (!source.includes("def stringify_header_params(header_params)")) {
      throw new Error(`${clientPath} must define stringify_header_params`);
    }
    if (!source.includes("result[key] = value.nil? ? value : value.to_s")) {
      throw new Error(`${clientPath} must preserve nil headers and stringify non-nil header values`);
    }
    if (source.includes("request.headers = header_params")) {
      throw new Error(`${clientPath} must not assign raw header_params to Faraday requests`);
    }
  }

  const attachmentsSource = readFileSync(
    `${root}/packages/ruby/sending/lib/sendmux_sending_generated/api/attachments_api.rb`,
    "utf8",
  );
  for (const expected of [
    "def sending_upload_attachment(content_length, filename, body, opts = {})",
    "def sending_complete_attachment_upload(x_sendmux_upload_token, content_length, upload_id, body, opts = {})",
    "header_params[:'Content-Length'] = content_length",
    "content_length < 1",
  ]) {
    if (!attachmentsSource.includes(expected)) {
      throw new Error(`Ruby generated attachments API missing expected Content-Length contract: ${expected}`);
    }
  }
}

function readChangedRubyPackages() {
  const override = process.env.RUBY_CHANGED_PACKAGES;
  if (override) {
    return new Set(
      override
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(validateRubyPackageName),
    );
  }

  const releasedPackages = readRubyPackagesFromPaths(process.env.RUBY_PATHS_RELEASED);
  if (releasedPackages.size > 0) {
    return releasedPackages;
  }

  const changedFiles = readChangedFiles();
  const changedPackages = new Set();
  for (const filePath of changedFiles) {
    const match = filePath.match(/^packages\/ruby\/([^/]+)\//);
    if (match && packages.includes(match[1])) {
      changedPackages.add(validateRubyPackageName(match[1]));
    }
  }
  return changedPackages;
}

function readRubyPackagesFromPaths(value) {
  if (!value) {
    return new Set();
  }

  let paths;
  try {
    const parsed = JSON.parse(value);
    paths = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    paths = value.split(/[\s,]+/);
  }

  const rubyPackages = new Set();
  for (const filePath of paths) {
    if (typeof filePath !== "string") {
      continue;
    }
    const match = filePath.match(/^packages\/ruby\/([^/]+)$/);
    if (match && packages.includes(match[1])) {
      rubyPackages.add(validateRubyPackageName(match[1]));
    }
  }
  return rubyPackages;
}

function readChangedFiles() {
  const ranges = [];
  if (process.env.GITHUB_BASE_REF) {
    ranges.push(`origin/${process.env.GITHUB_BASE_REF}...HEAD`);
  }
  ranges.push("origin/main...HEAD");

  for (const range of ranges) {
    const result = spawnSync("git", ["diff", "--name-only", range], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status === 0) {
      return result.stdout.split("\n").filter(Boolean);
    }
  }
  return [];
}

function validateRubyPackageName(name) {
  if (!packages.includes(name)) {
    throw new Error(`Unknown Ruby package name: ${name}`);
  }
  return name;
}

function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported Ruby dependency version: ${version}`);
  }
  return match.slice(1).map(Number);
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
