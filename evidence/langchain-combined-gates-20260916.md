# LangChain combined-gate evidence — 2026-09-16

## Correctness

- Base: `7430a36eb8518f1e52207fc5c6263a633c2fa09f`.
- The LangChain source and installed cohorts now include candidate `sendmux-sending` alongside `langchain-sendmux`.
- The source receipt inventories every `packages/python/langchain/tests/test_*.py` file and requires each one to execute in the LangChain cohort.
- Source and installed tests invoke `SendmuxToolkit` and observe the serialized Sending HTTP body for scalar, list, and omitted `delivery_group` values.
- No version, dependency floor, manifest, lock, or runtime API changed. The future published Sending floor remains a release hold.

## Dynamic controls

- Original-state escape control: after the first patch had been written, an isolated worktree at exact base `7430a36` ran the original source selector/runner plus only a named receipt assertion. The original gate passed its 9 selected LangChain tests, then failed because `packages/python/langchain/tests/test_delivery_group.py` was not collected or executed. The disposable worktree was removed and verified absent.
- Corrected source routing-loss control: replacing the toolkit's request assignment with `pass` made the actual source gate fail `test_send_email_serializes_scalar_list_and_omitted_delivery_group` with `KeyError: 'delivery_group'` (`1 failed, 9 passed`).
- Corrected installed routing-loss control: fresh mutant candidate archives passed byte provenance first (`sendmux-sending`: 42 matched files; `langchain-sendmux`: 3 matched files), then the installed wheel gate failed the same routing assertion (`1 failed, 9 passed`).

## Green gates

- `node scripts/build-python-dists.mjs`: green; source receipt reports 144 tests (`134 native`, `10 langchain`, `skipped: 0`, `xfailed: 0`, `xpassed: 0`), and produced 14 final archives.
- `node scripts/ci-consumers.mjs python`: green; wheel native `197 passed`, wheel LangChain `10 passed`; sdist candidate provenance completed, including Sending and LangChain exact-file checks.
- `node --test --test-name-pattern='Python artifact consumers isolate sequential releases and reject missing or changed targets' scripts/ci-consumers.test.mjs`: green (`1 passed`, `0 failed`, `0 skipped`). This proves the independent LangChain cohort still uses candidate Sending while resolving compatible Mailbox `1.5.1` in the sequential-release fixture.
- `git diff --check`: green.

## Test accounting

- Changed: `packages/python/langchain/tests/test_delivery_group.py::test_send_email_serializes_scalar_list_and_omitted_delivery_group` — a real routing-loss mutation fails it at the serialized transport boundary.
- Removed: none.
- Adjacent package-local survey: `packages/python/langchain/tests` contains only `test_delivery_group.py`; the new inventory guard covers future `test_*.py` additions on that path.

## Artifacts

- `.claude/artifacts/langchain-combined-gates/pre-fix-source-escape-red.log`
- `.claude/artifacts/langchain-combined-gates/source-routing-loss-red.log`
- `.claude/artifacts/langchain-combined-gates/installed-routing-loss-red.log`
- `.claude/artifacts/langchain-combined-gates/final-build.log`
- `.claude/artifacts/langchain-combined-gates/installed-green.log`
- `.claude/artifacts/langchain-combined-gates/python-cohort-isolation-green.log`
- `.claude/artifacts/langchain-combined-gates/final-candidate-source-hashes.txt`

## Unrelated observation

- A full `node --test scripts/ci-consumers.test.mjs` run passed the relevant Python cohort fixture but failed the pre-existing Node missing-artifact test because this isolated worktree has no built `@sendmux/core/dist`. The required named Python isolation fixture was rerun independently and passed.

## Cleanup and status

- All gate-owned temporary workspaces reported removal. Exact retained-test PIDs `6304` and `6306` return absent, and their exact retained paths are absent.
- The exact-base disposable worktree is absent from `git worktree list` and from disk.
- Final 14 candidate archives are intentionally retained under `.tmp/python-dist` for ROOT adoption; their source and archive SHA-256 manifest is retained in the artifacts path above.
- Status: coded and locally committed only; not pushed, published, merged, or released.
