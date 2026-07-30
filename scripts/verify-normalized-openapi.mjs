import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const specs = ["openapi-app", "openapi-sending"];
const outputDir = resolve(parseArgs(process.argv.slice(2)).outputDir ?? process.env.OPENAPI_OUTPUT_DIR ?? ".codegen");

for (const spec of specs) {
  const openApi31Path = join(outputDir, `${spec}.codegen.json`);
  const openApiGeneratorPath = join(outputDir, `${spec}.openapi-generator.codegen.json`);

  assertExists(openApi31Path);
  assertExists(openApiGeneratorPath);

  const openApi31 = readJson(openApi31Path);
  const openApiGenerator = readJson(openApiGeneratorPath);

  assertVersion({ document: openApi31, file: openApi31Path, expected: "3.1.0" });
  assertVersion({ document: openApiGenerator, file: openApiGeneratorPath, expected: "3.0.3" });
  assertNoUnevaluatedProperties({ document: openApi31, file: openApi31Path });
  assertNoUnevaluatedProperties({ document: openApiGenerator, file: openApiGeneratorPath });
  assertNoNullableAllOfBranches({ document: openApi31, file: openApi31Path });
  assertNullableEnumsIncludeNull({ document: openApi31, file: openApi31Path });
  assertNoNullableTypeArrays({ document: openApiGenerator, file: openApiGeneratorPath });
  assertNoNullSchemaBranches({ document: openApiGenerator, file: openApiGeneratorPath });
  assertNoNumericExclusiveBounds({ document: openApiGenerator, file: openApiGeneratorPath });
  assertNoComposedNullableWithoutType({ document: openApiGenerator, file: openApiGeneratorPath });
  assertNoNullableAllOfBranches({ document: openApiGenerator, file: openApiGeneratorPath });
}

console.log(`Verified normalized OpenAPI artifacts in ${outputDir}`);

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Expected value after ${arg}`);
      }

      parsed.outputDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function assertExists(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing normalized OpenAPI artifact: ${path}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertVersion({ document, file, expected }) {
  if (document.openapi !== expected) {
    throw new Error(`${file} expected OpenAPI ${expected}, got ${document.openapi}`);
  }
}

function assertNoUnevaluatedProperties({ document, file }) {
  const count = countMatches(document, (value) =>
    Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "unevaluatedProperties")),
  );

  if (count > 0) {
    throw new Error(`${file} still contains ${count} unevaluatedProperties entries`);
  }
}

function assertNoNullableTypeArrays({ document, file }) {
  const count = countMatches(document, (value) => {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray(value.type) &&
        value.type.includes("null"),
    );
  });

  if (count > 0) {
    throw new Error(`${file} still contains ${count} OpenAPI 3.1 nullable type arrays`);
  }
}

function assertNoNullSchemaBranches({ document, file }) {
  const count = countMatches(document, (value) => {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 1 &&
        value.type === "null",
    );
  });

  if (count > 0) {
    throw new Error(`${file} still contains ${count} { "type": "null" } schema branches`);
  }
}

function assertNoNumericExclusiveBounds({ document, file }) {
  const count = countMatches(document, (value) => {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (typeof value.exclusiveMinimum === "number" || typeof value.exclusiveMaximum === "number"),
    );
  });

  if (count > 0) {
    throw new Error(`${file} still contains ${count} numeric exclusiveMinimum/exclusiveMaximum entries`);
  }
}

function assertNoComposedNullableWithoutType({ document, file }) {
  const count = countMatches(document, (value) => {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        value.nullable === true &&
        !value.type &&
        (value.anyOf || value.oneOf || value.allOf),
    );
  });

  if (count > 0) {
    throw new Error(`${file} still contains ${count} composed nullable schemas without sibling type`);
  }
}

function assertNoNullableAllOfBranches({ document, file }) {
  const count = countMatches(document, (value) => {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray(value.allOf) &&
        value.allOf.some(
          (branch) =>
            branch &&
            typeof branch === "object" &&
            !Array.isArray(branch) &&
            (branch.nullable === true || (Array.isArray(branch.type) && branch.type.includes("null"))),
        ),
    );
  });

  if (count > 0) {
    throw new Error(`${file} still contains ${count} nullable allOf branch schemas`);
  }
}

function assertNullableEnumsIncludeNull({ document, file }) {
  const count = countMatches(document, (value) => {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray(value.type) &&
        value.type.includes("null") &&
        Array.isArray(value.enum) &&
        !value.enum.includes(null),
    );
  });

  if (count > 0) {
    throw new Error(`${file} still contains ${count} nullable enums without a null member`);
  }
}

function countMatches(value, predicate) {
  let count = predicate(value) ? 1 : 0;

  if (Array.isArray(value)) {
    for (const item of value) {
      count += countMatches(item, predicate);
    }
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      count += countMatches(child, predicate);
    }
  }

  return count;
}
