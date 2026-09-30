# Skill release freshness — 2026-09-30

Status: coded and verified locally; not published. Release coordination belongs to the install-surface task.

`scripts/publication-guard.mjs` checks reviewed skills against every immutable publishing source before its writer. It pins the checker to the selected skills commit and binds the resulting receipt to the SDK revision and both OpenAPI snapshot hashes. Missing inputs, changed contracts and stale review evidence fail. CI, Snap and Chocolatey prepare the same pinned skills source through the shared release-check action.

Validation: `SENDMUX_TEST_SKILLS_ROOT=<skills-worktree> node --test scripts/publication-guard.test.mjs` passed all 52 tests with no skips. These fixtures exercise the actual Git and CLI publication boundaries. Official actionlint 1.7.12 accepted all three changed workflows.

Test added: `publication fails before its writer when pinned skill inputs are absent`. The pre-change negative control failed with `Missing expected rejection.` The final guard prevents the writer. Existing source/release fixtures now supply real committed compatibility inputs and reviews; no tests were removed.

Private logs: Sendmux MAIN `.claude/artifacts/install-surface/freshness-sdk-red.log` and `freshness-sdk-final-check.log`. The latter completed at 2026-09-30 16:20. Test fixtures removed their temporary repositories; no background service or live build was started.

Pending: merge/release and a public approved skills acceptance receipt. README/package publication and hosted OAuth acceptance remain separate task slices.
