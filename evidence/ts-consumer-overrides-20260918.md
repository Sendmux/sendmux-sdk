# TypeScript consumer harness: packed sibling candidates resolve from local tarballs

Recorded 2026-09-18 Australia/Melbourne. Branch `agent/ts-consumer-overrides` over `7aeb3e4a027218baae6d5e27f21f56cd772088e5`; code commit `58266cb7dc69a0f3d5b5092bd761f281954507a2`.

## Symptom and trace

PR235 (`@sendmux/management` 2.0.0, unpublished) failed all nine `node-runtime` legs with `ERR_PNPM_NO_MATCHING_VERSION No matching version found for @sendmux/management@2.0.0` while installing the packed `@sendmux/sdk`.

- `scripts/ci-consumers.mjs:143` (before) packed each workspace package; `pnpm pack` rewrites `workspace:*` to the sibling's exact version, so the packed `@sendmux/sdk@1.5.0` manifest declares `@sendmux/management: 1.4.0` on main and `2.0.0` on PR235 (probe: `tar -xzOf sendmux-sdk-1.5.0.tgz package/package.json`).
- `scripts/ci-consumers.mjs:149-152` (before) wrote a consumer manifest `{ name, private, type }` with no resolution guidance, and `:172` ran `pnpm add --save-exact <archives>`; pnpm resolved nested `@sendmux/*` edges from the registry. Unpublished sibling → red; published sibling → a registry copy tested silently (`@sendmux/cli` → `@sendmux/sdk@1.5.0`).
- `scripts/ci-consumers.mjs:155-161` (before) proved only top-level packages were installed from the consumer directory, never nested edges.

## Fix

- `packTypescript` returns `{ name, version, archive }` per candidate from the manifest pnpm packed (`packedCandidate`, asserts the tarball exists).
- `candidateOverrides` emits `"<name>@<version>": "file:<absolute tarball>"`, exact-version keys only; `newNodeConsumer` writes them as `package.json#pnpm.overrides`.
- `nodeProvenance` resolves every candidate-scoped dependency from `realpathSync(node_modules/<N>/package.json)` via `createRequire` and requires equality with the top-level instance realpath.

pnpm v10.22.0 source (copies in `.claude/artifacts/ts-consumer-overrides/pnpm-src/`): `hooks/read-package-hook/src/isIntersectingRange.ts:3-9` (key applies when the declared spec equals or intersects it), `createVersionsOverrider.ts:93-106` (matching) and `:43-56` (`file:` targets; absolute path kept), `config/config/src/getOptionsFromRootManifest.ts:61-64` (`manifest.pnpm?.overrides` read). pnpm v11.0.0 release notes: the `pnpm` field of `package.json` is no longer read; the consumer comment records this.

Design note: `createRequire` must be based at the realpath of the installed manifest; based at the consumer's symlink it walks `consumer/node_modules` and always finds the top-level instance.

## Tests (`scripts/ci-consumers.test.mjs`)

Seen red before the fix (`.claude/artifacts/ts-consumer-overrides/red.log`):

- `packed dependents resolve an unpublished sibling candidate from its tarball instead of the registry` → `ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@sendmux-ci-fixture%2Fleaf: Not Found - 404` → `AssertionError [ERR_ASSERTION]: pnpm failed: exit 1, interrupted=false`.
- `a packed dependent whose range excludes the candidate is not masked` → `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal` (no override keys emitted).
- `nested candidate edges must be the tarball instance, not a registry copy` → `AssertionError [ERR_ASSERTION]: Missing expected rejection.` (old provenance passed a registry `@sendmux/core@1.1.0` copy).

Green (`green.log`): focused 3/3; `pnpm test:runtime-contracts` 11 tests, 11 pass, 0 fail, 0 skipped. Removed: none. `scripts/ai-peer-consumer.test.mjs` unchanged.

## Verification

- `node scripts/ci-consumers.mjs node` in the worktree: exit 0; provenance printed eight `candidate_edge` lines, all on `.pnpm/@sendmux+<name>@file+…` instances, including `@sendmux/cli -> @sendmux/sdk` (`harness-node-wt.log`).
- harness-sim (`harness-sim.log`): scratch copy with `packages/ts/management` at 2.0.0. Original harness (`7aeb3e4a:scripts/ci-consumers.mjs`): exit 1, `ERR_PNPM_NO_MATCHING_VERSION No matching version found for @sendmux/management@2.0.0`. New harness: exit 0, `@sendmux/sdk -> @sendmux/management` resolved to the 2.0.0 tarball instance.
- Pre-commit `pnpm drift:check`: "Generated SDK package directories have no uncommitted drift."
- Journeys: none — CI harness, no user-facing surface.
- Windows legs not exercisable locally; `file:<absolute>` override values rely on `createVersionsOverrider.ts:53` (`path.isAbsolute`). Independent ROOT review refuted a `pathToFileURL` suggestion on that basis.

## Carried documentation

`packages/ts/management/README.md` (+40, "Migrate from 1.x to 2.0") and `evidence/ts-management-2-release-20260917.md` are byte-identical to release-branch commit `1c98c9b`; verified against main: `types.gen.ts:659` list item without `variables`, `:788` detail item with `id` and required `variables`, path `public_id` (`:3102`), `src/index.ts:11` exports operations only. `packages/ts/management/CHANGELOG.md` not carried.

## Completion

- Status: coded, PR open, awaiting ROOT merge. No dependency, lockfile or package.json change; nothing published.
- Torn down: 24 harness workspaces named in logs → 0 present; sim copy and pack probe removed; no owned processes left.
- Parked: Windows legs verified only by CI; native pnpm binary embeds no greppable source (cites from the tagged GitHub source).
