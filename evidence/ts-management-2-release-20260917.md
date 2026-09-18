# TypeScript Management 2 release qualification

Recorded 2026-09-17 21:55 Australia/Melbourne. Candidate PR235 `6f506dbdc660e42449af2818e33698831a2f82fe` over `7aeb3e4a027218baae6d5e27f21f56cd772088e5`, plus the migration documentation correction in this commit.

## Correctness

`packages/ts/management/src/generated/types.gen.ts:659` defines list entries without variables; `:891` requires variables in the detail model. `src/index.ts:11` exports operations, not those model names. Migration guidance therefore derives separate types from public operations. The account response uses `id`; detail lookup supplies that value as `path.public_id` (`types.gen.ts:3102`). ROOT corrected that distinction during independent review before committing.

Native package, manifest and dated changelog agree on 2.0.0; all 20 sibling manifest entries remain unchanged. Candidate packing resolves Core to its published 1.2.0 version. Runtime, generated clients and lockfiles are unchanged by the documentation correction.

## Verification

- Candidate-owned OpenAPI canary passed against both deployed schemas: App SHA256 `09b00ae13c88fe4ecc1bb3fd965bb30efd79447d5ea68b5334816a7452d40b58`; Sending `c1f82f9b8944026571d9e66ae84d4bef90e6c575cc8a57127afcdc6e90aa7b0e`.
- Four required TypeScript package builds, existing public API guard and tree-shaking guard passed.
- Fresh isolated packed-package consumer resolved Management 2.0.0 and Core 1.2.0 through their public exports.
- Compatible list/detail consumer compiled; invalid list-to-detail assignment failed with `TS2741: Property 'variables' is missing in type 'ProviderListItem' but required in type 'ProviderItem'.` This proves the approved major-version boundary without private model imports.
- The exact README migration examples compiled against the documentation-corrected packed package. All 51 dist entries, package metadata and licence matched the originally qualified archive; only README bytes changed. ROOT's final correction changes prose only, not those compiled examples.
- Tests: +0 permanent cases, −0 cases. Reused existing runtime/contract checks; no new source-text assertion or repeated broad suite for documentation changes.

Machine-local evidence: MAIN `.claude/artifacts/ts-management-2-final/`, especially `qualification-results.json`, `pack-parity.json`, `final-receipt.json`, `migration-docs-results.json`, `migration-docs-cleanup.json`. Final `candidate-pack-root-review/sendmux-management-2.0.0.tgz`: 55,515 bytes, SHA256 `e86fd6f11a83bb1037b669fc68f3f0cb7719d09380314566b2273be90549ef55`. ROOT compared all 54 archive members: only README differs from the prior artifact, every compiled TypeScript block is unchanged, packed Core remains 1.2.0 and all 20 sibling manifest versions remain intact. Earlier archives are historical evidence, not publication candidates.

## Release boundary

Independent ROOT review verified source exports, response/path identifiers, exact diff and retained receipts. Normal drift hook and remote review/publication gates still apply. Status: candidate qualification, not yet merged or published. No live credentials, tenant resources or browser-facing code changed. Candidate consumer scratch and 19 recorded child PIDs were verified absent; worktree/build output retained for the release gate. Final public hash and fresh installed consumer checks remain mandatory.
