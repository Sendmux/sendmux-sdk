#!/usr/bin/env node
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const controlRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const snapshotPath = "packages/python/mcp/sendmux_mcp/openapi";
const snapshots = ["openapi-app.json", "openapi-sending.json"];
const repository = "Sendmux/sendmux-sdk";
const actionPin = "0dfd8538845b8e92600d271a895a5372865d4062";
const bundleHash = "a0aa8451ba5d9666bebc2c21e2bcbabcc942fe0a6ee6752886ebebdf0234f3fb";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const invocation = new AbortController();
let localGitVariables;

export function gitEnvironment(environment = process.env) {
  // Git's documented hook boundary: -C does not override inherited repository selection.
  localGitVariables ??= execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", timeout: 15_000 }).trim().split("\n");
  const env = { ...environment };
  for (const name of localGitVariables) delete env[name];
  return env;
}

export async function git({ repo, args }) {
  return (await execute("git", ["-C", repo, ...args], { env: gitEnvironment(), timeout: 15_000, signal: invocation.signal, maxBuffer: 16 * 1024 * 1024 })).stdout;
}

export function immutableSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error("Expected an immutable 40-character commit SHA");
  return value;
}

// Read the immutable source, never substitute newer docs for missing snapshots.
export async function checkSource({ sha, read }) {
  immutableSha(sha);
  const directory = mkdtempSync(join(tmpdir(), "sendmux-publication-specs-"));
  const hashes = {};
  try {
    for (const name of snapshots) {
      const bytes = await read(`${snapshotPath}/${name}`);
      hashes[name] = digest(bytes);
      writeFileSync(join(directory, name), bytes);
    }
    console.log(JSON.stringify({ control: (await git({ repo: controlRoot, args: ["rev-parse", "HEAD"] })).trim(), candidate: { sha, hashes }, checkedAt: new Date().toISOString(), status: "checking" }));
    const { stdout } = await execute(process.execPath, [join(controlRoot, "scripts/check-openapi-canary.mjs"), "--docs-dir", directory], {
      timeout: 40_000, signal: invocation.signal, maxBuffer: 1024 * 1024,
    });
    console.log(stdout.trim());
    return { sha, hashes };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function checkCandidate({ repo, sha, releases = [] }) {
  immutableSha(sha);
  const head = (await git({ repo, args: ["rev-parse", "HEAD"] })).trim();
  if (head !== sha) throw new Error(`Publishing checkout ${head} does not match candidate ${sha}`);
  const read = (file) => git({ repo, args: ["show", `${sha}:${file}`] });
  for (const name of snapshots) {
    const file = `${snapshotPath}/${name}`;
    if (digest(readFileSync(join(repo, file))) !== digest(await read(file))) throw new Error(`Candidate snapshot changed: ${name}`);
  }
  for (const release of releases) {
    if (release.sha !== sha || await resolveTag(release.tag) !== sha) throw new Error(`Release tag does not identify candidate: ${release.tag}`);
    await assertNativeVersion({ release, read });
  }
  const receipt = await checkSource({ sha, read });
  console.log(JSON.stringify({ control: (await git({ repo: controlRoot, args: ["rev-parse", "HEAD"] })).trim(), candidate: receipt, checkedAt: new Date().toISOString() }));
  return receipt;
}

async function boundedResponse(url, options = {}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, invocation.signal]);
  let reader;
  const cancelReader = () => { void reader?.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", cancelReader, { once: true });
  const timer = setTimeout(() => {
    const error = new Error("Publication read deadline exceeded");
    controller.abort(error);
  }, 15_000);
  try {
    const response = await fetch(url, { ...options, redirect: "error", signal });
    const chunks = [];
    let size = 0;
    reader = response.body.getReader();
    while (true) {
      const { done, value: chunk } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += chunk.byteLength;
      if (size > 8 * 1024 * 1024) throw new Error("Publication read exceeds 8 MiB");
      chunks.push(chunk);
    }
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
    controller.abort();
    signal.removeEventListener("abort", cancelReader);
  }
}

async function github(route, { missing = false } = {}) {
  const response = await boundedResponse(`https://api.github.com/repos/${repository}${route ? `/${route}` : ""}`, {
    headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  });
  if (missing && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`GitHub read failed: HTTP ${response.status}`);
  return { data: await response.json(), headers: response.headers };
}

export async function resolveTag(tag) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(tag) || tag.includes("..")) throw new Error("Invalid release tag");
  const ref = await github(`git/ref/tags/${encodeURIComponent(tag)}`, { missing: true });
  if (!ref) return undefined;
  let object = ref.data.object;
  for (let depth = 0; depth < 8; depth += 1) {
    immutableSha(object.sha);
    if (object.type === "commit") return object.sha;
    if (object.type !== "tag") throw new Error("Release ref does not identify a commit");
    object = (await github(`git/tags/${object.sha}`)).data.object;
  }
  throw new Error("Release tag nesting exceeds bound");
}

