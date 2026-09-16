import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pythonVerificationCohorts, run, workspace } from "./ci-consumers.mjs";
import {
  checkPythonLangchainDependencyFloors,
  checkPythonMcpDependencyFloors,
  checkPythonSdkDependencyFloors,
  checkPythonSurfaceDependencyFloors,
} from "./python-release-guardrails.mjs";

const root = process.cwd();
const venv = join(root, ".tmp", "python-venv");
const python = join(venv, "bin", "python");
const sharedTests = [
  "test_attachment_helpers.py",
  "test_core.py",
  "test_generated_runtime_versions.py",
  "test_langchain.py",
  "test_mailbox_events.py",
  "test_mailbox_stream_arguments.py",
  "test_management_validation.py",
  "test_mcp.py",
  "test_mcp_retry.py",
  "test_oauth_retry.py",
  "test_sending_delivery_group.py",
];
const nativeTests = sharedTests.filter((name) => name !== "test_langchain.py");
const env = { ...process.env, PYTHONPATH: "", PYTHONHOME: "", PYTHONNOUSERSITE: "1" };
for (const name of Object.keys(env)) {
  if (name.startsWith("SENDMUX_")) delete env[name];
}

checkGeneratedMailboxBodyParamOrder();
checkGeneratedMailboxTargeting();
checkGeneratedPackageVersions();
checkPythonPackageMetadata();
checkPythonSurfaceDependencyFloors({ root });
checkPythonSdkDependencyFloors({ root });
checkPythonMcpDependencyFloors({ root });
checkPythonLangchainDependencyFloors({ root });

if (!existsSync(python)) {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  await run("python3", ["-m", "venv", venv], { env });
}

await run(python, ["-m", "pip", "install", "--upgrade", "pip"], { env });
await run(python, ["-m", "pip", "install", "-r", "requirements-dev.txt"], { env });
await run(python, ["-m", "pip", "uninstall", "-y", "sendmux-sdk", "langchain-sendmux"], { env });
const nativeCohort = pythonVerificationCohorts.find(({ name }) => name === "native");
assert(nativeCohort);
await run(python, [
  "-m",
  "pip",
  "install",
  ...nativeCohort.packages.flatMap(({ name }) => ["-e", `packages/python/${name}`]),
], { env });
await run(python, ["-c", "import importlib.metadata as m; [(lambda name: (_ for _ in ()).throw(AssertionError(name)) if next(iter(m.packages_distributions().get(name, [])), None) else None)(name) for name in ['sendmux_sdk', 'langchain_sendmux']]"], { env });
await run(python, ["-m", "compileall", "-q", "packages/python"], { env });

await workspace("python-source-cohorts", async (directory) => {
  const provenanceScript = join(directory, "source_provenance.py");
  const pytestRunner = join(directory, "pytest_receipt.py");
  writeSourceProvenanceScript(provenanceScript);
  writePytestReceiptRunner(pytestRunner);

  await verifySourceCohort({
    cohort: nativeCohort,
    python,
    provenanceScript,
    expectedRoot: root,
    mypyTargets: [
      ...nativeCohort.packages.map(({ name }) => `packages/python/${name}`),
      ...nativeTests.map((name) => `packages/python/tests/${name}`),
    ],
    pytestRunner,
    pytestReceipt: join(directory, "native-tests.json"),
    pytestTargets: ["packages/python/tests", "--ignore=packages/python/tests/test_langchain.py"],
  });

  const langchainReceipt = join(directory, "langchain-tests.json");
  for (const cohortName of ["sdk", "langchain"]) {
    const cohort = pythonVerificationCohorts.find(({ name }) => name === cohortName);
    assert(cohort);
    await workspace(`python-source-${cohortName}`, async (cohortVenv) => {
      const cohortPython = join(cohortVenv, "bin", "python");
      await run("python3", ["-m", "venv", cohortVenv], { cwd: directory, env });
      await run(cohortPython, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: root, env });
      await run(cohortPython, ["-m", "pip", "install", "-r", "requirements-dev.txt"], { cwd: root, env });
      await run(cohortPython, [
        "-m",
        "pip",
        "install",
        ...cohort.packages.flatMap(({ name }) => ["-e", `packages/python/${name}`]),
      ], { cwd: root, env });
      const result = {
        cohort,
        python: cohortPython,
        provenanceScript,
        expectedRoot: root,
        mypyTargets: cohortName === "sdk"
          ? ["packages/python/sdk"]
          : [
              "packages/python/langchain",
              "packages/python/tests/test_langchain.py",
            ],
      };
      if (cohortName === "langchain") {
        result.pytestRunner = pytestRunner;
        result.pytestReceipt = langchainReceipt;
        result.pytestTargets = [
          "packages/python/tests/test_langchain.py",
          "packages/python/langchain/tests",
        ];
      }
      await verifySourceCohort(result);
    });
  }

  verifySharedTestCoverage(
    join(directory, "native-tests.json"),
    langchainReceipt,
  );
});

