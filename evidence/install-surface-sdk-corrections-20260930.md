# SDK install-surface release corrections

Status: local corrections verified; publication remains pending.
Base: `d04e1e9e7749d17d1e356555a01b946f0a3df455`.

PHP publication now passes `candidate.sdk` to `checkSource`. Publishing jobs use the released skills acceptance asset; the proposed-revision input remains available in CI. The npm ownership wait retries thrown transport errors, with at most 30 attempts and 29 waits. Permanent HTTP errors and package identity failures still stop immediately.

The three escapes were distinct. PHP fixtures lacked the committed freshness inputs now required by the shared checker. Existing publishing-gate tests executed the candidate guard after skills preparation, so they could not catch an override bypassing the released asset. Registry-poller tests did not execute the separate inline npm ownership wait.

Verification for this commit:

- `pnpm test:publication-guard` — exit 0, 97/97 passed, 0 skipped; includes all 11 PHP cases and all 12 new released-receipt regressions.
- `pnpm test:mcp-registry-version` — exit 0, 7/7 passed, 0 skipped; the added test executes the actual npm workflow body across six transport/HTTP/identity cases.
- `pnpm exec node --test --test-reporter=tap --test-name-pattern='actual npm ownership step|released skills receipt' scripts/mcp-registry-version.test.mjs scripts/publication-guard.test.mjs` against the base workflows — exit 1, all 13 new regressions failed, 0 skipped. Receipt failures report `Publishing skipped released acceptance asset`; npm recovery/exhaustion fails after the first thrown fetch error.
- `pnpm exec node --test scripts/publish-php-split.test.mjs` with the base publisher — exit 1, 9 passed and 2 failed, 0 skipped. Both success cases report `fatal: Not a valid object name <fixture SDK SHA>^{commit}`. The corrected publisher passes both without changing their assertions.
- Actual workflow-body probes — corrected 19/19 passed; base 4 passed and 15 failed. CI proposed prevalidation remains available; missing or rejected released receipts block every publishing caller.
- actionlint 1.7.12 on release, Snap, Chocolatey, and CI workflows — exit 0.

Tests use the shared checker from skills commit `26a290a1ab8fb62e214b5b81b35c8f6ffa635efb` with committed contract/review fixtures. Workflow tests control external release transport and timers while executing the checked-in step bodies. No test assertions were weakened or removed. All added regressions were observed red. Fixtures and child processes were verified gone.

Node: v24.21.0. pnpm: 10.22.0. Lockfile SHA-256: `b131f7dcdf4bfeed7454ec8df011c1adc63a22ec86d15a8b34102e76710df107`.

Evidence artifacts: `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk/.claude/artifacts/install-surface/pr304-review/approved-batch-*`.

Python source, PyPI 2.1.3, registry metadata 2.1.4, npm package version 1.0.0, and approved README bytes are unchanged. The missing public skills acceptance asset remains a release prerequisite. npm authentication/trust and live OAuth/publication checks remain pending. No provider calls or public writes were made in this batch. The earlier broad SDK result of 636/722 remains disclosed; it was not repeated for these focused corrections.
