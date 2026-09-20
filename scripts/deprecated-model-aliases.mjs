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
