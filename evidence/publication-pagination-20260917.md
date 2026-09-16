# Publication preflight pagination correction

Recorded 2026-09-17 09:24 Australia/Melbourne. Base: `d6ce54677d0b1592cce9776f051604f3fc4aed1d`.

Correctness: Release Please run `35160795274` failed before publishing with `Non-progressing discovery pagination`. The response used GitHub's documented numeric repository alias. Discovery accepted only the named path; the pinned release constructor had the same restriction. Both boundaries now share exact prefixes derived from the named repository's positive safe-integer metadata ID. The numeric ID is not trusted from a pagination link or hard-coded in production.

Canonical: [GitHub pagination guidance](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api#using-link-headers) documents numeric repository paths in Link headers. Exact origin, GET-only requests, slash-delimited repository identity, pagination filters/progression, duplicate rejection and all existing bounds remain unchanged. No package, dependency, generated contract, version, retry or timeout changed.

Tests: +three public-preflight cases for wrong numeric repository, wrong host and repeated page; −none. The existing success fixture now exercises numeric links through discovery and the actual pinned Release Please constructor, then reaches its receipt and harmless writer. Named-path acceptance remains covered by the paginated 200th-row control and the receipt-producing empty-candidate case.

Observed RED: the numeric success case failed with `Non-progressing discovery pagination` before the fix. Removing identity/origin/progression checks made each new negative case fail: 0/3 passed. Restored final results: focused 45/45 and canonical `pnpm test:publication-guard` 78/78, zero failures, cancellations, skips or todos. Syntax and whitespace checks passed. An initial baseline wrapper expected an obsolete count of 36 although its inner suite passed 42/42; subsequent receipts use observed counts, without changing test assertions.

Review: independent spec and code-quality review approved both files; ROOT read the complete patch, report and review and matched both source hashes. One minor coverage gap remains: malformed repository metadata IDs have no dedicated public-entry negative test. The guard rejects them explicitly; no such production response was observed.

Journeys: local public CLI fixtures exercise the actual read-only constructor and publication boundary; no browser applies. The preceding merged guard's real hosted diagnostic `35160804424` established six live-schema mismatch failures, six skipped writer steps, a skipped dependent publisher, and six verified fixture removals. Main CI `35160794829` passed all 29 jobs. These do not substitute for the corrected code's normal CI and real hosted preflight, which remain open.

Torn down: the final four-case cleanup run passed 4/4. ROOT independently verified its four exact fixture directories absent and ports 55175, 55183, 55187 and 55191 refused. Recorded command owners 35633, 40609, 42278, 44064, 47582, 57394 and inner owner 57395 were absent; group 57394 was absent. Earlier complete-suite per-fixture handles were not separately enumerated in this report; their test cleanup and bounded-owner completion remain distinct from the independently inventoried four-case run.

Evidence: private `.claude/publication-pagination-report.md`, `.claude/publication-pagination-independent-review.md` and `.claude/publication-pagination-review.diff`; original hosted failure and negative receipts remain in the preceding guard worktree. Guard SHA-256 `fd285894545959b11453a1f4894912eb4341bbf81af0977fb6296efc439dfbc9`; test SHA-256 `5aacf3ce67193c890168714b6bdcedcf188880fe4a4f289014c58bade43b8061`. Lockfile hash remained unchanged after frozen installation.

Status: locally verified, not merged. Normal hook, PR review/CI and corrected hosted preflight remain required. Actual live schema mismatch must still block native publication; the coordinated backend, final regeneration, native channels and manual Atlassian acceptance remain separate release gates.
