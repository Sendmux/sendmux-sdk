import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootIndex = process.argv.indexOf("--root");
const root = rootIndex < 0 ? resolve(dirname(fileURLToPath(import.meta.url)), "..") : resolve(process.argv[rootIndex + 1]);
const manifest = JSON.parse(readFileSync(join(root, ".release-please-manifest.json"), "utf8"));
const config = readJson("release-please-config.json");
const owners = [
  ...packagePaths("ts", "package.json"),
  ...packagePaths("python", "pyproject.toml"),
  ...packagePaths("ruby", (name) => `sendmux-${name}.gemspec`),
  "go", "rust",
].sort();
assert.deepEqual(Object.keys(manifest).sort(), owners, "Release manifest owners must match native packages (PHP uses split tags)");
assert.deepEqual(Object.keys(config.packages).sort(), owners, "Release config owners must match native packages (PHP uses split tags)");
const mismatches = Object.entries(manifest)
  .filter(([packagePath]) => packagePath.startsWith("packages/ts/"))
  .flatMap(([packagePath, manifestVersion]) => {
    const packageJson = JSON.parse(readFileSync(join(root, packagePath, "package.json"), "utf8"));
    return packageJson.version === manifestVersion
      ? []
      : [`${packageJson.name}: package ${packageJson.version}, manifest ${manifestVersion}`];
  });

assert.equal(mismatches.length, 0, `TypeScript release state mismatch:\n${mismatches.join("\n")}`);
console.log("TypeScript release state matches package metadata.");

for (const path of owners) {
  const owner = { ...config, ...config.packages[path] };
  let name;
  let version;
  let releaseType;
  if (path.startsWith("packages/ts/")) {
    ({ name, version } = readJson(`${path}/package.json`));
    releaseType = "node";
  } else if (path.startsWith("packages/python/")) {
    name = tomlField(`${path}/pyproject.toml`, "project", "name");
    version = tomlField(`${path}/pyproject.toml`, "project", "version");
    releaseType = "python";
    const generatedInit = join(root, path, name.replaceAll("-", "_"), "__init__.py");
    if (existsSync(generatedInit)) {
      const generated = readFileSync(generatedInit, "utf8").match(/^__version__ = "([^"]+)"$/m)?.[1];
      if (generated) assert.equal(generated, version, `${path} generated __version__ must match project.version`);
    }
  } else if (path === "rust") {
    name = tomlField("rust/Cargo.toml", "package", "name");
    version = tomlField("rust/Cargo.toml", "package", "version");
    releaseType = "rust";
  } else if (path === "go") {
    name = readFileSync(join(root, "go/go.mod"), "utf8").match(/^module\s+(\S+)$/m)?.[1];
    releaseType = "go";
    assert.equal(owner.component, "go", "Go tags require component go");
    assert.equal(owner["tag-separator"], "/", "Go tags require go/v<version>");
    assert.equal(owner["include-component-in-tag"], true, "Go tags include component");
    assert.equal(owner["include-v-in-tag"], true, "Go tags include v");
  } else {
    releaseType = "ruby";
    assert.equal(typeof owner["version-file"], "string", `${path} requires a configured version-file`);
    version = readFileSync(join(root, path, owner["version-file"]), "utf8").match(/VERSION = ['"]([^'"]+)['"]/)?.[1];
    const gemspecs = readdirSync(join(root, path)).filter((file) => file.endsWith(".gemspec"));
    assert.equal(gemspecs.length, 1, `${path} must have one native gem identity`);
    const result = await readGemMetadata(join(root, path, gemspecs[0]));
    assert.equal(result.status, 0, `${path} native gemspec failed: ${result.stderr}`);
    const gem = JSON.parse(result.stdout);
    name = gem.name;
    assert.equal(gem.version, version, `${path} gemspec must use configured version-file`);
  }
  assert.equal(owner["release-type"], releaseType, `${path} release type`);
  assert.equal(name, owner["package-name"], `${path} native identity must match release config`);
  if (path !== "go") assert.equal(version, manifest[path], `${path} native version must match release manifest`);
}

const phpPaths = packagePaths("php", "composer.json");
const phpNames = new Set(phpPaths.map((path) => `sendmux/${path.split("/").at(-1)}`));
for (const path of phpPaths) {
  const composer = readJson(`${path}/composer.json`);
  assert.equal(composer.name, `sendmux/${path.split("/").at(-1)}`, `${path} Composer identity`);
  assert.equal(Object.hasOwn(composer, "version"), false, `${path} versions belong to split-repository tags, not composer.version`);
  for (const [dependency, constraint] of Object.entries(composer.require ?? {})) {
    if (!dependency.startsWith("sendmux/")) continue;
    assert.ok(phpNames.has(dependency), `${path} unknown Sendmux dependency ${dependency}`);
    assert.equal(typeof constraint, "string", `${path} Composer constraint must be a string`);
    assert.ok(constraint.trim(), `${path} Composer constraint must not be empty`);
  }
  if (composer.name === "sendmux/sdk") {
    assert.deepEqual(Object.keys(composer.require).filter((name) => name.startsWith("sendmux/")).sort(), [...phpNames].filter((name) => name !== "sendmux/sdk").sort(), "PHP umbrella must require every split package");
  }
}
console.log(`Native release state matches ${owners.length} release-please owners; ${phpPaths.length} PHP packages retain manual split-tag versioning. Go published tags and PHP published versions are not checked here.`);

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

async function readGemMetadata(gemspec) {
  const child = spawn("ruby", ["-rjson", "-e", "s = Gem::Specification.load(ARGV[0]); abort 'invalid gemspec' unless s; puts JSON.generate({name: s.name, version: s.version.to_s})", gemspec]);
  console.log(`Ruby metadata child ${child.pid} started`);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; });
  child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try {
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
    console.log(`Ruby metadata child ${child.pid} ESRCH`);
    return { status, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

function packagePaths(language, metadataFile) {
  return readdirSync(join(root, "packages", language), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, "packages", language, entry.name, typeof metadataFile === "function" ? metadataFile(entry.name) : metadataFile)))
    .map((entry) => `packages/${language}/${entry.name}`);
}

function tomlField(path, section, field) {
  let selected = false;
  for (const line of readFileSync(join(root, path), "utf8").split(/\r?\n/)) {
    if (line.startsWith("[")) selected = line === `[${section}]`;
    if (selected) {
      const value = line.match(new RegExp(`^${field} = ["']([^"']+)["']$`))?.[1];
      if (value) return value;
    }
  }
  throw new Error(`${path} has no ${section}.${field}`);
}
