#!/usr/bin/env node
// Credential-free diagnostic fixture only. Publication workflows never call it.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { git, snapshotPath } from "./publication-guard.mjs";

const [command, flag, value, ...extra] = process.argv.slice(2);
const parent = realpathSync(process.env.RUNNER_TEMP ?? tmpdir());
if (extra.length || !value) throw new Error("Expected diagnostic command and explicit path");
if (command === "prepare-negative" && flag === "--repo") {
  const directory = mkdtempSync(join(parent, "sendmux-publication-negative-"));
  try {
    mkdirSync(join(directory, snapshotPath), { recursive: true });
    for (const name of ["openapi-app.json", "openapi-sending.json"]) {
      const file = `${snapshotPath}/${name}`;
      const source = JSON.parse(await git({ repo: resolve(value), args: ["show", `HEAD:${file}`] }));
      source["x-sendmux-publication-negative"] = randomUUID();
      writeFileSync(join(directory, file), `${JSON.stringify(source)}\n`);
    }
    await git({ repo: directory, args: ["init", "--quiet"] });
    await git({ repo: directory, args: ["add", "."] });
    await git({ repo: directory, args: ["-c", "user.name=Publication diagnostic", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Known incompatible diagnostic; no public remote"] });
    const sha = (await git({ repo: directory, args: ["rev-parse", "HEAD"] })).trim();
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `directory=${directory}\nsha=${sha}\nreleases_created=true\n`);
    console.log(JSON.stringify({ directory, sha }));
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
} else if (command === "cleanup-negative" && flag === "--directory") {
  const directory = realpathSync(value);
  if (dirname(directory) !== parent || !basename(directory).startsWith("sendmux-publication-negative-")) throw new Error("Refusing to remove a non-owned diagnostic directory");
  // An exact fixture handle with no remote is the only teardown target.
  if ((await git({ repo: directory, args: ["remote"] })).trim()) throw new Error("Diagnostic unexpectedly has a remote");
  rmSync(directory, { recursive: true });
  if (existsSync(directory)) throw new Error("Diagnostic repository remains after teardown");
  console.log(`Torn down: ${directory} — verified absent`);
} else throw new Error("Unknown diagnostic command");
