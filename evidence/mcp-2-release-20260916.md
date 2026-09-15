# SDK native release evidence

Updated 2026-09-16 03:57 AEST. This is native release evidence, not full-goal completion. Source implementation evidence is [mcp-2-modernisation-20260915.md](mcp-2-modernisation-20260915.md).

## Source boundary

- Source PR215 merged at `fb6085ce643c117dc3f2beb29c4fc57c303272b7`; reviewed head `c475830539cc3986afe6b6eb113640ecb58c4ccd`.
- Final PR CI34998085911 and source-main CI34999528668 each passed29/29. Chocolatey34998086064 passed. Independent whole-source and subsequent scoped reviews approved; CodeRabbit skipped210 files, not approval.
- Source worktree and local/remote `agent/mcp-2-modernisation` removed after ancestry, exact branch identity and preservation checks. Git registration, filesystem and remote absence verified.
- Unique tool state retained in MAIN `.claude/reaped/mcp-2-modernisation-20260916-0311/preserved-tool-state.tar.gz`, SHA256 `6fcf0031dc1a40f48b4b53b30fde3abd0d7b9eef912cab3b5b9d2257c953cc99`. Shared artifacts and the primary user checkout were preserved.

## Python core 1.3.1 — published

- PR216 head `082a35e50fe0232893beaa6428619526a6b7f4f4`; merge `5a42e4e380133707d6efbdc70459499ff3080033`.
- Three-file native release: manifest, pyproject and changelog. No handwritten runtime/test changes. Its context-manager exception fix and red evidence are in the source evidence.
- Premerge exact PyPI version/tag absent. Complete review sweep had no findings/pending checks; CodeRabbit was label-excluded, not approval.
- Local Python build: mypy58 files,143 tests, all seven distribution pairs valid. Publication preparation selected only the core wheel/sdist. Local isolated wheel consumer12/12 and pip check passed.
- Publisher35001414727 succeeded. Post-release mainCI35001414444 passed29/29.
- `python-core-v1.3.1` points to the merge commit. PyPI `sendmux-core==1.3.1` has two unyanked artifacts, matching local build hashes:
  - Wheel `96a0f8815686268c19c528ae5ccc8f93a2d5096dd7c2a5232298716e9a90a1c2`.
  - Sdist `879989c05691bcaa278bd5fe362df0c3717911b4838a91968836c972e97f3e49`.
- A fresh isolated install from PyPI passed pip check and all12 public core tests, importing its own site-packages, not checkout code.
- Raw receipts: MAIN `.claude/artifacts/native-core-1.3.1/` contains local-checks.log, installed-consumer.log, published-consumer.log, publisher-final.json/log, pypi-1.3.1.json, core-main-ci-final.json/log and PR216 sweeps.
- Published-consumer log SHA256 `5e0bd2ac7a2db5fb0a4950c2db2619263f64f5834e6b8b1e70fdde2ab4184353`; ROOT verified all six recorded PIDs, five child groups and the exact temporary environment absent. Prior local verification records11 PIDs/nine groups/one environment absent in root-verification.json.

## MCP 2.0.0 — verified candidate, not published

- PR220 bot head `7cf5a54623df7a9c8205804df8c6bb2ed2403b2c` adopted as agent commits `0c434076aafc7c5769a99e1dea11affa77eaf012` and `c50659383f884137bb4d0828977c65fab1785530`.
- Release escape: the bot updates native versions but doesn't regenerate factory evidence or adopt dependent package floors. Existing checks caught both before merge: “must require sendmux-core >= 1.3.1,<2.0.0; found >= 1.3.0,<2.0.0” and “MCP contract version must match native project version”, `'1.8.0' !== '2.0.0'`.
- Canonical trace: `scripts/python-release-guardrails.mjs:26` enforces the consumer floor; `packages/python/mcp/sendmux_mcp/contract.py:64` generates native version and provenance from the real factory; `scripts/check-mcp.mjs:49` checks package/contract agreement. The fix raises the core floor, regenerates only the contract version/hash, removes only MCP's one-time release override, and moves its notes into the released section.
- Adjacent boundary: server.json, manifest, native package and generated contract agree on 2.0.0; all tools, schemas, runtime provenance and sibling release overrides are unchanged. The previous upgrade anchor is retained. ROOT caught and corrected the new changelog link to `#200-upgrade`, verified with the pinned GitHub slugger.
- Tests: no new or removed test source. Existing release checks were observed red then green. Final checks passed: full language drift; Python distribution build143 tests; MCP155 tests; registry5 tests; release-state27 tests; dependency guardrails and exactly two selected MCP publish files. MCP emits22 upstream A2A protobuf deprecation warnings, not pristine output.
- ROOT's clean, isolated wheel consumer passed all60 public MCP/retry tests and pip check, loading MCP2.0.0 and core1.3.1 from site-packages. Both distribution formats match their native metadata and packaged contract. The changelog-only link correction is excluded from both archives; packaged README bytes remain current.
- Required conformance: 2025-11-25 has70 SUCCESS; 2026-07-28 has114 SUCCESS,1 INFO and5 declared capability exclusions. Nine non-scored extension checks still fail, explicitly retained; this is not a claim that every runner check passes.
- Candidate wheel SHA256 `81c73a5770391f44550a74e7173f763f83ba3011eff45b8269a0b25e694beaa8`; sdist `884bdb74aad635a075de5de5ebb6e676e2efb0d45fcff359d7eb2ad43e00dc30`. PyPI2.0.0, registry2.0.0 and tag python-mcp-v2.0.0 were absent at preflight.
- Raw receipts: MAIN `.claude/artifacts/native-mcp-2.0.0/` contains red/green checks, final-pass-staged.log, candidate archives, installed-consumer.log, conformance.log and both protocol result trees, live-canary.log, index-preflight.json and root-verification.json.
- ROOT independently verified103 recorded PIDs,22 owned process groups and25 temporary paths absent. Conformance server/runner processes were contained in the verified absent owned group; no standalone server PID receipt was emitted by that unchanged runner.
- Failed verification attempts retained: a diagnostic passed an Array where the existing checker requires a Set; initial full drift used stale default OpenAPI input and raised `KeyError: 'MailboxSyncMeta'`; the corrected input then exposed the unstaged generated contract. Correcting invocation inputs and staging generated output resolved these gates without changing assertions or broad generated source.
- Scoped review of `7cf5a54..c506593` is spec compliant and quality Approved, with no findings. The reviewer left generator provenance for ROOT to verify; generate-mcp.log and final-pass-staged.log show the actual generation and zero-drift rerun, resolving that item. Remote publication remains pending at this checkpoint.

## Remaining gates

- Native MCP2.0.0 and remaining affected SDK/CLI/dependent packages still require exact native release, index/channel and installed-consumer proof.
- `pnpm canary:openapi` is explicitly not green: eleven semantic mailbox-metadata differences await the reviewed app deployment. Raw live-app-openapi.json and live-schema-diff.json are in the core artifact directory. Local snapshots match published docs `e4535b4`; no canary assertion was weakened.
- App pin/deployment, rollback proof, final production OAuth/attachment canaries, docs/skills/plugin publication and the user's manual Atlassian acceptance remain full-goal gates.
- Docs editorial decision remains open; no third Walter attempt or manual exemption is authorised. No paid provider call occurred in this release slice.
- Release worktree is still live; cleanup follows its completed publication work.