async function assertNativeVersion({ release, read }) {
  let version;
  if (release.path.startsWith("packages/ts/")) version = JSON.parse(await read(`${release.path}/package.json`)).version;
  else if (release.path.startsWith("packages/python/")) version = (await read(`${release.path}/pyproject.toml`)).match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  else if (release.path === "rust") version = (await read("rust/Cargo.toml")).match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  else if (release.path.startsWith("packages/ruby/")) {
    const component = release.path.split("/").at(-1);
    version = (await read(`${release.path}/lib/sendmux/${component}/version.rb`)).match(/VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
  } else if (release.path === "go") return; // Go's module identity is the checked tag itself.
  else throw new Error(`Unsupported publication package: ${release.path}`);
  if (version !== release.version) throw new Error(`Native version does not match release ${release.tag}`);
}

async function remoteFile({ sha, file }) {
  const result = await github(`contents/${file}?ref=${encodeURIComponent(sha)}`);
  if (result.data.encoding !== "base64" || typeof result.data.content !== "string") throw new Error(`Missing candidate file: ${file}`);
  return Buffer.from(result.data.content, "base64").toString("utf8");
}

function repositoryPrefixes(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid GitHub repository metadata id");
  return [`/repos/${repository}`, `/repositories/${id}`];
}

function isRepositoryRequest(pathname, prefixes) {
  return prefixes.some((prefix) => pathname.startsWith(`${prefix}/`));
}

async function discoverWindow(prefixes) {
  const window = [];
  const seen = new Set();
  let route = "pulls?state=closed&base=main&sort=updated&direction=desc";
  for (let page = 0; page < 20; page += 1) {
    const response = await github(route);
    if (!Array.isArray(response.data)) throw new Error("Invalid pull request discovery response");
    for (const pull of response.data) {
      if (!Number.isInteger(pull.number) || seen.has(pull.number)) throw new Error("Duplicate or invalid discovery row");
      seen.add(pull.number);
      if (!pull.merged_at) continue;
      if (pull.base?.ref !== "main" || !Array.isArray(pull.labels) || !pull.updated_at) throw new Error("Invalid merged discovery row");
      window.push({ number: pull.number, sha: immutableSha(pull.merge_commit_sha), labels: pull.labels.map((label) => label.name).sort(), updatedAt: pull.updated_at });
      if (window.length === 200) return window;
    }
    const next = response.headers.get("link")?.split(",").find((link) => /rel="next"/.test(link))?.match(/<([^>]+)>/)?.[1];
    if (!next) return window;
    const url = new URL(next);
    if (url.origin !== "https://api.github.com" || !prefixes.some((prefix) => url.pathname === `${prefix}/pulls`)
      || url.searchParams.get("state") !== "closed" || url.searchParams.get("base") !== "main"
      || url.searchParams.get("sort") !== "updated" || url.searchParams.get("direction") !== "desc"
      || Number(url.searchParams.get("page")) !== page + 2 || url.searchParams.has("per_page")) throw new Error("Non-progressing discovery pagination");
    route = `pulls${url.search}`;
  }
  throw new Error("Candidate discovery exceeded its page bound");
}

async function buildOfficialReleases(prefixes) {
  const { GitHub, Manifest } = await import("release-please");
  let reads = 0;
  let pullPages = 0;
  const started = Date.now();
  const client = await GitHub.create({ owner: "Sendmux", repo: "sendmux-sdk", defaultBranch: "main", token: process.env.GITHUB_TOKEN,
    fetch: async (input, options = {}) => {
      const url = new URL(input);
      if ((options.method ?? "GET").toUpperCase() !== "GET" || url.origin !== "https://api.github.com"
        || !isRepositoryRequest(url.pathname, prefixes)) throw new Error("Release construction attempted a non-read request");
      if (++reads > 100 || Date.now() - started > 90_000) throw new Error("Release construction exceeded read budget");
      if (url.pathname.endsWith("/pulls") && ++pullPages > 20) throw new Error("Release discovery exceeded page bound");
      return boundedResponse(url, options);
    },
  });
  const manifest = await Manifest.fromManifest(client, "main", "release-please-config.json", ".release-please-manifest.json");
  return (await manifest.buildReleases()).map((release) => ({ path: release.path, tag: release.tag.toString(), version: release.tag.version.toString(), sha: immutableSha(release.sha) }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.tag.localeCompare(b.tag));
}

async function releaseState({ repo, sha }) {
  if (process.env.GITHUB_REPOSITORY !== repository) throw new Error("Unexpected publication repository");
  const metadata = await github("");
  const prefixes = repositoryPrefixes(metadata.data.id);
  const head = immutableSha((await github("git/ref/heads/main")).data.object.sha);
  if (metadata.data.default_branch !== "main" || head !== sha) throw new Error("Event is superseded or target head changed");
  const files = {};
  for (const file of ["release-please-config.json", ".release-please-manifest.json", ".github/workflows/release-please.yml"]) {
    const bytes = await remoteFile({ sha: "main", file });
    if (bytes !== await git({ repo, args: ["show", `${sha}:${file}`] })) throw new Error(`Control configuration changed: ${file}`);
    files[file] = bytes;
  }
  const config = JSON.parse(files["release-please-config.json"]);
  const actionBlocks = files[".github/workflows/release-please.yml"].split("uses: googleapis/release-please-action@");
  const actionLines = actionBlocks[1]?.split(/^      - /m)[0].trim().split("\n").map((line) => line.trim());
  if (actionBlocks.length !== 2 || actionLines?.[0]?.split(/\s/)[0] !== actionPin
    || JSON.stringify(actionLines.slice(1)) !== JSON.stringify(["with:", "config-file: release-please-config.json", "manifest-file: .release-please-manifest.json"])) throw new Error("Unsupported Release Please action inputs/configuration");
  if (config.label || config["release-label"] || config["sequential-calls"] !== true || config["separate-pull-requests"] !== true
    || !files[".github/workflows/release-please.yml"].includes(`googleapis/release-please-action@${actionPin}`)) throw new Error("Unsupported Release Please configuration or pin");
  for (const entry of [config, ...Object.values(config.packages)]) {
    if (!["node", "python", "ruby", "rust", "go"].includes(entry["release-type"] ?? config["release-type"]) || entry["force-tag"] || entry.label || entry["release-label"]) throw new Error("Unsupported release strategy/configuration");
  }
  const window = await discoverWindow(prefixes);
  const pending = window.filter((pull) => pull.labels.includes("autorelease: pending"));
  const candidates = [...new Set(pending.map((pull) => pull.sha))];
  if (candidates.length > 1) throw new Error("Multiple pending candidate merge sources require sequential releases");
  const releases = await buildOfficialReleases(prefixes);
  if (new Set(releases.map((release) => release.path)).size !== releases.length) throw new Error("Duplicate released package path");
  const tags = {};
  for (const release of releases) {
    if (!candidates.includes(release.sha)) throw new Error("Release construction escaped the checked candidate window");
    const target = await resolveTag(release.tag);
    if (target && target !== release.sha) throw new Error(`Existing tag conflicts with candidate: ${release.tag}`);
    tags[release.tag] = target ?? null;
    await assertNativeVersion({ release, read: (file) => remoteFile({ sha: release.sha, file }) });
  }
  return { control: sha, head, pin: actionPin, bundleHash, config: digest(files["release-please-config.json"]), manifest: digest(files[".release-please-manifest.json"]), window, candidates, releases, tags };
}

async function preflight({ repo, sha, receipt }) {
  immutableSha(sha);
  const before = await releaseState({ repo, sha });
  const checked = [];
  for (const source of new Set([sha, ...before.candidates])) checked.push(await checkSource({ sha: source, read: (file) => remoteFile({ sha: source, file }) }));
  const after = await releaseState({ repo, sha });
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Release candidate set changed during preflight");
  const result = { ...after, checked, checkedAt: new Date().toISOString() };
  writeFileSync(receipt, `${JSON.stringify(result, null, 2)}\n`);
  output("candidate_sha", after.candidates[0] ?? "");
  output("receipt", result);
  console.log(JSON.stringify(result));
}

async function resolveProducer(tag) {
  const producers = { "ts-cli": "packages/ts/cli", "ts-management": "packages/ts/management", "python-mcp": "packages/python/mcp" };
  const match = /^(ts-cli|ts-management|python-mcp)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag ?? "");
  if (!match) throw new Error("Expected an immutable CLI, Management or MCP release tag");
  const sha = await resolveTag(tag);
  if (!sha) throw new Error(`Missing producer release tag: ${tag}`);
  const release = { path: producers[match[1]], tag, version: match[2], sha };
  await assertNativeVersion({ release, read: (file) => remoteFile({ sha, file }) });
  return release;
}

async function verifyAction(receiptFile) {
  const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
  const outputs = JSON.parse(process.env.RELEASE_PLEASE_OUTPUTS ?? "{}");
  const paths = JSON.parse(outputs.paths_released ?? "[]");
  if (!Array.isArray(paths) || new Set(paths).size !== paths.length) throw new Error("Invalid released paths");
  const releases = [];
  for (const path of paths) {
    const expected = receipt.releases.find((release) => release.path === path);
    if (!expected || outputs[`${path}--tag_name`] !== expected.tag || outputs[`${path}--sha`] !== expected.sha
      || outputs[`${path}--version`] !== expected.version || await resolveTag(expected.tag) !== expected.sha) throw new Error(`Action output/tag differs from checked candidate: ${path}`);
    releases.push(expected);
  }
  output("releases", releases);
  output("paths_released", paths);
  output("releases_created", String(releases.length > 0));
  output("rust_release_created", String(paths.includes("rust")));
  output("npm_packages", paths.filter((path) => path.startsWith("packages/ts/")).join(","));
  console.log(JSON.stringify({ releases, verifiedAt: new Date().toISOString() }));
}

async function registryJson(url) {
  const response = await boundedResponse(url);
  if (!response.ok) throw new Error(`npm producer read failed: HTTP ${response.status}`);
  return response.json();
}

async function checkSnap(repo) {
  const yaml = readFileSync(join(repo, "snap/snapcraft.yaml"), "utf8");
  const field = (pattern) => {
    const matches = [...yaml.matchAll(pattern)];
    if (matches.length !== 1) throw new Error("Ambiguous Snap producer configuration");
    return matches[0][1];
  };
  const version = field(/^version: "([^"\n]+)"$/gm);
  const source = field(/^    source: (\S+)$/gm);
  const checksum = field(/^    source-checksum: sha512\/([a-f0-9]{128})$/gm);
  const release = await resolveProducer(`ts-cli-v${version}`);
  const metadata = await registryJson(`https://registry.npmjs.org/@sendmux/cli/${version}`);
  if (metadata.name !== "@sendmux/cli" || metadata.version !== version
    || source !== `https://registry.npmjs.org/@sendmux/cli/-/cli-${version}.tgz` || metadata.dist?.tarball !== source
    || metadata.dist?.integrity !== `sha512-${Buffer.from(checksum, "hex").toString("base64")}`) throw new Error("Snap npm source/checksum mismatch");
  // The fixed HTTPS registry is the authority for this published tarball's
  // provenance; no caller-controlled attestation URL or gitHead fallback.
  const attestations = await registryJson(`https://registry.npmjs.org/-/npm/v1/attestations/@sendmux%2fcli@${version}`);
  const provenance = attestations.attestations?.filter((entry) => entry.predicateType === "https://slsa.dev/provenance/v1");
  if (provenance?.length !== 1) throw new Error("Missing unambiguous npm producer provenance");
  const statement = JSON.parse(Buffer.from(provenance[0].bundle?.dsseEnvelope?.payload ?? "", "base64"));
  const definition = statement.predicate?.buildDefinition;
  if (statement.predicateType !== "https://slsa.dev/provenance/v1"
    || statement.subject?.length !== 1 || statement.subject[0].name !== `pkg:npm/%40sendmux/cli@${version}` || statement.subject[0].digest?.sha512 !== checksum
    || definition?.externalParameters?.workflow?.repository !== "https://github.com/Sendmux/sendmux-sdk"
    || definition.externalParameters.workflow.path !== ".github/workflows/release-please.yml"
    || !definition.resolvedDependencies?.some((item) => item.uri.startsWith("git+https://github.com/Sendmux/sendmux-sdk@") && item.digest?.gitCommit === release.sha)) throw new Error("Snap npm provenance does not identify the CLI producer commit");
  const checked = await checkSource({ sha: release.sha, read: (file) => remoteFile({ sha: release.sha, file }) });
  console.log(JSON.stringify({ release, checksum, checked, checkedAt: new Date().toISOString() }));
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${typeof value === "string" ? value : JSON.stringify(value)}\n`);
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!["--repo", "--sha", "--tag", "--receipt"].includes(key) || !args[index + 1] || Object.hasOwn(options, key.slice(2))) throw new Error(`Invalid argument: ${key}`);
    options[key.slice(2)] = args[index + 1];
  }
  return options;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === "candidate") {
    const releases = options.tag ? [await resolveProducer(options.tag)] : JSON.parse(process.env.PUBLICATION_RELEASES ?? "[]");
    await checkCandidate({ repo: resolve(options.repo ?? "."), sha: options.sha ?? releases[0]?.sha, releases });
  } else if (command === "preflight") {
    await preflight({ repo: resolve(options.repo ?? "."), sha: options.sha, receipt: options.receipt });
  } else if (command === "resolve") {
    const release = await resolveProducer(options.tag);
    output("sha", release.sha); output("tag", release.tag); output("version", release.version);
    console.log(JSON.stringify(release));
  } else if (command === "verify-release") {
    await verifyAction(options.receipt);
  } else if (command === "snap") {
    await checkSnap(resolve(options.repo ?? "."));
  } else throw new Error(`Unknown publication guard command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const deadline = setTimeout(() => invocation.abort(new Error("Publication guard exceeded 2 minutes")), 120_000);
  try { await main(); }
  catch (error) { console.error(error.stderr ?? error.message); process.exitCode = 1; }
  finally { clearTimeout(deadline); }
}
