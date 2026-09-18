# Python SDK producer-floor adoption

Recorded 2026-09-17 21:28 Australia/Melbourne. Base `7aeb3e4a027218baae6d5e27f21f56cd772088e5`.

## Correctness

The approved provider-list model change ships in Management 2.0.0. The umbrella imports installed components through `packages/python/sdk/sendmux_sdk/__init__.py:16`, but its old requirements excluded Management 2 and allowed Sending versions without delivery-group routing. `scripts/python-release-guardrails.mjs:21-37` already defines the intended producer floors.

`packages/python/sdk/pyproject.toml:23-24` now requires Management `>=2.0.0,<3.0.0` and Sending `>=1.6.0,<2.0.0`. Core and Mailbox requirements are unchanged. Migration notes distinguish list `ProviderListItem` from detail `ProviderItem` with required variables. The fulfilled Management release override is removed; all ten other overrides remain, including SDK 3 until its candidate exists.

No runtime implementation, generated files, lockfiles, published manifest values or native versions changed. Release Please owns the actual SDK 3 candidate. The locally built version-2 verification wheel must never be published.

## Tests and evidence

- RED: existing SDK guard reported `must require sendmux-management >= 2.0.0,<3.0.0; found >= 1.4.0,<2.0.0`.
- RED: the real pip resolver returned `ResolutionImpossible`: `sendmux-sdk 2.0.0 depends on sendmux-management<2.0.0 and >=1.4.0` with the qualified Management 2 artifact.
- Adjacent RED: after correcting Management alone, the same guard rejected the obsolete Sending floor.
- GREEN: both floors, the existing focused guardrail suite and the same pip resolver passed. Local wheel build/install and `pip check` passed.
- Installed public-interface checks passed: provider lists use `ProviderListItem`, details retain variables and reject missing variables, scalar/array delivery-group requests round-trip.
- Tests: +0 permanent cases, −0 cases; existing guards and real package resolution cover the demonstrated failure. No unchanged full native/conformance suite rerun.

Machine-local receipts: MAIN `.claude/artifacts/python-sdk-3-floors/`; exact commands and failures in `floors-red.log`, `resolver-red.log`, `sending-floor-red.log`, and the matching green logs. `final-audit.json` binds all four dependency ranges and verifies manifest/other-override preservation. Verification wheel SHA256 `b9fd2a3d4d18912f00c50785ea5f5e431fdc91666ebdf6eb7ca7462659a9e354`.

The artifact-owned temporary directory exposed an existing non-repository test's implicit Git-discovery assumption. Setting Git's documented ceiling restored that fixture boundary without altering assertions. Initial offline Sending probe fixtures were corrected to the existing required address/body contract; product code was unchanged. Original failures remain retained.

## Release boundary

PR241 review correction, 2026-09-17 21:52: classify the raised Sending dependency floor under breaking changes alongside Management. The exact requirement and runtime artifacts are unchanged; the normal drift hook still applies. No additional runtime test is warranted for moving an unchanged changelog sentence.

Status: source preparation, not merged or published. Independent review, normal drift hook and PR gates remain; SDK 3 then requires native candidate and public-installed acceptance. Journeys: offline installed-package contract; no browser-facing change or live credentials. Four recorded runner PIDs are absent; temporary scratch is empty; dependencies and verification artifacts are retained for the release gates. No production resources changed.
