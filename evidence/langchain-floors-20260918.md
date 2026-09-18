# LangChain producer-floor correction

Recorded 2026-09-18 17:09 Australia/Melbourne. Base `19c06de92ac2eb982278080cebf71d2b864dda72`.

## Correctness

The release candidate PR 227 (`python-langchain` 0.4.0) retained `sendmux-sending>=1.5.1,<2.0.0` at `packages/python/langchain/pyproject.toml:38` while the manifest and PyPI already carry Sending 1.6.0. The toolkit imports the delivery-group request model from Sending at `packages/python/langchain/langchain_sendmux/toolkit.py:101-102`; that module does not exist in Sending 1.5.1, so the stale floor admitted an installation where `send_email(delivery_group=...)` raises `ModuleNotFoundError`.

`packages/python/langchain/pyproject.toml:38` now requires Sending `>=1.6.0,<2.0.0`. The Mailbox `>=2.0.0,<3.0.0` requirement is unchanged and already matches the manifest. The toolkit imports only `sendmux_sending` and `sendmux_mailbox` (`toolkit.py:10-12`), so no Management or umbrella floor applies. The `Unreleased` changelog bullet states the corrected floor. `docs/native-publication.md` has no LangChain section; the requirement comes from the release inventory and the existing guard at `scripts/python-release-guardrails.mjs:53-67`.

No runtime code, generated files, lockfiles, manifest values, README text or Release Please overrides changed; the repository tracks no Python lockfile. Release Please owns the 0.4.0 candidate.

## Tests and evidence

- RED guard: `PYTHON_CHANGED_PACKAGES=langchain` and `PYTHON_PATHS_RELEASED='["packages/python/langchain"]'` both reported `packages/python/langchain/pyproject.toml must require sendmux-sending >= 1.6.0,<2.0.0; found >= 1.5.1,<2.0.0`. Without a changed-package selector the guard does not enforce the manifest floor, which is why a clean branch stayed green; `scripts/check-python.mjs:41` (CI) and the publish workflow's `PYTHON_PATHS_RELEASED` selector enforce it once `packages/python/langchain` is in the change set.
- RED resolver: a fresh venv accepted `sendmux-sending==1.5.1` next to the source package under the stale floor (`pip check` clean), and `pytest packages/python/langchain/tests` then failed `test_send_email_serializes_scalar_list_and_omitted_delivery_group` with `ModuleNotFoundError: No module named 'sendmux_sending.models.email_send_request_delivery_group'` at `toolkit.py:101` (`1 failed`).
- Pre-change plain install from source with the public index resolved Sending 1.6.0 only because it is the latest release; installed metadata still advertised `sendmux-sending<2.0.0,>=1.5.1`.
- GREEN guard: both selector shapes pass; `pnpm test:python-release-guardrails` passes before and after (fixture unit test, unaffected by repository state).
- GREEN resolver: the same pinned install now fails with `ResolutionImpossible` (`langchain-sendmux 0.3.0 depends on sendmux-sending<2.0.0 and >=1.6.0`); a fresh public-index install from source resolves `sendmux-sending==1.6.0`, `sendmux-mailbox==2.0.0`, `sendmux-core==1.3.1`, `langchain-core==1.6.3`, `pip check` reports no broken requirements, installed metadata advertises `sendmux-sending<2.0.0,>=1.6.0`, `mypy packages/python/langchain packages/python/tests/test_langchain.py` reports no issues in 4 files, and `pytest packages/python/tests/test_langchain.py packages/python/langchain/tests` reports `10 passed`.
- Tests: +0 cases, -0 cases; the existing guard, real package resolution and the existing delivery-group test cover the demonstrated failure.

Machine-local receipts: MAIN `.claude/artifacts/langchain-floors/` (`guard-red.log`, `guard-green.log`, `resolver-red.log`, `resolver-pre-plain.log`, `resolver-green-pinned.log`, `resolver-green-plain.log`, `drift-check-dryrun.log`).

## Release boundary

Status: source correction only; not merged or published. PR 227 must be refreshed by Release Please after this lands so the 0.4.0 candidate carries the corrected floor, then native candidate build and public-installed acceptance follow the existing publication gates. Journeys: offline installed-package contract; no browser-facing change or live credentials.
