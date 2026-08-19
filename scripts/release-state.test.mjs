import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, ".release-please-manifest.json"), "utf8"));
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
