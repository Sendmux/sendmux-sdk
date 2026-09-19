# Native publication gates

The Release Please, recovery, Snap, and Chocolatey workflows and the PHP split command require strict equality between both candidate-owned OpenAPI 3.1 snapshots and the unauthenticated production App and Sending schemas. Object-key order is canonicalized; descriptions, arrays, required fields, and all other content remain significant. Description-only drift can therefore block publication without proving a client-breaking change.

The checker makes one request per fixed production endpoint, with a 15-second deadline through body consumption and an 8 MiB decoded-body limit. Redirects, incomplete bodies, non-2xx responses, invalid JSON, non-3.1 documents, and differences fail closed. Publication guard steps have a two-minute outer limit. These guarded entry points offer no offline-live directory, endpoint override, retry, or ignored-field list.

`pnpm publish:rubygems`, `pnpm publish:npm:ts`, and `scripts/update-homebrew-tap.mjs` are low-level workflow helpers, not supported standalone release procedures. They do not enforce candidate provenance or live-schema parity themselves. Use their guarded Release Please publishing or recovery workflow; a credential holder invoking a helper directly can bypass those workflow checks.

## Candidate identity

Raw inputs belong to the immutable SDK commit at `packages/python/mcp/sendmux_mcp/openapi/`. Missing snapshots are a stop, not permission to substitute `docs/main`. The guard records its own source revision, candidate commit, both snapshot SHA256s, and check time, including before a failed comparison.

The Release Please preflight runs before the action can create any public tag, including Go tags. It checks the event commit and pending merged release-PR commits, using the pinned action's updated-order REST discovery window: 200 merged PRs, not 200 closed PRs. Incomplete discovery fails closed after 20 responses. Exact `release-please@17.6.0` public read-only construction supplies release paths, tags, versions, and merge SHAs; this script does not calculate release versions. More than one pending source commit is blocked under the existing sequential-release rule.

The preflight checks existing tag targets and rereads main, the discovery window, release tuples, and tag targets before the action. Afterward, it independently resolves emitted tags instead of trusting action output SHA fields. Dependent publishers check out that verified candidate, select only released packages, generate from its raw snapshots, and reject snapshot replacement after generation. Each publishing job reruns the live guard at its first write. Recovery resolves the requested CLI, Management, MCP or Python package release tag and checks native metadata at that source commit; the Python recovery rebuilds only that tag's package, selects the distributions PyPI does not already hold, and reruns the live guard before its first upload.

Recovery restores the immutable control-revision guard after checking out the candidate. Python artifact checks may build all packages, but the current guard's preparation command copies only emitted Python paths into the upload directory. An absent selector retains local all-package preparation; a supplied empty or malformed selector fails closed.

These are point-in-time checks, not a transaction with GitHub or a permanent certificate. Keep release PRs sequential; a queued event superseded by a newer main head must fail. Advertised-schema equality does not prove every authenticated response, every replica, or a future rollback. Existing affected-response and published-consumer acceptance still apply.

## PHP split publication

Use the current SDK guard checkout to publish a reviewed split. Supply full immutable SHAs, the exact package and intended version, and clean split checkout with its expected `origin` repository:

```sh
pnpm publish:php-split \
  --sdk-repo /absolute/sdk-checkout --sdk-sha "$SDK_SOURCE_SHA" \
  --split-repo /absolute/split-checkout --split-sha "$SPLIT_MERGE_SHA" \
  --package mailbox --version "$PHP_VERSION" \
  --evidence evidence/release-YYYYMMDD.md
```

Omit `--evidence` when no additional evidence file exists. The named evidence file must identify the exact SDK SHA; no other unmatched file is ignored. All package file identities and modes must match the SDK subtree, except the single `## Unreleased` heading may become `## <version> (YYYY-MM-DD)`. Composer remains version-free; package identity, dated changelog version, and available native version metadata must agree.

The command checks immutable source snapshots before creating an annotated `v<version>` tag or pushing that exact ref without force. Conflicting tags, dirty split state, wrong origin, and package/source differences fail before creation. A retry with an existing local or remote tag still runs a fresh live comparison. The annotation and stdout receipt retain source and snapshot identities. Packagist ingestion and installed-consumer verification remain required after publication.

The split must have exactly one allowed push destination. Tag lookup and push use that explicit destination, even when the fetch URL differs; multiple push URLs are rejected before any tag is created.

## Snap and Chocolatey

Snap publishing binds YAML version, npm tarball URL and SHA512 checksum to the CLI producer tag. The fixed HTTPS npm registry's SLSA provenance must identify that source commit, repository, workflow, and package digest; missing or mismatched provenance fails closed. Snap packaging stays in its own checkout while the producer's immutable schemas are checked after the build. PR and non-publishing builds do not call production schemas. A recovered npm artifact whose provenance identifies another event commit is not silently certified as the old producer.

Chocolatey publishing resolves the selected CLI tag, builds that commit from its committed schema inputs, and checks live parity before the first ZIP upload. Package uploads and Chocolatey push remain downstream. Non-publishing builds and the ownership diagnostic remain non-publishing.

Chocolatey's guard checkout uses `github.workflow_sha`, the immutable commit of the executing workflow, not latest `main`. A release event uses the tagged commit's workflow; rerunning an old tag's pre-guard workflow does not add this protection. To package an older CLI producer with the reviewed guard, use `workflow_dispatch` on the reviewed control revision with the intended `version` and `push` inputs. Keep existing tags immutable.

Before a manual Snap upload, verify the selected YAML version and npm source checksum, then run `node scripts/publication-guard.mjs snap` from the current guard checkout with that exact Snap configuration immediately before uploading to `edge`. After upload, record and verify each resulting store revision and architecture against the selected build. Before manual `stable` promotion, verify that exact existing revision, rerun the same fresh producer-bound guard, promote, and read back the stable channel map. The guard checks producer provenance and schemas, not store revisions; the npm source checksum is not a snap artifact checksum. A prior green workflow is not a permanent certificate. Manual promotion remains owner-approved policy: this source change cannot prevent a credential holder from bypassing it with direct store or Git commands.

## Verification and release authority

`pnpm test:publication-guard` uses owned loopback HTTP fixtures and temporary Git repositories, including a local bare PHP remote. It executes each checked-in workflow gate command with a harmless next-write recorder; incompatible contracts must never reach it. It does not publish packages.

The **Publication guard negative diagnostic** workflow is an owner-dispatched, credential-free Actions proof. With `publish=true`, it commits an intentionally incompatible temporary fixture, invokes the production contract gate, and retains guard/sentinel outcomes for pre-release, dependent, independent recovery, and conditional distribution shapes. Expected result: failed guard, skipped writer sentinel, exact fixture cleanup. It does not execute Release Please or a public writer; pinned release discovery is separately covered by the read-only integration fixtures.

Source tests, the Actions negative diagnostic, and the final positive publication/readback are separate gates. Only the release owner dispatches diagnostics or authorizes public publication.
