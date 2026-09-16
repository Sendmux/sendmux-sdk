# PHP Mailbox source corrections I1/I2

Prepared 2026-09-16 11:32 Australia/Melbourne. Status: locally committed, awaiting independent review; not merged or published. The user's release hold remains binding. This correction is preparation only: reviewed mailbox-variables-routing integration, combined OpenAPI regeneration, combined gates, and release approvals remain mandatory.

## Scope and immutable inputs

- Fresh base: `db132e4d1850fb0b59b8edbbd52b7d796df1ba5e` (`origin/main`).
- Source correction: `88b189e19287b3a80152515e61073f3d359f2dce`, `agent/php-mailbox-native-corrections`.
- Worktree: `/Users/rj/Desktop/GIT-REPOS/sendmux-sdk-php-mailbox-native-corrections`.
- Six source/test/doc files: 203 insertions, eight deletions. This evidence is the only additional tracked file.
- Independent native review: `mailbox-native-review.md`, SHA-256 `462b3149ed6ea8057f0df00e37ab5cb668c070cd98f7407225663fe9c43f1fa4`; I1 and I2 are the only correction targets.
- Native Mailbox split remains unchanged at `4bf4126aaf13dbda795b0ccbd19704a340efcc02`. No native source resync or release action occurred.
- Explicit generator input: `/Users/rj/Desktop/GIT-REPOS/sendmux-docs-mcp-oauth`, HEAD `c5a6e1e3a1bab023f3051c12254e8dae069391f5`, containing snapshot commit `e4535b4`. Both snapshot bytes match this SDK base's `packages/python/mcp/sendmux_mcp/openapi/` files.
- Snapshot SHA-256: app `86e7afbe39ff9847c2f0c2d9f63deb91326a426f1d52db90dba787251ea0be6f`; sending `f3caa5b45c7d9e0c8890d54964ffd7ed9a78073833b3d4959b40b714066d15e9`.

No manifests, versions, dependencies, locks, OpenAPI, public signatures, Windows files, or other package source changed. Main and unrelated worktrees were preserved. Reaper dry run held existing invisible/detached/unshipped worktrees and reaped zero; label-scoped container inventories were empty.

## I1: null changes-response contract

Trace: `codegen/templates/php-nextgen/api.mustache:949-950` generates `packages/php/mailbox/src/Api/MailboxAPIApi.php:19083-19084`; `src/ObjectSerializer.php:393-395` legitimately returns null for null input. The selector previously dereferenced it before validating its class. An HTTP 200 body `null` consequently raised PHP `Error`, contrary to the documented unmatched-JSON `UnexpectedValueException` contract.

Canonical correction: test `$value instanceof $variant` before model dereferences. PHP's [type operator documentation](https://www.php.net/manual/en/language.operators.type.php) documents dynamic class strings and false for nonobjects. This preserves serializer null behavior and the two-variant selector; broadly catching `Error` would hide unrelated programming faults.

The one-line guard was applied to the template, then generated with:

```sh
OPENAPI_INPUT_DIR=/Users/rj/Desktop/GIT-REPOS/sendmux-docs-mcp-oauth pnpm generate:php
```

The existing generator rewrites Mailbox, Sending, and Management source directories. Temporary write claims covered those observed outputs and were released after generation. Hash comparison of all 326 generated source files proves only MailboxAPIApi changed, by the same one-line guard. No generated file was hand-patched. Adjacent-pattern search found this selector only in the template and generated Mailbox API.

## Tests and observed sensitivity

`packages/php/tests/MailboxChangesResponseTest.php` uses public API calls and Guzzle `MockHandler` only at the HTTP boundary. It is automatically included by the existing PHPUnit directory suite. Tests: +3 methods / 11 cases; -0. No private-method, source-text, mocked-model, duplicate, skipped, or weakened assertions were added.

| Owning test | Cases | Observed RED / sensitivity |
| --- | --- | --- |
| `testUnmatchedSuccessBodyRaisesDocumentedException` | null and `{}` across four call forms | Genuine pre-fix null RED in all four forms: `Failed asserting that exception of type "Error" matches expected exception "UnexpectedValueException"`; message `Call to a member function valid() on null`. The four adjacent `{}` cases already passed. A temporary wrong-exception mutant makes all eight fail. |
| `testSuccessfulResponsePreservesDeclaredModelAndPayload` | legacy and typed success | Temporary always-throw selector makes both error with `UnexpectedValueException: mailboxGetChanges response matches neither declared model`. Both pass against the unmodified corrected source. |
| `testMalformedJsonRetainsApiExceptionInAsyncCall` | malformed JSON async response | Temporary removal of `JSON_THROW_ON_ERROR` fails: `UnexpectedValueException` does not match expected `Sendmux\Mailbox\ApiException`. Correct source passes. |

