import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const root = process.cwd();
const distDir = join(root, ".tmp", "python-dist");
const publishDir = join(root, ".tmp", "python-publish");
const packages = ["core", "sending", "mailbox", "management", "sdk"];

rmSync(publishDir, { force: true, recursive: true });
mkdirSync(publishDir, { recursive: true });

let copied = 0;

for (const packagePath of packages.map((name) => join(root, "packages", "python", name))) {
  const { name, version } = readProject(packagePath);
  if (await existsOnPyPI(name, version)) {
    console.log(`${name}@${version} already exists on PyPI; skipping`);
    continue;
  }

  const prefix = `${name.replaceAll("-", "_")}-${version}`;
  for (const file of readdirSync(distDir)) {
    if (file.startsWith(prefix)) {
      copyFileSync(join(distDir, file), join(publishDir, file));
      copied += 1;
    }
  }
}

if (process.env.GITHUB_OUTPUT) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_files=${copied > 0}\n`);
}

console.log(`Prepared ${copied} PyPI distribution file(s) in ${publishDir}`);

function readProject(path) {
  const pyproject = readFileSync(join(path, "pyproject.toml"), "utf8");
  const name = match(pyproject, /^name = "([^"]+)"$/m, "project name");
  const version = match(pyproject, /^version = "([^"]+)"$/m, "project version");
  return { name, version };
}

async function existsOnPyPI(name, version) {
  const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`);
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`PyPI lookup failed for ${name}@${version}: HTTP ${response.status}`);
  }
  return true;
}

function match(value, regex, label) {
  const result = value.match(regex);
  if (!result) {
    throw new Error(`Could not read ${label}`);
  }
  return result[1];
}

