#!/usr/bin/env node
import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { checkSource, git, immutableSha } from "./publication-guard.mjs";

function options() {
  const result = {};
  const allowed = ["sdk-repo", "sdk-sha", "split-repo", "split-sha", "package", "version", "evidence"];
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.slice(2);
    if (!args[index].startsWith("--") || !allowed.includes(key) || !args[index + 1] || result[key]) throw new Error(`Invalid argument: ${args[index]}`);
    result[key] = args[index + 1];
  }
  for (const key of allowed.filter((key) => key !== "evidence")) if (!result[key]) throw new Error(`Missing --${key}`);
  if (!["core", "sending", "mailbox", "management", "sdk"].includes(result.package) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(result.version)) throw new Error("Invalid PHP package/version");
  immutableSha(result["sdk-sha"]); immutableSha(result["split-sha"]);
  if (result.evidence && !/^evidence\/[a-z0-9-]+-\d{8}\.md$/.test(result.evidence)) throw new Error("Expected one explicit release evidence filename");
  return result;
}

async function tree({ repo, revision }) {
  const listing = await git({ repo, args: ["ls-tree", "-rz", revision] });
  return new Map(listing.split("\0").filter(Boolean).map((line) => {
    const [metadata, file] = line.split("\t");
    if (!file) throw new Error("Invalid package tree entry");
    return [file, metadata];
  }));
}

async function proveSplit(input) {
  const sdk = resolve(input["sdk-repo"]);
  const split = resolve(input["split-repo"]);
  const source = input["sdk-sha"];
  const target = input["split-sha"];
  const run = (args) => git({ repo: split, args });
  if ((await run(["rev-parse", "HEAD"])).trim() !== target) throw new Error("Split checkout does not match exact split merge SHA");
  if ((await run(["status", "--porcelain", "--untracked-files=all"])).trim()) throw new Error("Split checkout is dirty");
  if ((await git({ repo: sdk, args: ["rev-parse", `${source}^{commit}`] })).trim() !== source) throw new Error("SDK source is not an exact commit");
  const sourceRoot = `${source}:packages/php/${input.package}`;
  const original = await tree({ repo: sdk, revision: sourceRoot });
  const actual = await tree({ repo: split, revision: target });
  if (input.evidence) {
    if (!actual.has(input.evidence) || original.has(input.evidence)) throw new Error("Missing or ambiguous release evidence file");
    const evidence = await run(["show", `${target}:${input.evidence}`]);
    if (!evidence.includes(source)) throw new Error("Release evidence does not identify SDK source SHA");
    actual.delete(input.evidence);
  }
  if (JSON.stringify([...original.keys()].sort()) !== JSON.stringify([...actual.keys()].sort())) throw new Error("Split package file set differs from SDK source");
  for (const [file, metadata] of original) {
    if (metadata === actual.get(file)) continue;
    if (file !== "CHANGELOG.md" || metadata.split(" ")[0] !== actual.get(file)?.split(" ")[0]) throw new Error(`Split contents differ: ${file}`);
    const before = await git({ repo: sdk, args: ["show", `${sourceRoot}/${file}`] });
    const after = await run(["show", `${target}:${file}`]);
    const heading = after.match(/^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) \((\d{4}-\d{2}-\d{2})\)$/m);
    if (!heading || heading[1] !== input.version || !before.includes("\n## Unreleased\n")
      || before.replace("\n## Unreleased\n", `\n${heading[0]}\n`) !== after) throw new Error("Split changelog differs beyond the intended dated heading");
  }
  const composer = JSON.parse(await run(["show", `${target}:composer.json`]));
  if (composer.name !== `sendmux/${input.package}` || Object.hasOwn(composer, "version")) throw new Error("Split Composer identity/version metadata mismatch");
  const changelog = await run(["show", `${target}:CHANGELOG.md`]);
  if (changelog.match(/^## ([^\n]+)/m)?.[1]?.split(" ")[0] !== input.version) throw new Error("Split changelog does not identify intended version");
  const nativeFile = input.package === "sdk" ? "src/Sdk.php" : "src/Configuration.php";
  if (actual.has(nativeFile)) {
    const content = await run(["show", `${target}:${nativeFile}`]);
    const version = input.package === "sdk" ? content.match(/VERSION\s*=\s*['"]([^'"]+)/)?.[1] : content.match(/SDK Package Version: ([0-9A-Za-z.-]+)/)?.[1];
    if (version !== input.version) throw new Error("Split native version mismatch");
  }
  const destinations = (await run(["remote", "get-url", "--push", "--all", "origin"])).trim().split("\n");
  if (destinations.length !== 1 || !destinations[0]) throw new Error("PHP publication requires exactly one push destination");
  const remote = destinations[0];
  const expected = `sendmux-php-${input.package}`;
  const official = remote === `git@github.com:Sendmux/${expected}.git` || remote === `https://github.com/Sendmux/${expected}.git` || remote === `https://github.com/Sendmux/${expected}`;
  const local = remote.startsWith("/") && basename(remote) === `${expected}.git` && statSync(remote).isDirectory()
    && (await git({ repo: remote, args: ["rev-parse", "--is-bare-repository"] })).trim() === "true";
  if (!official && !local) throw new Error("Split origin does not identify the expected package repository");
  return { sdk, split, source, target, run, remote };
}

async function publish() {
  const input = options();
  const candidate = await proveSplit(input);
  const tag = `v${input.version}`;
  const local = (await candidate.run(["tag", "--list", tag])).trim();
  if (local && ((await candidate.run(["rev-parse", `${tag}^{}`])).trim() !== candidate.target
    || (await candidate.run(["cat-file", "-t", `refs/tags/${tag}`])).trim() !== "tag")) throw new Error("Existing local tag conflicts with exact annotated split target");
  const remote = await candidate.run(["ls-remote", candidate.remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  if (remote && !remote.split("\n").includes(`${candidate.target}\trefs/tags/${tag}^{}`)) throw new Error("Existing remote tag conflicts with exact annotated split target");
  const receipt = await checkSource({ sha: candidate.source, read: (file) => git({ repo: candidate.sdk, args: ["show", `${candidate.source}:${file}`] }) });
  console.log(JSON.stringify({ package: input.package, version: input.version, split: candidate.target, source: receipt, checkedAt: new Date().toISOString() }));
  if (remote) return; // A retry still checked live parity; the exact remote tag already exists.
  if (!local) await candidate.run(["tag", "-a", tag, candidate.target, "-m", `Release ${input.package} ${input.version}\nSDK source ${candidate.source}\nSnapshots ${JSON.stringify(receipt.hashes)}`]);
  await candidate.run(["push", candidate.remote, `refs/tags/${tag}:refs/tags/${tag}`]);
}

await publish().catch((error) => { console.error(error.stderr ?? error.message); process.exitCode = 1; });
