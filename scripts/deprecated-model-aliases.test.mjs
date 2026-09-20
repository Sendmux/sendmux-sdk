import assert from "node:assert/strict";
import { test } from "node:test";
import { planDeprecatedModelAliases } from "./deprecated-model-aliases.mjs";

const alias = { deprecated: "OldModel", replacement: "NewModel", removedIn: "next major" };

test("writes an alias once the deprecated name has left the generated output", () => {
  const plan = planDeprecatedModelAliases({
    aliases: [alias],
    isGenerated: (name) => name === "NewModel",
    label: "__init__.py",
  });
  assert.deepEqual(plan, { active: [alias], pending: [] });
});

test("holds an alias while the deprecated name is still generated", () => {
  const plan = planDeprecatedModelAliases({
    aliases: [alias],
    isGenerated: (name) => ["OldModel", "NewModel"].includes(name),
    label: "__init__.py",
  });
  assert.deepEqual(plan, { active: [], pending: [alias] });
});

test("fails when the replacement is not generated, naming both models", () => {
  assert.throws(
    () => planDeprecatedModelAliases({ aliases: [alias], isGenerated: (name) => name === "OldModel", label: "__init__.py" }),
    {
      message: "__init__.py does not generate NewModel, the replacement for OldModel; "
        + "regenerate from the schema this table targets or update the alias",
    },
  );
});
