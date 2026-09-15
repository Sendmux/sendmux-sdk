import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startWindowsConsumer } from "./windows-consumer-owner.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativePackages = ["core", "sending", "mailbox", "management", "sdk"];
export const pythonPackages = [
  { name: "core", distribution: "sendmux-core", module: "sendmux_core" },
  { name: "sending", distribution: "sendmux-sending", module: "sendmux_sending" },
  { name: "mailbox", distribution: "sendmux-mailbox", module: "sendmux_mailbox" },
  { name: "management", distribution: "sendmux-management", module: "sendmux_management" },
  { name: "sdk", distribution: "sendmux-sdk", module: "sendmux_sdk" },
  { name: "mcp", distribution: "sendmux-mcp", module: "sendmux_mcp" },
  { name: "langchain", distribution: "langchain-sendmux", module: "langchain_sendmux" },
];
export const pythonVerificationCohorts = [
  { name: "native", packages: pythonPackages.filter(({ name }) => ["core", "sending", "mailbox", "management", "mcp"].includes(name)) },
  { name: "sdk", packages: pythonPackages.filter(({ name }) => name === "sdk") },
  { name: "langchain", packages: pythonPackages.filter(({ name }) => name === "langchain") },
];
const ownedChildren = new Set();

function processAbsent(pid) {
  try { process.kill(pid, 0); return false; }
  catch (error) {
    if (error.code === "ESRCH") return true;
    if (pid < 0 && error.code === "EPERM") return false;
    throw error;
  }
}

async function killOwnedTree(pid) {
  try { process.kill(-pid, "SIGKILL"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}

// A CI command owns its process group. Unconfirmed shutdown retains its workspace.
export async function run(command, args, { cwd = root, env = process.env, captureOutput = false } = {}) {
  const childEnv = { ...env };
  // Node's outer test runner marker must not suppress an independent child suite.
  delete childEnv.NODE_TEST_CONTEXT;
  const options = { cwd, env: childEnv, stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit", detached: process.platform !== "win32" };
  const windows = process.platform === "win32" ? startWindowsConsumer(command, args, options) : undefined;
  const child = windows?.child ?? spawn(command, args, options);
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  console.log(JSON.stringify({ child_pid: child.pid, command, cwd }));
  if (child.pid) ownedChildren.add(child.pid);
  let timedOut = false;
  let termination;
  let signalError;
  let shutdownTimer;
  let rejectShutdown;
  const shutdownFailed = new Promise((_, reject) => { rejectShutdown = reject; });
  const terminate = () => {
    timedOut = true;
    termination ??= Promise.resolve().then(() => windows ? windows.stop() : killOwnedTree(child.pid)).catch((error) => { signalError = error; });
    shutdownTimer ??= setTimeout(() => {
      if (windows) {
        // Kill-on-close is a final containment fallback, never completion proof.
        try { child.kill("SIGKILL"); } catch (error) { signalError = error; }
        child.stdout?.destroy();
      }
      child.unref();
      rejectShutdown(new Error(`Owned process shutdown unconfirmed: ${child.pid}`));
    }, 2000);
  };
  const timer = setTimeout(terminate, 15 * 60 * 1000);
  process.once("SIGINT", terminate);
  process.once("SIGTERM", terminate);
  let status;
  try {
    const closed = new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("close", (code) => accept(code));
    });
    status = await Promise.race([closed, shutdownFailed]);
  } finally {
    clearTimeout(timer);
    clearTimeout(shutdownTimer);
    process.removeListener("SIGINT", terminate);
    process.removeListener("SIGTERM", terminate);
  }
  if (child.pid) {
    await termination;
    if (signalError) throw signalError;
    if (windows) {
      const result = await windows.confirm();
      assert(processAbsent(child.pid), "Windows Job controller has not closed");
      ownedChildren.delete(child.pid);
      console.log(JSON.stringify({ child_closed: child.pid }));
      assert(!result.orphan, "Command left an owned descendant; Windows Job terminated");
    } else {
      const handle = -child.pid;
      const descendant = !processAbsent(handle);
      if (descendant) await killOwnedTree(child.pid);
      const deadline = Date.now() + 2000;
      while (!processAbsent(handle) && Date.now() < deadline) await delay(20);
      const absent = processAbsent(handle);
      assert(absent, `Owned process shutdown unconfirmed: ${child.pid}`);
      ownedChildren.delete(child.pid);
      console.log(JSON.stringify({ child_closed: child.pid }));
      assert(!descendant, "Command left an owned descendant; tree terminated");
    }
  }
  assert(!timedOut && status === 0, `${command} failed: exit ${status}, interrupted=${timedOut}`);
  return output;
}

export async function nodeTests(files, expectedCount, cwd) {
  const output = await run(process.execPath, ["--test", "--test-reporter=tap", ...files], { cwd, captureOutput: true });
  for (const [name, expected] of Object.entries({ tests: expectedCount, pass: expectedCount, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    const values = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    assert.equal(Number(values.at(-1)?.[1]), expected, `Expected executed Node test ${name}=${expected}`);
  }
}

export async function workspace(label, action) {
  const directory = mkdtempSync(join(tmpdir(), `sendmux-${label}-`));
  console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid }));
  try {
    await action(directory);
  } finally {
    if (ownedChildren.size) {
      console.error(JSON.stringify({ retained_workspace: directory, unconfirmed_children: [...ownedChildren] }));
    } else {
      await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 });
      assert(!existsSync(directory));
      console.log(JSON.stringify({ removed_workspace: directory }));
    }
  }
}

