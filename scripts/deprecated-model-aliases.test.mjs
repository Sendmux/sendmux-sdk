import assert from "node:assert/strict";
import { test } from "node:test";
import { planDeprecatedModelAliases, planDeprecatedUnionMembers } from "./deprecated-model-aliases.mjs";

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

const member = {
  union: "QuotaPerDay",
  deprecated: "NilQuotaPerDay1",
  replacementMember: "QuotaRange",
  nullableWrapper: "NilQuotaRange",
};

function unionOutput({ members }) {
  return {
    isGenerated: (name) => ["QuotaPerDay", "NilQuotaRange"].includes(name),
    hasUnionMember: (union, name) => union === "QuotaPerDay" && members.includes(name),
  };
}

test("writes a union member shim once the former member has left the generated union", () => {
  const plan = planDeprecatedUnionMembers({ members: [member], ...unionOutput({ members: ["Null", "Int", "QuotaRange"] }), label: "go/management" });
  assert.deepEqual(plan, { active: [member], pending: [] });
});

test("holds a union member shim while the former member is still generated", () => {
  const plan = planDeprecatedUnionMembers({
    members: [member],
    ...unionOutput({ members: ["Null", "Int", "QuotaRange", "NilQuotaPerDay1"] }),
    label: "go/management",
  });
  assert.deepEqual(plan, { active: [], pending: [member] });
});

test("fails when the replacement member, the null member or the wrapper is not generated, naming them", () => {
  assert.throws(
    () => planDeprecatedUnionMembers({ members: [member], ...unionOutput({ members: ["Null", "Int"] }), label: "go/management" }),
    {
      message: "go/management does not generate the QuotaRange member of QuotaPerDay, the replacement for NilQuotaPerDay1; "
        + "regenerate from the schema this table targets or update the union member shim",
    },
  );
  assert.throws(
    () => planDeprecatedUnionMembers({ members: [member], ...unionOutput({ members: ["Int", "QuotaRange"] }), label: "go/management" }),
    { message: /does not generate the Null member of QuotaPerDay/ },
  );
  assert.throws(
    () => planDeprecatedUnionMembers({
      members: [member],
      isGenerated: (name) => name === "QuotaPerDay",
      hasUnionMember: (_union, name) => ["Null", "Int", "QuotaRange"].includes(name),
      label: "go/management",
    }),
    { message: /does not generate NilQuotaRange, the nullable wrapper/ },
  );
});
