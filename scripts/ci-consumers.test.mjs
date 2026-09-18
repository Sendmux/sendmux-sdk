import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { candidateOverrides, newNodeConsumer, nodeProvenance, nodeTests, packedCandidate, pythonArtifactConsumers, run, workspace } from "./ci-consumers.mjs";

test("Python artifact consumers isolate sequential releases and reject missing or changed targets", async () => {
  await workspace("python-cohort-fixture", async (directory) => {
    const candidates = join(directory, "candidates");
    const dependencies = join(directory, "dependencies");
    const consumers = join(directory, "consumers");
    mkdirSync(candidates);
    mkdirSync(dependencies);
    mkdirSync(consumers);
    const fixtureSource = String.raw`
import csv, pathlib, sys, zipfile

candidate_dir, dependency_dir = map(pathlib.Path, sys.argv[1:])
packages = [
    ("sendmux-core", "sendmux_core", "1.0.0", [], candidate_dir),
    ("sendmux-sending", "sendmux_sending", "1.0.0", ["sendmux-core>=1,<2"], candidate_dir),
    ("sendmux-mailbox", "sendmux_mailbox", "2.0.0", ["sendmux-core>=1,<2"], candidate_dir),
    ("sendmux-management", "sendmux_management", "1.0.0", ["sendmux-core>=1,<2"], candidate_dir),
    ("sendmux-mcp", "sendmux_mcp", "2.0.0", ["sendmux-core>=1,<2"], candidate_dir),
    ("sendmux-sdk", "sendmux_sdk", "2.0.0", ["sendmux-core>=1,<2", "sendmux-mailbox>=2,<3", "sendmux-management>=1,<2", "sendmux-sending>=1,<2"], candidate_dir),
    ("langchain-sendmux", "langchain_sendmux", "0.3.0", ["sendmux-mailbox>=1,<2", "sendmux-sending>=1,<2"], candidate_dir),
    ("sendmux-mailbox", "sendmux_mailbox", "1.5.1", ["sendmux-core>=1,<2"], dependency_dir),
]

for distribution, module, version, requirements, output in packages:
    wheel_name = f"{distribution.replace('-', '_')}-{version}-py3-none-any.whl"
    dist_info = f"{distribution.replace('-', '_')}-{version}.dist-info"
    files = {
        f"{module}/__init__.py": f"__version__ = {version!r}\n",
        f"{dist_info}/WHEEL": "Wheel-Version: 1.0\nGenerator: sendmux-test\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
        f"{dist_info}/METADATA": "Metadata-Version: 2.1\n" + f"Name: {distribution}\nVersion: {version}\n" + "".join(f"Requires-Dist: {item}\n" for item in requirements),
    }
    if module == "sendmux_sdk":
        files[f"{module}/__init__.py"] = "from importlib import import_module\n_MODULES={'core':'sendmux_core','mailbox':'sendmux_mailbox','management':'sendmux_management','sending':'sendmux_sending'}\ndef __getattr__(name):\n module=import_module(_MODULES[name]); globals()[name]=module; return module\n"
    if module == "sendmux_mcp":
        files[f"{module}/contract.py"] = "def load_contract(): return {'package': {'identity': 'sendmux-mcp'}}\n"
    record = f"{dist_info}/RECORD"
    files[record] = "".join(f"{name},,\n" for name in [*files, record])
    with zipfile.ZipFile(output / wheel_name, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in files.items():
            archive.writestr(name, payload)
`;
    await run("python3", ["-c", fixtureSource, candidates, dependencies], { cwd: directory });
    const options = {
      directory: consumers,
      distributions: candidates,
      artifactKinds: [["wheel", ".whl"]],
      runWheelTests: false,
      env: {
        ...process.env,
        PIP_FIND_LINKS: `${candidates} ${dependencies}`,
        PIP_NO_INDEX: "1",
      },
    };
    await pythonArtifactConsumers(options);

    const sdkWheel = "sendmux_sdk-2.0.0-py3-none-any.whl";
    const sdkArchive = join(candidates, sdkWheel);
    const retainedArchive = join(directory, sdkWheel);
    renameSync(sdkArchive, retainedArchive);
    try {
      await assert.rejects(
        pythonArtifactConsumers({ ...options, directory: join(directory, "missing-target") }),
        /Expected seven wheel candidates/,
      );
    } finally {
      renameSync(retainedArchive, sdkArchive);
    }

    // A package that changes its own installed bytes must not earn certification.
    await run("python3", ["-c", String.raw`
import pathlib, sys, zipfile
archive = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(archive) as source:
    members = {name: source.read(name) for name in source.namelist()}
members['sendmux_sdk/__init__.py'] += b"\nfrom pathlib import Path\nPath(__file__).write_text('# changed after installation\\n')\n"
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as target:
    for name, payload in members.items():
        target.writestr(name, payload)
`, sdkArchive], { cwd: directory });
    await assert.rejects(
      pythonArtifactConsumers({ ...options, directory: join(directory, "changed-target") }),
      /exit 1/,
    );
  });
});

