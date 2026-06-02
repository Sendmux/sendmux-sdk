import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const specs = ["openapi-app.json", "openapi-sending.json"];
const root = process.cwd();
const options = parseArgs(process.argv.slice(2));
const inputDir = resolve(options.inputDir ?? process.env.OPENAPI_INPUT_DIR ?? findDefaultInputDir());
const outputDir = resolve(options.outputDir ?? "packages/python/mcp/sendmux_mcp/openapi");

mkdirSync(outputDir, { recursive: true });

for (const spec of specs) {
  const inputPath = join(inputDir, spec);
  if (!existsSync(inputPath)) {
    throw new Error(`Missing OpenAPI snapshot: ${inputPath}`);
  }

  const document = JSON.parse(readFileSync(inputPath, "utf8"));
  if (document.openapi !== "3.1.0") {
    throw new Error(`${inputPath} must stay OpenAPI 3.1.0, got ${document.openapi}`);
  }

  writeFileSync(join(outputDir, spec), `${stableStringify(document)}\n`);
}

console.log(`Wrote MCP OpenAPI snapshots to ${outputDir}`);

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--input-dir") {
      parsed.inputDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      parsed.outputDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue({ args, index, arg }) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${arg}`);
  }

  return value;
}

function findDefaultInputDir() {
  for (const candidate of ["sendmux-docs", "../sendmux-docs"]) {
    if (specs.every((spec) => existsSync(join(candidate, spec)))) {
      return candidate;
    }
  }

  return "sendmux-docs";
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortKeys(child)]),
  );
}
