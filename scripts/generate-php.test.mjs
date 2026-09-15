import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { run, workspace } from "./ci-consumers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = ["sending", "mailbox", "management"];

function generatedHashes(directory) {
  const hashes = {};
  function visit(relative) {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
      const name = join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else hashes[name] = createHash("sha256").update(readFileSync(join(directory, name))).digest("hex");
    }
  }
  for (const name of surfaces) visit(join("packages", "php", name, "src"));
  return hashes;
}

function prepareFixture(directory) {
  mkdirSync(join(directory, "scripts"));
  for (const name of ["generate-php.mjs", "normalize-openapi-for-codegen.mjs"]) {
    cpSync(join(root, "scripts", name), join(directory, "scripts", name));
  }
  for (const name of ["package.json", "openapitools.json", "phpcs.xml"]) cpSync(join(root, name), join(directory, name));
  cpSync(join(root, "codegen/templates/php-nextgen"), join(directory, "codegen/templates/php-nextgen"), { recursive: true });
  cpSync(join(root, "packages/python/mcp/sendmux_mcp/openapi"), join(directory, "sendmux-docs"), { recursive: true });
  for (const name of ["node_modules", "vendor"]) symlinkSync(join(root, name), join(directory, name), "junction");
  writeFileSync(join(directory, "versions.php"), String.raw`<?php
$result = [];
foreach (['sending', 'mailbox', 'management'] as $name) {
    require __DIR__ . '/packages/php/' . $name . '/src/Configuration.php';
    $class = 'Sendmux\\' . ucfirst($name) . '\\Configuration';
    preg_match('/SDK Package Version: ([^\r\n]+)/', $class::toDebugReport(), $version);
    $result[$name] = ['userAgent' => (new $class())->getUserAgent(), 'version' => $version[1]];
}
echo json_encode($result, JSON_THROW_ON_ERROR);
`);
}