async function packTypescript(directory, names) {
  const packs = join(directory, "packs");
  mkdirSync(packs);
  for (const name of names) await run("pnpm", ["--filter", `@sendmux/${name}`, "pack", "--pack-destination", packs]);
  const archives = readdirSync(packs).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, names.length);
  return archives.map((name) => join(packs, name));
}

function newNodeConsumer(directory) {
  mkdirSync(directory);
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "sendmux-ci-consumer", private: true, type: "module" }));
}

export async function nodeProvenance(directory, names) {
  const source = `import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs'; import {fileURLToPath} from 'node:url'; import {sep} from 'node:path';
for (const name of ${JSON.stringify(names.map((name) => `@sendmux/${name}`))}) {
  const location = realpathSync(fileURLToPath(import.meta.resolve(name)));
  assert(location.startsWith(realpathSync(process.cwd()) + sep), name + ': not installed in consumer');
  await import(name); console.log(JSON.stringify({installed_package:name, location}));
}`;
  writeFileSync(join(directory, "provenance.mjs"), source);
  await run(process.execPath, ["provenance.mjs"], { cwd: directory });
}

export async function nodeConsumer() {
  await workspace("node-consumer", async (directory) => {
    const names = [...nativePackages, "cli"];
    const archives = await packTypescript(directory, names);
    const consumer = join(directory, "consumer");
    newNodeConsumer(consumer);
    await run("pnpm", ["add", "--save-exact", ...archives], { cwd: consumer });
    await nodeProvenance(consumer, names);
    await run("pnpm", ["exec", "sendmux", "--help"], { cwd: consumer });
  });
}

export const aiPairs = [
  ["5.0.0", "3.25.76"], ["5.0.0", "4.0.0"],
  ["5.0.256", "3.25.76"], ["5.0.256", "4.4.3"],
  ["6.0.0", "3.25.76"], ["6.0.0", "4.1.8"],
  ["6.0.281", "3.25.76"], ["6.0.281", "4.4.3"],
  ["7.0.0", "3.25.76"], ["7.0.0", "4.1.8"],
  ["7.0.98", "3.25.76"], ["7.0.98", "4.4.3"],
];

export async function aiConsumers(pairs = aiPairs) {
  await workspace("ai-consumers", async (directory) => {
    const names = ["core", "sending", "mailbox", "ai-sdk"];
    const archives = await packTypescript(directory, names);
    const incompatible = join(directory, "incompatible-zod-3.24.0");
    newNodeConsumer(incompatible);
    await run("pnpm", ["add", "--save-exact", ...archives, "ai@5.0.0", "zod@3.24.0", "semver@7.8.5"], { cwd: incompatible });
    writeFileSync(join(incompatible, "reject-peer.mjs"), `import assert from 'node:assert/strict';
import semver from 'semver'; import {readFileSync} from 'node:fs';
const installed = name => JSON.parse(readFileSync('node_modules/' + name + '/package.json', 'utf8'));
assert(semver.satisfies(installed('zod').version, installed('@sendmux/ai-sdk').peerDependencies.zod), 'Incompatible installed Zod peer');
`);
    await assert.rejects(run(process.execPath, ["reject-peer.mjs"], { cwd: incompatible }), /exit 1/);
    console.log("Expected negative: installed Zod 3.24.0 consumer rejected by candidate peer contract");
    for (const [ai, zod] of pairs) {
      const consumer = join(directory, `ai-${ai}-zod-${zod}`);
      newNodeConsumer(consumer);
      await run("pnpm", ["add", "--save-exact", ...archives, `ai@${ai}`, `zod@${zod}`, "semver@7.8.5"], { cwd: consumer });
      await nodeProvenance(consumer, names);
      writeFileSync(join(consumer, "peers.mjs"), `import assert from 'node:assert/strict';
import semver from 'semver'; import {readFileSync} from 'node:fs';
const metadata = JSON.parse(readFileSync('node_modules/@sendmux/ai-sdk/package.json', 'utf8'));
assert.equal(semver.satisfies('3.24.0', metadata.peerDependencies.zod), false, 'packed Sendmux peer range accepts unsupported Zod 3.24.0');
assert(semver.satisfies(${JSON.stringify(zod)}, metadata.peerDependencies.zod));
assert(semver.satisfies(${JSON.stringify(ai)}, metadata.peerDependencies.ai));
console.log('Packed peer contract rejects 3.24.0 and accepts selected exact pair');
`);
      await run(process.execPath, ["peers.mjs"], { cwd: consumer });
      cpSync(join(root, "packages/ts/ai-sdk/tests/oauth.mjs"), join(consumer, "oauth.mjs"));
      assert.equal(readFileSync(join(consumer, "oauth.mjs"), "utf8"), readFileSync(join(root, "packages/ts/ai-sdk/tests/oauth.mjs"), "utf8"));
      await nodeTests(["oauth.mjs"], 3, consumer);
    }
  });
}

