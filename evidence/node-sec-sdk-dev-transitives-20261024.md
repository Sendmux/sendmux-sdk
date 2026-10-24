# Private development dependency security patches

Source-only candidate based on `933904b98dce600604c301f31dd56c2bd29cd57d`.
Only the private root manifest, workspace lockfile and this evidence file change.
No public package manifest, version, source, generated client, public peer range,
workflow trigger or publisher setting changes. No release, tag or deployment.

## Resolution and compatibility

| Private development owner | Resolution | Compatibility source |
| --- | --- | --- |
| MCP conformance | MCP SDK `1.30.0` → `1.32.0` | Conformance declares SDK `^1.29.0`; [patched SDK advisory](https://github.com/advisories/GHSA-46jr-4wx8-v453) |
| MCP conformance | Undici `6.28.0` → `7.30.1` | Conformance declares Undici `^7.25.0`; [patched Undici advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c) |
| OpenAPI generator CLI | Axios `1.19.0` → `1.20.0` | Owner declares Axios `^1.15.0`; [patched Axios advisory](https://github.com/advisories/GHSA-c29m-xwm3-cm6r) |
| Generator's Axios `1.20.0` | follow-redirects `1.16.0` → `1.16.1` | Axios declares `^1.16.0`; [patched redirect advisory](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8) |
| Workspace development Zod4 edges | Zod `4.4.3` → `4.6.6` | [patched Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

Parent-scoped and version-scoped root overrides follow [pnpm's documented
selectors](https://pnpm.io/10.x/package_json#pnpmoverrides). Existing fallback
Undici6 override advances to patched `6.29.1`; conformance alone opts into its
declared Undici7 line. Existing `mcp-remote` Undici7 pin stays unchanged.

The `zod@4` override qualifies this repository's private development resolution.
`packages/ts/ai-sdk/package.json` keeps its existing public `zod >=3.25.76` peer
range and its source manifest unchanged. This change does not patch or constrain
Zod installed by public package consumers. README package/install/API descriptions
are unaffected by this private dependency-only diff.

## Audit evidence

Unchanged base-lock audit reused from
`.claude/artifacts/node-sec-sdk-dev-criticals/audit-{all,prod}.json`:
full `0 critical / 17 high / 18 moderate / 3 low`; production `0 advisories`.

After full `pnpm install`, one audit pair on lock SHA256
`2a8e482eccf3a54994f29b0d07c343592c7c0fcdfae3295455b2d8e216b1b04c`:

- `pnpm audit --json`: exit `1`, `0 critical / 2 high / 9 moderate / 2 low`.
- `pnpm audit --prod --json`: exit `0`, `0 advisories`.
- Raw logs: `.claude/artifacts/node-sec-sdk-dev-transitives/`.

Remaining high advisories:

- `basic-ftp` `5.3.1`, [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r): generator CLI → proxy-agent → pac-proxy-agent → get-uri. Patch starts at `6.2.1`; current get-uri requires `^5.0.2`. Latest generator CLI `2.42.0` still leads through proxy-agent `8.0.2`, pac-proxy-agent `9.1.0`, get-uri `8.0.1`, which requires `^5.3.1`. No compatible researched owner upgrade adopts the patched major; no incompatible major override applied.
- `http-cache-semantics` `4.2.0`, [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp): CLI development oclif → got → cacheable-request; advisory has no patched version.

Remaining moderate/low modules: `fast-uri`, `hono`, `ip-address`. No arbitrary
dependency refresh or claim of a clean full-development audit.

## Verification and rollback boundary

Full pnpm install materializes workspace links; no tests or custom harness added.
The mandatory commit hook runs existing `pnpm drift:check`; native PR workflows
provide full verification. No workflow dispatch or publisher enablement is needed.
Exact native CI/review receipts are attached to the PR and task handoff.

Candidate remains unmerged. A future operator-approved merge can be reversed by
reverting its actual merge commit, restoring the previous private manifest and
lockfile while retaining earlier source fixes. Publication remains outside scope.