test("a failed completed consumer command removes its exact workspace", async () => {
  let directory;
  await assert.rejects(workspace("failed-command", async (cwd) => {
    directory = cwd;
    await run(process.execPath, ["-e", "process.exit(7)"], { cwd });
  }), /exit 7/);
  assert.equal(existsSync(directory), false);
  await assert.rejects(workspace("missing-command", async (cwd) => {
    directory = cwd;
    await run(`${cwd}/missing-executable`, [], { cwd });
  }), /ENOENT/);
  assert.equal(existsSync(directory), false);
});

test("nested consumer tests execute and propagate an intentionally failing case", async () => {
  await workspace("nested-test", async (directory) => {
    const file = join(directory, "nested.test.mjs");
    const receipt = join(directory, "executed");
    writeFileSync(file, `import {test} from 'node:test'; import assert from 'node:assert/strict'; import {writeFileSync} from 'node:fs';
test('nested failure canary',()=>{writeFileSync(${JSON.stringify(receipt)}, 'executed');assert.equal(1,2,'intentional nested assertion');});`);
    await assert.rejects(nodeTests([file], 1, directory), /exit 1/);
    assert.equal(readFileSync(receipt, "utf8"), "executed");
    writeFileSync(file, `import {test} from 'node:test'; import {writeFileSync} from 'node:fs';
test('nested healthy canary',()=>{writeFileSync(${JSON.stringify(receipt)}, 'healthy');});`);
    await nodeTests([file], 1, directory);
    assert.equal(readFileSync(receipt, "utf8"), "healthy");
    writeFileSync(file, "import {test} from 'node:test'; test('skipped canary', {skip:true},()=>{});");
    await assert.rejects(nodeTests([file], 1, directory), /Expected executed Node test (?:pass|skipped)=/);
    writeFileSync(file, "// no test cases");
    await assert.rejects(nodeTests([file], 3, directory), /Expected executed Node test tests=3/);
  });
});

test("installed package checks reject missing artifact bytes without falling back to source", async () => {
  await workspace("broken-node-artifact", async (directory) => {
    const packs = join(directory, "packs");
    mkdirSync(packs);
    await run("pnpm", ["--filter", "@sendmux/core", "pack", "--pack-destination", packs]);
    const archives = readdirSync(packs);
    assert.equal(archives.length, 1);
    writeFileSync(join(directory, "package.json"), '{"name":"artifact-fixture","private":true,"type":"module"}');
    await run("pnpm", ["add", join(packs, archives[0])], { cwd: directory });
    await nodeProvenance(directory, ["core"]);
    const entry = realpathSync(join(directory, "node_modules/@sendmux/core/dist/index.js"));
    const original = readFileSync(entry);
    renameSync(entry, `${entry}.retained`);
    await assert.rejects(nodeProvenance(directory, ["core"]), /exit 1/);
    renameSync(`${entry}.retained`, entry);
    assert.deepEqual(readFileSync(entry), original);
    await nodeProvenance(directory, ["core"]);
  });
});