await test("Mailbox generation can change version without changing sibling packages", async () => {
  await workspace("php-generator-versions", async (directory) => {
    prepareFixture(directory);
    const env = { ...process.env, OPENAPI_INPUT_DIR: join(directory, "sendmux-docs"), OPENAPI_OUTPUT_DIR: join(directory, ".codegen") };
    await run(process.execPath, ["scripts/generate-php.mjs"], { cwd: directory, env });
    const before = generatedHashes(directory);
    const baseline = JSON.parse(await run("php", ["versions.php"], { cwd: directory, captureOutput: true }));

    // Mutate only the fixture's Mailbox version input; generation and output reads stay real.
    const generator = join(directory, "scripts/generate-php.mjs");
    const source = readFileSync(generator, "utf8");
    const mailboxVersion = `${Number(baseline.mailbox.version.split(".")[0]) + 1}.0.0`; // Synthetic next major, not a release decision.
    writeFileSync(generator, source.replace(/(name: "mailbox",[\s\S]*?)(\n  },)/, (_, fields, end) =>
      fields.replace(/\n    artifactVersion: "[^"]+",/, "") + `\n    artifactVersion: "${mailboxVersion}",` + end));
    await run(process.execPath, ["scripts/generate-php.mjs"], { cwd: directory, env });
    const after = generatedHashes(directory);
    const actual = JSON.parse(await run("php", ["versions.php"], { cwd: directory, captureOutput: true }));
    assert.deepEqual(actual, {
      ...baseline,
      mailbox: { userAgent: `OpenAPI-Generator/${mailboxVersion}/PHP`, version: mailboxVersion },
    });
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(name => before[name] !== after[name]);
    assert.deepEqual(changed, [join("packages", "php", "mailbox", "src", "Configuration.php")]);
    console.log(JSON.stringify({ generated_files: Object.keys(after).length, changed, public_versions: actual }));
  });
});

await test("PHP split verification honours independent versions and the aggregate Mailbox range", async () => {
  await workspace("php-split-versions", async (directory) => {
    const versions = { core: "2.1.1", sending: "2.1.1", mailbox: "3.0.0", management: "2.1.1", sdk: "3.0.0" };
    let checker = readFileSync(join(root, "scripts/check-php-splits.mjs"), "utf8");
    for (const [name, version] of Object.entries(versions)) {
      cpSync(join(root, "packages/php", name), join(directory, "packages/php", name), { recursive: true });
      checker = checker.replace(new RegExp(`(\\{ name: "${name}",[^}]+)(})`), (_, fields, end) =>
        fields.replace(/, fixtureVersion: "[^"]+"/, "").trimEnd() + `, fixtureVersion: "${version}" ` + end);
    }
    writeFileSync(join(directory, "check-php-splits.mjs"), checker);
    writeFileSync(join(directory, "run-split-check.mjs"), String.raw`
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const child = spawnSync(process.execPath, ["check-php-splits.mjs"], {
  encoding: "utf8", timeout: 120000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
});
console.log(JSON.stringify({ split_check_pid: child.pid, status: child.status }));
assert.ifError(child.error);
assert.equal(child.signal, null);
assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
writeFileSync("split-result.json", JSON.stringify({ status: child.status, stdout: child.stdout, stderr: child.stderr }));
`);
    const manifestPath = join(directory, "packages/php/sdk/composer.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.require["sendmux/mailbox"] = "^2.1";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    await run(process.execPath, ["run-split-check.mjs"], { cwd: directory });
    const rejected = JSON.parse(readFileSync(join(directory, "split-result.json"), "utf8"));
    console.log(JSON.stringify({ legacy_range: rejected }));
    assert.notEqual(rejected.status, 0, "The legacy aggregate range must reject the independently versioned Mailbox");
    assert.match(rejected.stderr, /requires sendmux\/mailbox \^2\.1/);

    manifest.require["sendmux/mailbox"] = "^3.0";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    await run(process.execPath, ["run-split-check.mjs"], { cwd: directory });
    const accepted = JSON.parse(readFileSync(join(directory, "split-result.json"), "utf8"));
    assert.equal(accepted.status, 0, accepted.stderr);
    const installed = JSON.parse(await run("php", ["-r", String.raw`
require '.tmp/php-split-consumer/vendor/autoload.php';
$versions = [];
foreach (['core', 'sending', 'mailbox', 'management', 'sdk'] as $name) {
    $versions[$name] = ltrim(Composer\InstalledVersions::getPrettyVersion('sendmux/' . $name), 'v');
}
echo json_encode($versions, JSON_THROW_ON_ERROR);
`], { cwd: directory, captureOutput: true }));
    assert.deepEqual(installed, versions);
    console.log(JSON.stringify({ independent_split_versions: installed }));
  });
});

await test("PHP split verification installs every candidate against synthetic sibling versions", async () => {
  await workspace("php-split-independent-installs", async (directory) => {
    const versions = {
      core: "91.2.3",
      sending: "92.3.4",
      mailbox: "93.4.5",
      management: "94.5.6",
      sdk: "95.6.7",
    };
    let checker = readFileSync(join(root, "scripts/check-php-splits.mjs"), "utf8");

    for (const [name, version] of Object.entries(versions)) {
      const packageRoot = join(directory, "packages", "php", name);
      cpSync(join(root, "packages", "php", name), packageRoot, { recursive: true });
      const manifestPath = join(packageRoot, "composer.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const dependency of Object.keys(manifest.require)) {
        const sibling = dependency.match(/^sendmux\/(.+)$/)?.[1];
        if (sibling) manifest.require[dependency] = `^${versions[sibling]}`;
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      checker = checker.replace(new RegExp(`(\\{ name: "${name}",[^}]+)(})`), (_, fields, end) =>
        fields.replace(/, fixtureVersion: "[^"]+"/, "").trimEnd() + `, fixtureVersion: "${version}" ` + end);
    }

    writeFileSync(join(directory, "check-php-splits.mjs"), checker);
    await run(process.execPath, ["check-php-splits.mjs"], { cwd: directory });

    const internalDependencies = {
      core: [],
      sending: ["core"],
      mailbox: ["core"],
      management: ["core"],
      sdk: ["core", "sending", "mailbox", "management"],
    };
    for (const [name, dependencies] of Object.entries(internalDependencies)) {
      const splitRoot = join(directory, ".tmp", "php-splits", `sendmux-php-${name}`);
      assert(existsSync(join(splitRoot, "vendor", "autoload.php")), `${name} split was not installed independently`);
      const installed = JSON.parse(await run("php", ["-r", String.raw`
require 'vendor/autoload.php';
$versions = [];
foreach (${JSON.stringify(dependencies)} as $name) {
    $versions[$name] = ltrim(Composer\InstalledVersions::getPrettyVersion('sendmux/' . $name), 'v');
}
echo json_encode($versions, JSON_THROW_ON_ERROR);
`], { cwd: splitRoot, captureOutput: true }));
      const expected = dependencies.length
        ? Object.fromEntries(dependencies.map(dependency => [dependency, versions[dependency]]))
        : [];
      assert.deepEqual(installed, expected);
      console.log(JSON.stringify({ split: name, installed }));
    }
  });
});