Mutants existed only in a task-owned temporary copy, loaded through the ordinary autoloader/public-call seam; the generated worktree file never changed during sensitivity checks. These controls were promoted into owning CI at ROOT's direction because no earlier tracked test covered successful changes-response calls. Always-throw behavior cannot satisfy the suite. Sensitivity controls are not misrepresented as pre-fix regressions.

## I2: migration completeness

`packages/php/UPGRADING-3.0.md:103-195` now covers the old/new thread-message response class across ordinary, HTTP-info, async, and async HTTP-info forms; the five existing `ResponseMeta` getter/setter replacements; and typed wrappers, subclass overrides, promise callbacks, and manual fixtures. It distinguishes required thread `request_id`/`thread_id` from optional `sync_state`, and explicitly validates nested metadata instead of implying recursive envelope validation.

Names and signatures were checked against current generated code and metadata-introduction commit `87f54eb1679994ddcbdd68ad25d674ad6978f57f`, whose parent is `4fbd8356f656df8af77900f7c5be78d2fc799c03`. The migration's successful-model wrapper, thread wrapper, and complete manual empty-thread fixture execute from extracted code blocks. The fixture prints `request_example thread_example`; missing thread ID is explicitly invalid while absent optional state is valid.

README and unreleased changelog summarize and link the complete migration. Existing Packagist availability, rollback, PHP 2.0 migration, and persistent-cookie `HostOnly` warnings remain intact. Fresh Packagist readback confirms Core/Sending/Management latest v2.1.1 and Mailbox/SDK latest v2.1.0; Mailbox/SDK 3.0.0 are absent. The root README's published PHP 2.1 install constraints remain accurate and unchanged.

## Verification and limits

- `pnpm install --frozen-lockfile` and normal Composer install succeed; both tracked locks remain byte-identical to base.
- `pnpm exec node scripts/check-php.mjs`: audit clean; five package manifests validate strictly; all PHP syntax, PHPCS, and PHPStan checks pass; **58 PHPUnit tests / 256 assertions, zero errors, failures, or skips**; 10 OAuth checks pass, zero skips.
- Fresh final PHPUnit/JUnit run confirms the same 58/256 totals, including all 11 new cases.
- Additional retained native controls pass: 16 public API checks across all four forms, four malformed-JSON controls, five metadata classes/six response mappings, empty-list/required-thread-ID boundaries, and three executable migration examples.
- Diff whitespace checks pass. Budget trace: one constant-time type guard, still at most two variants, with no added IO, requests, retries, cache, or persisted/per-replica state. No latency benchmark is claimed.

Skills guided public-seam RED/GREEN evidence, bounded exception handling, source-owned regeneration, complete migration guidance, and generated-code restraint. Focused migration documentation score: 8 to 10 after correcting scope/type omissions; no unrelated prose rewrite. No rules-evolution candidate was identified.

This is PHP 8.4.10 / PHPUnit 11.5.55 source-workspace verification, not a PHP-version matrix, newly installed public Mailbox 3.0.0 proof, production/browser journey, real OAuth/provider call, or combined-routing release acceptance. Source correction independent review is pending. The native candidate remains rejected/frozen until explicit future resynchronization and acceptance.

## Durable receipts and cleanup

MAIN `.claude/artifacts/php-mailbox-native-corrections/` holds raw logs, JUnit, snapshot/package readbacks, all six final source hashes and 326 generated-file comparisons, exact command/exit/PID records, and retained private verification inputs.

| Receipt | SHA-256 |
| --- | --- |
| `verification-receipt.json` | `a59d44c397d77709705ac8f2d30d991d9134615dc1b21ed3ad4de1008ea65ee8` |
| `null-red.log` | `d3918f1eba7b79611b41249d13b735bf5ada7dd5397a8ad501e456bb093f35cc` |
| `php-gate-final.log` | `f859be139b0310dc5244d5e8ac359b334336e8c948429dafeb08be078dda3711` |
| `all-case-sensitivity.log` | `1c798c0ae03c384092a184027cb0c2291c415a168843654062c6479890a116cf` |

Additional receipts: `generation.log`, `phpunit-final.xml`, `phpunit-final-58.log`, `api-controls.log`, `malformed-control.log`, `metadata-controls.log`, and the three mutant JUnit files. All 47 recorded process PIDs and 29 process groups are verified absent (`ESRCH`). All recorded `acceptance.*` directories are removed; generated `.tmp/php-codegen` and PHPStan cache are removed and verified absent. Their source-derived contents are reconstructable from the retained inputs; no unique source was deleted. The isolated worktree and regenerable dependency installation remain for independent review. No server, browser, container, tunnel, or seeded data was created.

Pending: independent review, reviewed combined routing integration, combined OpenAPI regeneration/gates, and explicit release authorization. No push, PR, merge, tag, publication, or deployment was performed. Parked: ROOT's unrelated Windows gate diagnosis.
