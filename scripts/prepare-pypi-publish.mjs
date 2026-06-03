import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const root = process.cwd();
const distDir = join(root, ".tmp", "python-dist");
const publishDir = join(root, ".tmp", "python-publish");
const packages = ["core", "sending", "mailbox", "management", "sdk", "mcp"];

rmSync(publishDir, { force: true, recursive: true });
mkdirSync(publishDir, { recursive: true });

let copied = 0;

for (const packagePath of packages.map((name) => join(root, "packages", "python", name))) {
  const { name, version } = readProject(packagePath);
  const publishedFilenames = await readPublishedFilenames(name, version);
  const prefix = `${name.replaceAll("-", "_")}-${version}`;
  const localFiles = readdirSync(distDir)
    .filter((file) => file.startsWith(prefix))
    .sort();

  if (localFiles.length === 0) {
    throw new Error(`No local distributions found for ${name}@${version}`);
  }

  let copiedForPackage = 0;
  for (const file of localFiles) {
    if (publishedFilenames.has(file)) {
      console.log(`${name}@${version} ${file} already exists on PyPI; skipping`);
      continue;
    }

    copyFileSync(join(distDir, file), join(publishDir, file));
    copied += 1;
    copiedForPackage += 1;
  }

  if (copiedForPackage === 0) {
    console.log(`${name}@${version} already has all local distributions on PyPI; skipping`);
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

async function readPublishedFilenames(name, version) {
  const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`);
  if (response.status === 404) {
    return new Set();
  }
  if (!response.ok) {
    throw new Error(`PyPI lookup failed for ${name}@${version}: HTTP ${response.status}`);
  }

  const release = await response.json();
  if (!Array.isArray(release.urls)) {
    throw new Error(`PyPI lookup for ${name}@${version} did not include distribution files`);
  }

  return new Set(
    release.urls.map((file) => {
      if (typeof file.filename !== "string") {
        throw new Error(`PyPI lookup for ${name}@${version} included a distribution without a filename`);
      }
      return file.filename;
    }),
  );
}

function match(value, regex, label) {
  const result = value.match(regex);
  if (!result) {
    throw new Error(`Could not read ${label}`);
  }
  return result[1];
}
