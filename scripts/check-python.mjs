import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const venv = join(root, ".tmp", "python-venv");
const python = join(venv, "bin", "python");

checkGeneratedMailboxBodyParamOrder();
checkGeneratedMailboxTargeting();
checkGeneratedPackageVersions();

if (!existsSync(python)) {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  run("python3", ["-m", "venv", venv]);
}

run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "-r", "requirements-dev.txt"]);
run(python, [
  "-m",
  "pip",
  "install",
  "-e",
  "packages/python/core",
  "-e",
  "packages/python/sending",
  "-e",
  "packages/python/mailbox",
  "-e",
  "packages/python/management",
  "-e",
  "packages/python/sdk",
  "-e",
  "packages/python/mcp",
]);
run(python, ["-m", "compileall", "-q", "packages/python"]);
run(python, ["-m", "mypy", "packages/python"]);
run(python, ["-m", "pytest", "packages/python/tests"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function checkGeneratedMailboxBodyParamOrder() {
  const filePath = join(root, "packages", "python", "mailbox", "sendmux_mailbox", "api", "mailbox_api_api.py");
  const source = readFileSync(filePath, "utf8");
  const operations = [
    {
      method: "mailbox_batch_delete_messages",
      bodyParam: "batch_delete_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_delete_messages_with_http_info",
      bodyParam: "batch_delete_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_delete_messages_without_preload_content",
      bodyParam: "batch_delete_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_update_messages",
      bodyParam: "batch_update_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_update_messages_with_http_info",
      bodyParam: "batch_update_mailbox_messages_body",
    },
    {
      method: "mailbox_batch_update_messages_without_preload_content",
      bodyParam: "batch_update_mailbox_messages_body",
    },
  ];

  for (const operation of operations) {
    assertOrder({
      source,
      filePath,
      anchor: `def ${operation.method}(`,
      first: `${operation.bodyParam}:`,
      second: "mailbox_id:",
    });
  }
}

function checkGeneratedMailboxTargeting() {
  const filePath = join(root, "packages", "python", "mailbox", "sendmux_mailbox", "api", "mailbox_api_api.py");
  const source = readFileSync(filePath, "utf8");

  assertMethodContains({
    source,
    filePath,
    anchor: "def mailbox_get_identity(",
    expected: ["mailbox_id:", "mailbox_id=mailbox_id,"],
  });
  assertMethodContains({
    source,
    filePath,
    anchor: "def _mailbox_get_identity_serialize(",
    expected: ["mailbox_id,", "_query_params.append(('mailbox_id', mailbox_id))"],
  });
}

function checkGeneratedPackageVersions() {
  const generatedPackages = [
    {
      packageDir: join(root, "packages", "python", "sending"),
      moduleDir: join(root, "packages", "python", "sending", "sendmux_sending"),
      distributionName: "sendmux-sending",
    },
    {
      packageDir: join(root, "packages", "python", "mailbox"),
      moduleDir: join(root, "packages", "python", "mailbox", "sendmux_mailbox"),
      distributionName: "sendmux-mailbox",
    },
    {
      packageDir: join(root, "packages", "python", "management"),
      moduleDir: join(root, "packages", "python", "management", "sendmux_management"),
      distributionName: "sendmux-management",
    },
  ];

  for (const generatedPackage of generatedPackages) {
    const pyprojectVersion = readPythonProjectVersion(generatedPackage.packageDir);
    assertGeneratedVersion({
      filePath: join(generatedPackage.moduleDir, "__init__.py"),
      pattern: /^__version__ = "([^"]+)"$/m,
      label: "__version__",
      expected: pyprojectVersion,
    });
    assertGeneratedVersionReference({
      filePath: join(generatedPackage.moduleDir, "api_client.py"),
      expected: [
        "from importlib.metadata import PackageNotFoundError, version as _distribution_version",
        'init_path = Path(__file__).with_name("__init__.py")',
        'version_prefix = \'__version__ = "\'',
        "return line[len(version_prefix) : -1]",
        `return _distribution_version("${generatedPackage.distributionName}")`,
        "self.user_agent = f'OpenAPI-Generator/{_sdk_package_version()}/python'",
      ],
      forbiddenPattern: /OpenAPI-Generator\/(?!\{_sdk_package_version\(\)\})[^/]+\/python/,
    });
    assertGeneratedVersionReference({
      filePath: join(generatedPackage.moduleDir, "configuration.py"),
      expected: [
        "from importlib.metadata import PackageNotFoundError, version as _distribution_version",
        'init_path = Path(__file__).with_name("__init__.py")',
        'version_prefix = \'__version__ = "\'',
        "return line[len(version_prefix) : -1]",
        `return _distribution_version("${generatedPackage.distributionName}")`,
        '"SDK Package Version: {sdk_package_version}".\\',
        "sdk_package_version=_sdk_package_version()",
      ],
      forbiddenPattern: /SDK Package Version: (?!\{sdk_package_version\})[^"]+/,
    });
  }
}

function assertGeneratedVersion({ filePath, pattern, label, expected }) {
  const source = readFileSync(filePath, "utf8");
  const actual = source.match(pattern)?.[1];
  if (actual !== expected) {
    throw new Error(`${filePath} has ${label} ${actual ?? "<missing>"} but pyproject.toml has ${expected}`);
  }
}

function assertGeneratedVersionReference({ filePath, expected, forbiddenPattern }) {
  const source = readFileSync(filePath, "utf8");
  for (const snippet of expected) {
    if (!source.includes(snippet)) {
      throw new Error(`${filePath} is missing generated runtime version reference: ${snippet}`);
    }
  }
  const forbidden = source.match(forbiddenPattern)?.[0];
  if (forbidden) {
    throw new Error(`${filePath} still hardcodes generated runtime package version: ${forbidden}`);
  }
}

function readPythonProjectVersion(packageDir) {
  const pyprojectPath = join(packageDir, "pyproject.toml");
  const pyproject = readFileSync(pyprojectPath, "utf8");
  const match = pyproject.match(/^version = "([^"]+)"$/m);
  if (!match) {
    throw new Error(`Could not read project version from ${pyprojectPath}`);
  }
  return match[1];
}

function assertOrder({ source, filePath, anchor, first, second }) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error(`Missing generated Python method ${anchor} in ${filePath}`);
  }

  const firstIndex = source.indexOf(first, anchorIndex);
  const secondIndex = source.indexOf(second, anchorIndex);
  if (firstIndex === -1 || secondIndex === -1) {
    throw new Error(`Generated Python method ${anchor} is missing ${first} or ${second} in ${filePath}`);
  }
  if (secondIndex < firstIndex) {
    throw new Error(`Generated Python method ${anchor} places ${second} before ${first} in ${filePath}`);
  }
}

function assertMethodContains({ source, filePath, anchor, expected }) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error(`Missing generated Python method ${anchor} in ${filePath}`);
  }

  const methodEnd = source.indexOf("    def ", anchorIndex + anchor.length);
  const methodSource = source.slice(anchorIndex, methodEnd === -1 ? undefined : methodEnd);
  for (const value of expected) {
    if (!methodSource.includes(value)) {
      throw new Error(`Generated Python method ${anchor} is missing ${value} in ${filePath}`);
    }
  }
}
