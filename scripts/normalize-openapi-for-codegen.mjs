import { Converter } from "@apiture/openapi-down-convert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const specs = ["openapi-app.json", "openapi-sending.json"];

const options = parseArgs(process.argv.slice(2));
const inputDir = resolve(options.inputDir ?? process.env.OPENAPI_INPUT_DIR ?? findDefaultInputDir());
const outputDir = resolve(options.outputDir ?? process.env.OPENAPI_OUTPUT_DIR ?? ".codegen");

mkdirSync(outputDir, { recursive: true });

for (const spec of specs) {
  const inputPath = join(inputDir, spec);
  if (!existsSync(inputPath)) {
    throw new Error(`Missing OpenAPI snapshot: ${inputPath}`);
  }

  const source = readJson(inputPath);
  assertOpenApi31({ document: source, file: inputPath });

  const stripped = stripUnevaluatedProperties(source);
  const codegenName = spec.replace(/\.json$/, ".codegen.json");
  const oagCodegenName = spec.replace(/\.json$/, ".openapi-generator.codegen.json");

  writeJson(join(outputDir, codegenName), stripped);

  const converter = new Converter(stripped, {});
  writeJson(join(outputDir, oagCodegenName), normalizeOpenApiGeneratorDocument(converter.convert()));
}

console.log(`Wrote codegen OpenAPI artifacts to ${outputDir}`);

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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  if (!basename(path).endsWith(".codegen.json")) {
    throw new Error(`Refusing to write non-transient output: ${path}`);
  }

  writeFileSync(path, `${stableStringify(value)}\n`);
}

function assertOpenApi31({ document, file }) {
  if (document.openapi !== "3.1.0") {
    throw new Error(`${file} must stay OpenAPI 3.1.0, got ${document.openapi}`);
  }
}

function stripUnevaluatedProperties(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripUnevaluatedProperties(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "unevaluatedProperties") {
      continue;
    }

    next[key] = stripUnevaluatedProperties(child);
  }

  return next;
}

function normalizeOpenApiGeneratorDocument(document) {
  return walkSchemaLikeObjects(document, (schema) => {
    normalizeExclusiveBounds(schema);
    normalizeComposedNullBranches(schema);
    return schema;
  });
}

function normalizeExclusiveBounds(schema) {
  if (typeof schema.exclusiveMinimum === "number") {
    schema.minimum = schema.exclusiveMinimum;
    schema.exclusiveMinimum = true;
  }

  if (typeof schema.exclusiveMaximum === "number") {
    schema.maximum = schema.exclusiveMaximum;
    schema.exclusiveMaximum = true;
  }
}

function normalizeComposedNullBranches(schema) {
  for (const keyword of ["anyOf", "oneOf"]) {
    if (!Array.isArray(schema[keyword])) {
      continue;
    }

    const withoutNull = schema[keyword].filter((item) => !isNullSchema(item));
    if (withoutNull.length !== schema[keyword].length) {
      schema[keyword] = withoutNull;
      markComposedSchemaNullable(schema);
    }
  }

  normalizeNullableAllOfBranches(schema);
}

function markComposedSchemaNullable(schema) {
  if (schema.type) {
    schema.nullable = true;
    return;
  }

  const typedBranches = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter((item) => {
    return Boolean(item && typeof item === "object" && !Array.isArray(item) && item.type);
  });

  if (typedBranches.length === 0) {
    throw new Error("Cannot convert null branch because no sibling schema has an explicit OAS 3.0 type");
  }

  for (const branch of typedBranches) {
    branch.nullable = true;
  }
}

function normalizeNullableAllOfBranches(schema) {
  if (!Array.isArray(schema.allOf)) {
    return;
  }

  const nextAllOf = [];
  let nullable = false;
  let explicitType;

  for (const branch of schema.allOf) {
    if (!isNullableSchema(branch)) {
      nextAllOf.push(branch);
      continue;
    }

    nullable = true;
    const nonNullable = removeNullableMarker(branch);
    if (!explicitType && typeof nonNullable.type === "string") {
      explicitType = nonNullable.type;
    }
    if (!isRedundantTypeOnlySchema(nonNullable)) {
      nextAllOf.push(nonNullable);
    }
  }

  if (!nullable) {
    return;
  }

  schema.allOf = nextAllOf;
  schema.nullable = true;
  if (!schema.type && explicitType) {
    schema.type = explicitType;
  }
  if (schema.allOf.length === 0) {
    delete schema.allOf;
  }
}

function removeNullableMarker(schema) {
  const next = { ...schema };
  delete next.nullable;
  if (Array.isArray(next.type)) {
    const types = next.type.filter((type) => type !== "null");
    if (types.length === 1) {
      next.type = types[0];
    } else if (types.length > 1) {
      next.type = types;
    } else {
      delete next.type;
    }
  } else if (next.type === "null") {
    delete next.type;
  }
  return next;
}

function isNullableSchema(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value.nullable === true || isNullSchema(value) || (Array.isArray(value.type) && value.type.includes("null"))),
  );
}

function isRedundantTypeOnlySchema(schema) {
  const keys = Object.keys(schema);
  return keys.length === 0 || (keys.length === 1 && keys[0] === "type");
}

function isNullSchema(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      value.type === "null",
  );
}

function walkSchemaLikeObjects(value, visitor) {
  if (Array.isArray(value)) {
    return value.map((item) => walkSchemaLikeObjects(item, visitor));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = visitor({ ...value });
  for (const [key, child] of Object.entries(next)) {
    next[key] = walkSchemaLikeObjects(child, visitor);
  }

  return next;
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
