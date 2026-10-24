# SDK development critical dependency patch

Status: source candidate only; merge and every publication remain held.

Parent: SDK #324 at `85ab2f827d61ead4c094799bf25791968459373c`, itself stacked on SDK #323. Both prerequisites remain unmerged. Target: `main` after those candidates.

The private root override pins `shell-quote` used by OpenAPI Generator's `concurrently` dependency. Advance that existing override from 1.9.0 to 1.11.0. Release Please's `conventional-changelog-writer@6.0.1` accepts Handlebars `^4.7.7`; refresh its lock entry from 4.7.9 to 4.7.10 without a new override or parent upgrade.

Canonical patched versions:

- https://github.com/advisories/GHSA-pqg4-j6r4-53mv — shell-quote 1.11.0.
- https://github.com/advisories/GHSA-8r5x-fm3f-whwj — Handlebars 4.7.10.
- https://github.com/advisories/GHSA-p8wg-vrv2-v86f — Handlebars 4.7.10.

Validation on Node 22.23.4 / pnpm 10.22.0:

- `pnpm --recursive update handlebars`: exit 0; diff limited to the two intended resolutions and existing override.
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm audit --json`: exit 1 for remaining advisories; critical count 3 → 0, high 17, moderate 19 → 18, low 3.
- `pnpm audit --prod --json`: exit 0; all counts zero.
- `git diff --check`: exit 0.
- Mandatory pre-commit `pnpm drift:check` and native PR CI are required before merge approval; their own logs/checks are authoritative.

Local logs: SDK MAIN `.claude/artifacts/node-sec-sdk-dev-criticals/`. No tests added, removed or changed. README registry accuracy already checked this session; this patch changes no public package names, versions, install commands or API. No application/runtime/public package/generated source is changed by this slice.

Rollback: revert this candidate's actual merge and restore its parent lock/override. Existing #323 runtime pin and #324 dependency patches remain. Installed consumers and published packages are unchanged; residual noncritical advisories remain separate work.

No heavy-run workflow exists; mandatory local hook runs under the existing heavy-slot guard. Full native CI is the qualification gate; no publishing workflow is dispatched.