async function pythonProvenance(python, directory, packages, archives, env) {
  const targets = packages.map((packageInfo, index) => ({ ...packageInfo, archive: archives[index] }));
  writeFileSync(join(directory, "provenance.py"), `import email.parser, importlib, importlib.metadata, json, pathlib, re, sys, tarfile, zipfile

targets = json.loads(sys.argv[1])
prefix = pathlib.Path(sys.prefix).resolve()

def archive_payload(archive_path, module):
    archive = pathlib.Path(archive_path)
    if archive.suffix == '.whl':
        with zipfile.ZipFile(archive) as source:
            members = {name: source.read(name) for name in source.namelist() if name.startswith(module + '/') and not name.endswith('/')}
            metadata_name = next(name for name in source.namelist() if name.endswith('.dist-info/METADATA'))
            metadata = email.parser.Parser().parsestr(source.read(metadata_name).decode())
    else:
        with tarfile.open(archive, 'r:gz') as source:
            files = [member for member in source.getmembers() if member.isfile()]
            members = {}
            for member in files:
                marker = '/' + module + '/'
                if marker in member.name:
                    name = module + '/' + member.name.split(marker, 1)[1]
                    members[name] = source.extractfile(member).read()
            metadata_member = next(member for member in files if member.name.endswith('/PKG-INFO'))
            metadata = email.parser.Parser().parsestr(source.extractfile(metadata_member).read().decode())
    assert members, (archive_path, module)
    return members, metadata

for target in targets:
    imported = importlib.import_module(target['module'])
    location = pathlib.Path(imported.__file__).resolve()
    assert prefix in location.parents, (target['module'], str(location))
    distribution = importlib.metadata.distribution(target['distribution'])
    distribution_root = pathlib.Path(distribution.locate_file('')).resolve()
    assert prefix in distribution_root.parents, (target['distribution'], str(distribution_root))
    members, metadata = archive_payload(target['archive'], target['module'])
    assert distribution.version == metadata['Version'], (target['distribution'], distribution.version, metadata['Version'])
    module_root = location.parent
    for name, expected in members.items():
        relative = pathlib.PurePosixPath(name).relative_to(target['module'])
        installed = module_root.joinpath(*relative.parts)
        assert installed.read_bytes() == expected, (target['distribution'], str(installed), target['archive'])
    print(json.dumps({'target_distribution': target['distribution'], 'version': distribution.version, 'module': target['module'], 'location': str(location), 'archive': target['archive'], 'matched_files': len(members)}))
    for requirement_text in distribution.requires or []:
        if ';' in requirement_text:
            continue
        requirement_name = re.match(r'^[A-Za-z0-9_.-]+', requirement_text).group(0)
        dependency = importlib.metadata.distribution(requirement_name)
        dependency_root = pathlib.Path(dependency.locate_file('')).resolve()
        assert prefix in dependency_root.parents, (requirement_name, str(dependency_root))
        print(json.dumps({'dependency_distribution': requirement_name, 'version': dependency.version, 'location': str(dependency_root)}))

target_names = {target['name'] for target in targets}
if 'sdk' in target_names:
    from sendmux_sdk import core, mailbox, management, sending
    assert all(module.__name__.startswith('sendmux_') for module in [core, mailbox, management, sending])
if 'mcp' in target_names:
    from sendmux_mcp.contract import load_contract
    assert load_contract()['package']['identity'] == 'sendmux-mcp'
`, "utf8");
  await run(python, ["provenance.py", JSON.stringify(targets)], { cwd: directory, env });
}

