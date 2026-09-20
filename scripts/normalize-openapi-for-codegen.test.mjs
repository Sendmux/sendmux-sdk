import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { workspace } from "./ci-consumers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const normalizer = join(root, "scripts/normalize-openapi-for-codegen.mjs");
const addressRef = "#/components/schemas/Address";
const address = {
  type: "object",
  additionalProperties: false,
  properties: { email: { type: "string" } },
  required: ["email"],
};

function fixture({ from, target = address }) {
  return {
    openapi: "3.1.0",
    info: { title: "Fixture", version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        Address: target,
        Message: { type: "object", additionalProperties: false, properties: { from }, required: ["from"] },
      },
    },
  };
}

function normalize(directory, label, document) {
  const inputDir = join(directory, label, "input");
  const outputDir = join(directory, label, "output");
  mkdirSync(inputDir, { recursive: true });
  for (const filename of ["openapi-app.json", "openapi-sending.json"]) {
    writeFileSync(join(inputDir, filename), `${JSON.stringify(document)}\n`);
  }
  const child = spawnSync(process.execPath, [normalizer, "--input-dir", inputDir, "--output-dir", outputDir], {
    cwd: directory, encoding: "utf8", timeout: 30000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024,
  });
  assert(Number.isSafeInteger(child.pid) && child.pid > 0, "normaliser must start");
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" }, "normaliser must close");
  assert.ifError(child.error);
  assert.equal(child.signal, null, "normaliser must finish without a timeout or signal");
  const read = (name) => (child.status === 0 ? readFileSync(join(outputDir, name), "utf8") : null);
  return {
    status: child.status,
    stderr: child.stderr,
    openApi31Text: read("openapi-app.codegen.json"),
    openApiGeneratorText: read("openapi-app.openapi-generator.codegen.json"),
  };
}

function fromSchema(result, key) {
  return JSON.parse(result[key]).components.schemas.Message.properties.from;
}

await test("a bare $ref anyOf/oneOf with a null branch becomes the OAS 3.0 nullable reference idiom", async () => {
  await workspace("normalize-nullable-reference", async (directory) => {
    for (const keyword of ["anyOf", "oneOf"]) {
      const from = { [keyword]: [{ $ref: addressRef }, { type: "null" }] };
      const result = normalize(directory, keyword, fixture({ from }));
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(fromSchema(result, "openApiGeneratorText"), {
        allOf: [{ $ref: addressRef }],
        nullable: true,
        type: "object",
      });
      assert.deepEqual(fromSchema(result, "openApi31Text"), from);
    }
  });
});

await test("the nullable reference normalises byte-for-byte like the v1.8.248 allOf shape did", async () => {
  await workspace("normalize-nullable-reference-parity", async (directory) => {
    const current = normalize(directory, "anyof-null", fixture({
      from: { anyOf: [{ $ref: addressRef }, { type: "null" }] },
    }));
    const historical = normalize(directory, "allof-null-type", fixture({
      from: { allOf: [{ $ref: addressRef }, { type: ["object", "null"] }] },
    }));
    assert.equal(current.status, 0, current.stderr);
    assert.equal(historical.status, 0, historical.stderr);
    assert.equal(current.openApiGeneratorText, historical.openApiGeneratorText);
    assert.equal(current.openApi31Text, historical.openApi31Text);
    assert.deepEqual(fromSchema(historical, "openApiGeneratorText"), {
      allOf: [{ $ref: addressRef }],
      nullable: true,
      type: "object",
    });
  });
});

await test("a nullable reference to a component without one OAS 3.0 type fails naming the reference", async () => {
  await workspace("normalize-nullable-reference-untyped", async (directory) => {
    const result = normalize(directory, "untyped-target", fixture({
      from: { anyOf: [{ $ref: addressRef }, { type: "null" }] },
      target: { anyOf: [{ type: "string" }, { type: "integer" }] },
    }));
    assert.notEqual(result.status, 0, "an untyped nullable reference must not normalise silently");
    assert.match(result.stderr, /#\/components\/schemas\/Address/);
    assert.match(result.stderr, /OAS 3\.0 type/);
  });
});

await test("a nullable reference to a null-only component fails naming the reference", async () => {
  await workspace("normalize-nullable-reference-null-only", async (directory) => {
    const result = normalize(directory, "null-only-target", fixture({
      from: { anyOf: [{ $ref: addressRef }, { type: "null" }] },
      target: { type: "null" },
    }));
    assert.notEqual(result.status, 0, "a null-only target has no OAS 3.0 type and must not normalise silently");
    assert.match(result.stderr, /#\/components\/schemas\/Address/);
    assert.match(result.stderr, /OAS 3\.0 type/);
  });
});