test("a consumer command cannot leave an owned descendant after its leader exits", async () => {
  const childSource = `const {spawn}=require('node:child_process'); const fs=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
fs.writeFileSync(process.argv[1],JSON.stringify({leader:process.pid,descendant:child.pid,cwd:process.cwd()}));process.exit(0);`;
  await workspace("owned-descendant", async (directory) => {
    const receipt = join(directory, "owned.json");
    let handles;
    const signal = process.kill;
    let killedGroup;
    let injectedZombieProbe = false;
    process.kill = (pid, name) => {
      if (pid < 0 && name === "SIGKILL") {
        killedGroup = pid;
        return signal.call(process, pid, name);
      }
      if (pid === killedGroup && name === 0 && !injectedZombieProbe) {
        injectedZombieProbe = true;
        throw Object.assign(new Error("injected transient zombie-only process group"), { code: "EPERM" });
      }
      return signal.call(process, pid, name);
    };
    try {
      await assert.rejects(run(process.execPath, ["-e", childSource, receipt], { cwd: directory }), /Command left an owned descendant/);
      assert.equal(injectedZombieProbe, true);
      handles = JSON.parse(readFileSync(receipt, "utf8"));
      console.log(JSON.stringify(handles));
      assert.throws(() => process.kill(handles.descendant, 0), { code: "ESRCH" });
    } finally {
      process.kill = signal;
      handles ??= JSON.parse(readFileSync(receipt, "utf8"));
      console.log(JSON.stringify(handles));
      try { process.kill(-handles.leader, "SIGKILL"); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
      for (let i = 0; i < 100; i++) {
        try { process.kill(handles.descendant, 0); }
        catch (error) { if (error.code === "ESRCH") break; throw error; }
        await delay(20);
      }
      assert.throws(() => process.kill(handles.leader, 0), { code: "ESRCH" });
      assert.throws(() => process.kill(handles.descendant, 0), { code: "ESRCH" });
    }
  });
  await workspace("denied-shutdown-owner", async (directory) => {
    const receipt = join(directory, "owned.json");
    const ownerFile = join(directory, "owner.mjs");
    writeFileSync(ownerFile, `import {existsSync} from 'node:fs';
import {run,workspace} from ${JSON.stringify(new URL("./ci-consumers.mjs", import.meta.url).href)};
const signal = process.kill.bind(process); process.kill = (pid, name) => {
  if(name === 'SIGKILL') throw Object.assign(new Error('injected denied owned signal'), {code:'EPERM'});
  return signal(pid, name);
};
const timer = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => {
  if(ms === 900000) { const ready = () => existsSync(${JSON.stringify(receipt)}) ? callback() : timer(ready,10); return timer(ready,10); }
  return timer(callback,ms,...args);
};
await workspace('denied-shutdown-child',async cwd => {
  await run(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,cwd:process.cwd()}));setInterval(()=>{},1000)",${JSON.stringify(receipt)}],{cwd});
});`);
    const owner = spawn(process.execPath, [ownerFile], { cwd: directory, stdio: "inherit", detached: true });
    console.log(JSON.stringify({ owner_pid: owner.pid, cwd: directory }));
    let watchdogFired = false;
    const watchdog = setTimeout(() => { watchdogFired = true; process.kill(-owner.pid, "SIGKILL"); }, 5000);
    try {
      const code = await new Promise((accept, reject) => { owner.once("error", reject); owner.once("close", accept); });
      assert.equal(watchdogFired, false, "CLI owner exceeded its shutdown grace");
      assert.equal(code, 1);
      const child = JSON.parse(readFileSync(receipt, "utf8"));
      console.log(JSON.stringify(child));
      assert(existsSync(child.cwd), "unconfirmed child workspace must be retained");
      assert.doesNotThrow(() => process.kill(child.pid, 0));
    } finally {
      clearTimeout(watchdog);
      try { process.kill(-owner.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      if (existsSync(receipt)) {
        const child = JSON.parse(readFileSync(receipt, "utf8"));
        console.log(JSON.stringify({ recovery_pid: child.pid, recovery_path: child.cwd }));
        process.kill(-child.pid, "SIGKILL");
        for (let i = 0; i < 100; i++) {
          try { process.kill(child.pid, 0); } catch (error) { if (error.code === "ESRCH") break; throw error; }
          await delay(20);
        }
        assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
        rmSync(child.cwd, { recursive: true });
        assert(!existsSync(child.cwd));
      }
      assert.throws(() => process.kill(owner.pid, 0), { code: "ESRCH" });
    }
  });
});

test("a persistent group-probe denial cannot prove owned shutdown", async () => {
  const childSource = `const {spawn}=require('node:child_process'); const fs=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
fs.writeFileSync(process.argv[1],JSON.stringify({leader:process.pid,descendant:child.pid,cwd:process.cwd()}));process.exit(0);`;
  await workspace("denied-group-probe-owner", async (directory) => {
    const receipt = join(directory, "owned.json");
    const ownerFile = join(directory, "owner.mjs");
    writeFileSync(ownerFile, `import assert from 'node:assert/strict'; import {existsSync} from 'node:fs';
import {run,workspace} from ${JSON.stringify(new URL("./ci-consumers.mjs", import.meta.url).href)};
const signal = process.kill; process.kill = (pid, name) => {
  if(pid < 0 && name === 0) throw Object.assign(new Error('injected persistent zombie-only process group'), {code:'EPERM'});
  return signal.call(process,pid,name);
};
let retained;
await assert.rejects(workspace('denied-group-probe-child',async cwd => {
  retained=cwd;
  await run(process.execPath,['-e',${JSON.stringify(childSource)},${JSON.stringify(receipt)}],{cwd});
}),/Owned process shutdown unconfirmed/);
assert(existsSync(retained), 'unconfirmed group workspace must be retained');`);
    const owner = spawn(process.execPath, [ownerFile], { cwd: directory, stdio: "inherit", detached: true });
    console.log(JSON.stringify({ owner_pid: owner.pid, cwd: directory }));
    let handles;
    try {
      const code = await new Promise((accept, reject) => { owner.once("error", reject); owner.once("close", accept); });
      assert.equal(code, 0);
      handles = JSON.parse(readFileSync(receipt, "utf8"));
      console.log(JSON.stringify(handles));
      assert(existsSync(handles.cwd), "unconfirmed group workspace must be retained");
    } finally {
      if (existsSync(receipt)) {
        handles ??= JSON.parse(readFileSync(receipt, "utf8"));
        try { process.kill(-handles.leader, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
        for (let i = 0; i < 100; i++) {
          try { process.kill(handles.descendant, 0); } catch (error) { if (error.code === "ESRCH") break; throw error; }
          await delay(20);
        }
        assert.throws(() => process.kill(handles.descendant, 0), { code: "ESRCH" });
        if (existsSync(handles.cwd)) rmSync(handles.cwd, { recursive: true });
        assert(!existsSync(handles.cwd));
      }
      assert.throws(() => process.kill(owner.pid, 0), { code: "ESRCH" });
    }
  });
});

function fixturePackage(directory, manifest) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ ...manifest, type: "module", exports: "./index.js" }));
  writeFileSync(join(directory, "index.js"), `export const fixture = ${JSON.stringify(manifest.name)};`);
}

async function packFixture(directory, packs) {
  await run("pnpm", ["--dir", directory, "pack", "--pack-destination", packs]);
  return packedCandidate(directory, packs);
}

test("packed dependents resolve an unpublished sibling candidate from its tarball instead of the registry", async () => {
  await workspace("sibling-candidate", async (directory) => {
    const packs = join(directory, "packs");
    mkdirSync(packs);
    fixturePackage(join(directory, "leaf"), { name: "@sendmux-ci-fixture/leaf", version: "0.0.0-fixture" });
    fixturePackage(join(directory, "dependent"), { name: "@sendmux-ci-fixture/dependent", version: "1.0.0", dependencies: { "@sendmux-ci-fixture/leaf": "0.0.0-fixture" } });
    const candidates = [await packFixture(join(directory, "leaf"), packs), await packFixture(join(directory, "dependent"), packs)];
    const consumer = join(directory, "consumer");
    newNodeConsumer(consumer, candidates);
    await run("pnpm", ["add", "--save-exact", ...candidates.map(({ archive }) => archive)], { cwd: consumer });
    await nodeProvenance(consumer, candidates.map(({ name }) => name));
  });
});

test("a packed dependent whose range excludes the candidate is not masked", async () => {
  await workspace("excluded-candidate", async (directory) => {
    const packs = join(directory, "packs");
    mkdirSync(packs);
    fixturePackage(join(directory, "leaf"), { name: "@sendmux-ci-fixture/leaf", version: "0.0.0-fixture" });
    fixturePackage(join(directory, "dependent"), { name: "@sendmux-ci-fixture/dependent", version: "1.0.0", dependencies: { "@sendmux-ci-fixture/leaf": "0.0.1" } });
    const candidates = [await packFixture(join(directory, "leaf"), packs), await packFixture(join(directory, "dependent"), packs)];
    assert.deepEqual(Object.keys(candidateOverrides(candidates)), ["@sendmux-ci-fixture/leaf@0.0.0-fixture", "@sendmux-ci-fixture/dependent@1.0.0"]);
    const consumer = join(directory, "consumer");
    newNodeConsumer(consumer, candidates);
    await assert.rejects(run("pnpm", ["add", "--save-exact", ...candidates.map(({ archive }) => archive)], { cwd: consumer }), /exit 1/);
    console.log("Expected negative: dependent range 0.0.1 excludes candidate 0.0.0-fixture and reaches the registry");
  });
});

test("nested candidate edges must be the tarball instance, not a registry copy", async () => {
  await workspace("nested-candidate-edge", async (directory) => {
    const packs = join(directory, "packs");
    mkdirSync(packs);
    await run("pnpm", ["--filter", "@sendmux/core", "pack", "--pack-destination", packs]);
    const core = packedCandidate(fileURLToPath(new URL("../packages/ts/core", import.meta.url)), packs);
    const dependent = join(directory, "dependent");
    fixturePackage(dependent, { name: "@sendmux-ci-fixture/dependent", version: "1.0.0", dependencies: { "@sendmux/core": "1.1.0" } });
    const registryEdge = [core, await packFixture(dependent, packs)];
    const registryConsumer = join(directory, "registry-edge");
    newNodeConsumer(registryConsumer, registryEdge);
    await run("pnpm", ["add", "--save-exact", ...registryEdge.map(({ archive }) => archive)], { cwd: registryConsumer });
    await assert.rejects(nodeProvenance(registryConsumer, registryEdge.map(({ name }) => name)), /exit 1/);
    console.log("Expected negative: dependent pinned to published @sendmux/core 1.1.0 resolved a registry copy");
    const candidatePacks = join(directory, "candidate-packs");
    mkdirSync(candidatePacks);
    fixturePackage(dependent, { name: "@sendmux-ci-fixture/dependent", version: "1.0.0", dependencies: { "@sendmux/core": core.version } });
    const candidateEdge = [core, await packFixture(dependent, candidatePacks)];
    const candidateConsumer = join(directory, "candidate-edge");
    newNodeConsumer(candidateConsumer, candidateEdge);
    await run("pnpm", ["add", "--save-exact", ...candidateEdge.map(({ archive }) => archive)], { cwd: candidateConsumer });
    await nodeProvenance(candidateConsumer, candidateEdge.map(({ name }) => name));
  });
});
