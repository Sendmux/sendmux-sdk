import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Go generates policy routes with alternative OAuth scopes using the existing bearer transport", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-go.mjs"], {
    encoding: "utf8", timeout: 300000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const spec = JSON.parse(readFileSync(".tmp/go-codegen/management.openapi-generator.codegen.json", "utf8"));
  const policy = spec.paths["/mailbox-send-policies/{scope}/{public_id}"];
  for (const method of ["get", "put"]) {
    assert.deepEqual(policy[method].security, [{ bearerAuth: [] }]);
  }
  const compiled = spawnSync("go", ["test", "./..."], {
    cwd: "go", encoding: "utf8", timeout: 300000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(compiled.error);
  assert.equal(compiled.status, 0, compiled.stderr);
});