async function verifySourceCohort({ cohort, python: cohortPython, provenanceScript, expectedRoot, mypyTargets, pytestRunner, pytestReceipt, pytestTargets }) {
  await run(cohortPython, [provenanceScript, JSON.stringify(cohort.packages), expectedRoot], { cwd: root, env });
  await run(cohortPython, ["-m", "pip", "check"], { cwd: root, env });
  await run(cohortPython, ["-m", "mypy", "--verbose", ...mypyTargets], { cwd: root, env });
  if (pytestRunner) {
    await run(cohortPython, [pytestRunner, pytestReceipt, ...pytestTargets], { cwd: root, env });
  }
}

function writeSourceProvenanceScript(filePath) {
  writeFileSync(filePath, `import importlib, importlib.metadata, json, pathlib, sys
packages = json.loads(sys.argv[1])
root = pathlib.Path(sys.argv[2]).resolve()
prefix = pathlib.Path(sys.prefix).resolve()
for package in packages:
    imported = importlib.import_module(package['module'])
    location = pathlib.Path(imported.__file__).resolve()
    expected = root / 'packages' / 'python' / package['name']
    assert expected in location.parents, (package['module'], str(location), str(expected))
    distribution = importlib.metadata.distribution(package['distribution'])
    distribution_root = pathlib.Path(distribution.locate_file('')).resolve()
    assert prefix in distribution_root.parents, (package['distribution'], str(distribution_root))
    print(json.dumps({'source_distribution': package['distribution'], 'version': distribution.version, 'module': package['module'], 'location': str(location)}))
names = {package['name'] for package in packages}
if 'sdk' in names:
    from sendmux_sdk import core, mailbox, management, sending
    assert all(module.__name__.startswith('sendmux_') for module in [core, mailbox, management, sending])
`, "utf8");
}

function writePytestReceiptRunner(filePath) {
  writeFileSync(filePath, `import json, pathlib, pytest, sys
class Receipt:
    def __init__(self):
        self.collected = []
        self.outcomes = {}
    def pytest_collection_finish(self, session):
        self.collected = [item.nodeid for item in session.items]
    def pytest_runtest_logreport(self, report):
        if report.when == 'call':
            if hasattr(report, 'wasxfail'):
                self.outcomes[report.nodeid] = 'xfailed' if report.skipped else 'xpassed'
            else:
                self.outcomes[report.nodeid] = report.outcome
        elif report.skipped and report.nodeid not in self.outcomes:
            self.outcomes[report.nodeid] = 'skipped'
receipt = Receipt()
status = pytest.main(sys.argv[2:], plugins=[receipt])
pathlib.Path(sys.argv[1]).write_text(json.dumps({'collected': receipt.collected, 'outcomes': receipt.outcomes}, sort_keys=True))
raise SystemExit(status)
`, "utf8");
}

function verifySharedTestCoverage(nativeReceiptPath, langchainReceiptPath) {
  const actualFiles = readdirSync(join(root, "packages/python/tests"))
    .filter((name) => name.endsWith(".py"))
    .sort();
  assert.deepEqual(actualFiles, [...sharedTests].sort(), "Every shared Python test file must belong to a verification cohort");
  const langchainFiles = readdirSync(join(root, "packages/python/langchain/tests"))
    .filter((name) => name.startsWith("test_") && name.endsWith(".py"))
    .sort();
  const receipts = [nativeReceiptPath, langchainReceiptPath].map((filePath) => JSON.parse(readFileSync(filePath, "utf8")));
  const allNodeIds = [];
  for (const receipt of receipts) {
    assert.deepEqual(Object.keys(receipt.outcomes).sort(), [...receipt.collected].sort(), "Every collected Python test must execute");
    for (const [nodeId, outcome] of Object.entries(receipt.outcomes)) {
      assert.equal(outcome, "passed", `${nodeId} finished as ${outcome}`);
    }
    allNodeIds.push(...receipt.collected);
  }
  assert(allNodeIds.length > 0, "Shared Python tests must not be empty");
  for (const file of langchainFiles) {
    assert(
      receipts[1].collected.some((nodeId) => nodeId.startsWith(`packages/python/langchain/tests/${file}`)),
      `LangChain package test ${file} must execute in the LangChain cohort`,
    );
  }
  assert.equal(new Set(allNodeIds).size, allNodeIds.length, "Shared Python test node IDs must execute exactly once");
  console.log(JSON.stringify({ python_test_coverage: receipts }));
  console.log(JSON.stringify({ python_shared_tests: allNodeIds.length, native: receipts[0].collected.length, langchain: receipts[1].collected.length, skipped: 0, xfailed: 0, xpassed: 0 }));
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

function checkPythonPackageMetadata() {
  const packages = ["core", "sending", "mailbox", "management", "sdk", "mcp"];
  const requiredSnippets = [
    'requires-python = ">=3.10"',
    'license = "MIT"',
    '"License :: OSI Approved :: MIT License"',
    '"Programming Language :: Python :: 3"',
    '"Programming Language :: Python :: 3.10"',
    '"Programming Language :: Python :: 3.11"',
    '"Programming Language :: Python :: 3.12"',
    '"Programming Language :: Python :: 3.13"',
  ];

  for (const packageName of packages) {
    const pyprojectPath = join(root, "packages", "python", packageName, "pyproject.toml");
    const pyproject = readFileSync(pyprojectPath, "utf8");
    for (const snippet of requiredSnippets) {
      if (!pyproject.includes(snippet)) {
        throw new Error(`${pyprojectPath} is missing package metadata: ${snippet}`);
      }
    }
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