function selectPythonArchives(archives, packages, distributions) {
  return packages.map((packageInfo) => {
    const prefix = `${packageInfo.distribution.replaceAll("-", "_")}-`;
    const matches = archives.filter((archive) => archive.startsWith(prefix));
    assert.equal(matches.length, 1, `Expected one ${packageInfo.distribution} candidate in ${distributions}`);
    return join(distributions, matches[0]);
  });
}

async function runPythonWheelTests(python, consumer, cohort, env) {
  if (cohort.name === "sdk") return;
  writeFileSync(join(consumer, "runtime_tests.py"), `import pytest, sys
class NoSkippedTests:
    def pytest_sessionfinish(self, session):
        reporter = session.config.pluginmanager.get_plugin('terminalreporter')
        if reporter.stats.get('skipped') or reporter.stats.get('xfailed') or reporter.stats.get('xpassed'):
            session.exitstatus = 1
sys.exit(pytest.main(sys.argv[1:], plugins=[NoSkippedTests()]))
`);
  if (cohort.name === "langchain") {
    await run(python, ["runtime_tests.py", "--import-mode=importlib", join(root, "packages/python/tests/test_langchain.py")], { cwd: consumer, env });
    return;
  }
  const mcpTests = join(root, "packages/python/mcp/tests");
  const runtimeTests = readdirSync(mcpTests).filter((name) => name.startsWith("test_") && name.endsWith(".py") && !["test_contract.py", "test_contract_packaging.py"].includes(name));
  await run(python, ["runtime_tests.py", "--import-mode=importlib", join(root, "packages/python/tests"), `--ignore=${join(root, "packages/python/tests/test_langchain.py")}`, ...runtimeTests.map((name) => join(mcpTests, name))], { cwd: consumer, env });
}

export async function pythonArtifactConsumers({
  directory,
  distributions = join(root, ".tmp/python-dist"),
  env = process.env,
  artifactKinds = [["wheel", ".whl"], ["sdist", ".tar.gz"]],
  runWheelTests = true,
}) {
    const consumerEnv = { ...env, PYTHONPATH: "", PYTHONHOME: "", PYTHONNOUSERSITE: "1" };
    for (const name of Object.keys(consumerEnv)) {
      if (name.startsWith("SENDMUX_")) delete consumerEnv[name];
    }
    for (const [kind, suffix] of artifactKinds) {
      const archives = readdirSync(distributions).filter((name) => name.endsWith(suffix));
      assert.equal(archives.length, 7, `Expected seven ${kind} candidates`);
      for (const cohort of pythonVerificationCohorts) {
        const cohortArchives = selectPythonArchives(archives, cohort.packages, distributions);
        const consumer = join(directory, `${kind}-${cohort.name}`);
        await run("python3", ["-m", "venv", consumer]);
        const python = join(consumer, "bin/python");
        await run(python, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: consumer, env: consumerEnv });
        const testDependencies = kind === "wheel" && runWheelTests && cohort.name !== "sdk" ? ["pytest==8.4.1"] : [];
        await run(python, ["-m", "pip", "install", ...cohortArchives, ...testDependencies], { cwd: consumer, env: consumerEnv });
        await run(python, ["-m", "pip", "check"], { cwd: consumer, env: consumerEnv });
        await pythonProvenance(python, consumer, cohort.packages, cohortArchives, consumerEnv);
        if (kind === "wheel" && runWheelTests) await runPythonWheelTests(python, consumer, cohort, consumerEnv);
      }
    }
}

export async function pythonConsumers() {
  await workspace("python-consumers", async (directory) => {
    await pythonArtifactConsumers({ directory });
  });
}

export async function goConsumer() {
  await workspace("go-consumer", async (directory) => {
    const env = { ...process.env, GOTOOLCHAIN: "local" };
    await run("go", ["mod", "init", "example.invalid/sendmux-runtime-ci"], { cwd: directory, env });
    await run("go", ["mod", "edit", `-replace=sendmux.ai/go/v2=${join(root, "go")}`], { cwd: directory, env });
    await run("go", ["get", ...nativePackages.map((name) => `sendmux.ai/go/v2/${name}@v2.0.0`)], { cwd: directory, env });
    await run("go", ["list", "-deps", ...nativePackages.map((name) => `sendmux.ai/go/v2/${name}`)], { cwd: directory, env });
    await run("go", ["list", "-m", "-json", "sendmux.ai/go/v2"], { cwd: directory, env });
    assert(readFileSync(join(directory, "go.mod"), "utf8").includes(`replace sendmux.ai/go/v2 => ${join(root, "go")}`));
  });
}

