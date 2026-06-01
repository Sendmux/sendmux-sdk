import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const surfaces = ["sending", "mailbox", "management"];
const failures = [];

for (const surface of surfaces) {
  const surfaceDir = join(root, "go", surface);
  const clientPath = join(surfaceDir, "oas_client_gen.go");
  const schemasPath = join(surfaceDir, "oas_schemas_gen.go");
  const specPath = join(root, ".tmp", "go-codegen", `${surface}.openapi-generator.codegen.json`);

  if (!existsSync(clientPath)) {
    failures.push(`Missing generated client for ${surface}`);
    continue;
  }

  const client = readFileSync(clientPath, "utf8");
  const schemas = readFileSync(schemasPath, "utf8");
  const spec = JSON.parse(readFileSync(specPath, "utf8"));

  if (client.includes("GetOpenApiSpec")) {
    failures.push(`${surface} generated client still contains Meta /openapi.json operations`);
  }

  for (const signature of client.matchAll(/func \(c \*Client\) ([A-Z]\w+)\(([^)]*)\)/g)) {
    const [, name, params] = signature;
    if (!params.trim().startsWith("ctx context.Context")) {
      failures.push(`${surface}.${name} is not context-first`);
    }
  }

  for (const name of successResponseComponentNames(spec)) {
    const envelope = schemas.match(new RegExp(`type ${name} struct \\{\\n([\\s\\S]*?)\\n\\}`));
    if (!envelope) {
      failures.push(`${surface}.${name} success envelope type is missing`);
      continue;
    }

    const [, body] = envelope;
    if (body.includes("Meta ") && body.includes("Ok ") && body.includes("Data ")) {
      continue;
    }
    failures.push(`${surface}.${name} is not a clean {Meta, Ok, Data} success envelope`);
  }
}

if (failures.length > 0) {
  throw new Error(`Go SDK checks failed:\n${failures.join("\n")}`);
}

console.log("Go SDK generated surface checks passed.");

function successResponseComponentNames(spec) {
  const names = new Set();

  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        continue;
      }

      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (!/^2[0-9][0-9]$/.test(status)) {
          continue;
        }

        const schema = response.content?.["application/json"]?.schema;
        const name = componentName(schema?.$ref);
        if (name) {
          names.add(name);
        }
      }
    }
  }

  return [...names].filter((name) => name !== "ErrorResponse");
}

function componentName(ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/components/schemas/")) {
    return null;
  }

  return decodeURIComponent(ref.split("/").at(-1));
}
