import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { nodeProvenance, nodeTests, run, workspace } from "./ci-consumers.mjs";

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
  await workspace("owned-descendant", async (directory) => {
    const receipt = join(directory, "owned.json");
    const childSource = `const {spawn}=require('node:child_process'); const fs=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
fs.writeFileSync(process.argv[1],JSON.stringify({leader:process.pid,descendant:child.pid}));process.exit(0);`;
    let handles;
    try {
      await assert.rejects(run(process.execPath, ["-e", childSource, receipt], { cwd: directory }), /(?:shutdown|descendant)/);
      handles = JSON.parse(readFileSync(receipt, "utf8"));
      console.log(JSON.stringify(handles));
      assert.throws(() => process.kill(handles.descendant, 0), { code: "ESRCH" });
    } finally {
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
