# SDK Node security pin

Base: `ec6ed8b12dcbd2c5d82c9d82175ae99ea8b00c9f`.

`.nvmrc` advances from Node 22.23.3 to 22.23.4, the patched 22.x release in the [official October Node security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Existing single-version workflows read this file directly or from their publication-guard checkout; no workflow duplication or compatibility-matrix changes are needed.

Scope: runtime pin only. Dependencies, lockfile, generated clients, public APIs and package metadata remain unchanged. This source candidate does not replace installed consumers' runtimes or publish packages. Rollback: revert this isolated PR.

Local environment: Node `v22.23.4`, pnpm `10.22.0`; frozen-lockfile installation passed without a lock change. Clean sibling Docs input `67c2acf14bab7815f120315095ab674ed8e5c7ce` matches remote main; it supplies the same two OpenAPI snapshots native PR CI checks out. The existing generator pre-commit hook runs under the canonical Mac heavy-slot guard. No new tests are needed for a one-line pin.

Verification receipts: canonical SDK `.claude/artifacts/node-sec-sdk-runtime/`. Native PR CI must qualify the exact pushed head before merge approval. Merge and publication remain held.

Parked: the existing generator-wide pre-commit hook exceeds the local fast-check budget; no `heavy-run.yml` exists. Moving heavy checks to CI is a separate follow-up.