export async function rubyConsumer() {
  await workspace("ruby-consumer", async (directory) => {
    const gemHome = join(directory, "gems");
    const env = { ...process.env, GEM_HOME: gemHome, GEM_PATH: gemHome };
    delete env.RUBYLIB;
    delete env.BUNDLE_GEMFILE;
    const distributions = join(root, ".tmp/ruby-dist");
    const archives = readdirSync(distributions).filter((name) => name.endsWith(".gem"));
    assert.equal(archives.length, 5);
    for (const name of nativePackages) {
      const matches = archives.filter((file) => file.startsWith(`sendmux-${name}-`));
      assert.equal(matches.length, 1);
      await run("gem", ["install", "--no-document", join(distributions, matches[0])], { cwd: directory, env });
    }
    await run("gem", ["install", "--no-document", "minitest", "-v", "5.27.0"], { cwd: directory, env });
    writeFileSync(join(directory, "provenance.rb"), `require 'json'
%w[core sending mailbox management sdk].each { |name| require "sendmux/#{name}" }
loaded = $LOADED_FEATURES.select { |file| file.include?('/sendmux/') }
abort('No installed Sendmux modules loaded') if loaded.empty?
loaded.each do |file|
  abort('Non-candidate Sendmux import') unless File.realpath(file).start_with?(File.realpath(ENV.fetch('GEM_HOME')) + File::SEPARATOR)
end
puts JSON.generate(installed_files: loaded)
`);
    await run("ruby", ["provenance.rb"], { cwd: directory, env });
    for (const test of ["core", "connection", "oauth_retry", "management_validation"]) {
      await run("ruby", [join(root, `packages/ruby/tests/test_${test}.rb`)], { cwd: directory, env });
    }
  });
}

export async function rustPackage() {
  await workspace("rust-package", async (directory) => {
    const source = join(directory, "source");
    mkdirSync(source);
    for (const name of ["Cargo.toml", "Cargo.lock", "src", "tests", "README.crates.io.md", "LICENSE", "CHANGELOG.md"]) cpSync(join(root, "rust", name), join(source, name), { recursive: true });
    const env = { ...process.env, CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS: "allow" };
    await run("cargo", ["+stable", "update"], { cwd: source, env });
    await run("cargo", ["+stable", "clippy", "--locked", "--all-targets", "--all-features", "--", "-D", "warnings"], { cwd: source, env });
    await run("cargo", ["+stable", "test", "--locked", "--all-targets", "--all-features", "--", "--nocapture"], { cwd: source, env });
    await run("cargo", ["+stable", "test", "--locked", "--doc", "--all-features"], { cwd: source, env });
    await run("cargo", ["+stable", "package", "--locked"], { cwd: source, env });
    const archives = readdirSync(join(source, "target/package")).filter((name) => name.endsWith(".crate"));
    assert.equal(archives.length, 1);
    const unpacked = join(directory, "package");
    mkdirSync(unpacked);
    await run("tar", ["-xzf", join(source, "target/package", archives[0]), "--strip-components=1", "-C", unpacked]);
    const consumer = join(directory, "consumer");
    cpSync(join(root, "rust/ci/floor-consumer"), consumer, { recursive: true });
    const lock = readFileSync(join(consumer, "Cargo.lock"), "utf8");
    assert.notEqual(lock, readFileSync(join(unpacked, "Cargo.lock"), "utf8"), "Floor consumer must not reuse library lock");
    const floorEnv = { ...process.env };
    // An optional isolated current toolchain home must not replace the installed floor.
    if (process.env.SENDMUX_FLOOR_RUSTUP_HOME) floorEnv.RUSTUP_HOME = process.env.SENDMUX_FLOOR_RUSTUP_HOME;
    await run("cargo", ["+1.82.0", "check", "--locked"], { cwd: consumer, env: floorEnv });
    await run("cargo", ["+1.82.0", "test", "--locked"], { cwd: consumer, env: floorEnv });
    assert.equal(readFileSync(join(consumer, "Cargo.lock"), "utf8"), lock);
    console.log(JSON.stringify({ stable_crate: archives[0], floor: "1.82.0", independent_consumer_lock: true }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const commands = { node: nodeConsumer, ai: aiConsumers, python: pythonConsumers, go: goConsumer, ruby: rubyConsumer, rust: rustPackage };
  const command = commands[process.argv[2]];
  assert(command, "Expected consumer: node, ai, python, go, ruby or rust");
  await command();
}
