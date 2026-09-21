// One rule for every generator's deprecated model alias table.
//
// A table entry names a generated model that a schema regeneration drops and the generated model
// that now types the same fields. The alias is written only once the deprecated name has left the
// generated output, so an entry can land ahead of the regeneration that removes its class; the
// replacement must be generated either way.
export function planDeprecatedModelAliases({ aliases, isGenerated, label }) {
  const active = [];
  const pending = [];
  for (const alias of aliases) {
    if (!isGenerated(alias.replacement)) {
      throw new Error(
        `${label} does not generate ${alias.replacement}, the replacement for ${alias.deprecated}; `
          + "regenerate from the schema this table targets or update the alias",
      );
    }
    (isGenerated(alias.deprecated) ? pending : active).push(alias);
  }
  return { active, pending };
}

export function reportPendingAliases({ label, pending }) {
  for (const { deprecated } of pending) {
    console.log(`${label} still generates ${deprecated}; its deprecated alias waits for the regeneration that drops it`);
  }
}

// One rule for a generated union whose object member a schema regeneration renamed.
//
// A table entry names the union, the former member (the discriminator constant, Is/Set/Get methods
// and constructor a consumer wrote against), the member that replaced it and the nullable wrapper
// the former member was typed by. The shims are written only once the former member has left the
// generated union, so an entry can land ahead of the regeneration that renames it; the union, the
// replacement member, the Null member the former member also covered and the wrapper must be
// generated either way.
export function planDeprecatedUnionMembers({ members, isGenerated, hasUnionMember, label }) {
  const active = [];
  const pending = [];
  const advice = "regenerate from the schema this table targets or update the union member shim";
  for (const member of members) {
    const { union, deprecated, replacementMember, nullableWrapper } = member;
    if (!isGenerated(union)) {
      throw new Error(`${label} does not generate ${union}, the union of the deprecated ${deprecated} member; ${advice}`);
    }
    if (!hasUnionMember(union, replacementMember)) {
      throw new Error(
        `${label} does not generate the ${replacementMember} member of ${union}, the replacement for ${deprecated}; ${advice}`,
      );
    }
    if (!hasUnionMember(union, "Null")) {
      throw new Error(
        `${label} does not generate the Null member of ${union}, which the deprecated ${deprecated} member also covered; ${advice}`,
      );
    }
    if (!isGenerated(nullableWrapper)) {
      throw new Error(
        `${label} does not generate ${nullableWrapper}, the nullable wrapper the deprecated ${deprecated} member is typed by; ${advice}`,
      );
    }
    (hasUnionMember(union, deprecated) ? pending : active).push(member);
  }
  return { active, pending };
}
