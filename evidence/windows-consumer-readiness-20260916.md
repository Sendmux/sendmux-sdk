# Windows consumer readiness boundary

Status: coded, not merged. Actual Windows GREEN and final independent review remain required.

## Cause and correction

The Windows diagnostic started its 10-second readiness clock before the controller compiled its Job adapter and launched the fixture. PR #230 CI `35081095736` measured 24.736 seconds on Node 26 and 15.817 seconds on Node 22 before the command bridge started. Both healthy controls failed with `Fixture did not become ready`; the unchanged orphan/deadline scenarios passed. The original logs remain in `.claude/artifacts/native-python-sending-1.6.0/windows{22,26}-initial-failure.log`.

Canonical boundary: the fixtures already write a positive leader PID before launching their descendants (`scripts/diagnose-windows-consumer-ownership.mjs`, Node and PowerShell leader scripts). The diagnostic now waits for that valid receipt or early invocation completion before starting the unchanged 10-second readiness interval. The existing 15-minute `run()` deadline bounds startup (`scripts/ci-consumers.mjs`); the losing polling loop is stopped and awaited. This changes neither production ownership nor any timeout value.

If a started Node fixture never becomes ready, the diagnostic invokes the existing captured owner-deadline callback and awaits confirmed cleanup before reporting the original readiness error. Startup does not cache a partial leader-only receipt in the cleanup state: the existing later/finally reads retain the descendant PID as well. Both PowerShell scenarios use the same corrected startup boundary; stdout, exit, orphan, deadline, exact-PID and workspace assertions remain intact.

## Regression evidence

The prior suite tested stdout, exit propagation and ownership but did not distinguish controller startup from fixture readiness. Tests were committed first in `d578a54a3f100eaf46d8abfa4442edb35c5836bc`; CI `35083167616` ran the unfixed diagnostic on actual Windows Node 22, 24 and 26.

- Added `scripts/test-windows-consumer-sensitivity.mjs:cold-controller-start`: the copied Job script waits 12 seconds before its bootstrap launch. All three Windows jobs failed the healthy control with `Fixture did not become ready`.
- Added `scripts/test-windows-consumer-sensitivity.mjs:started-never-ready`: the copied Node fixture records its handles but never writes readiness. All three jobs failed with `A started fixture that misses readiness must take the owned deadline cleanup path`; actual error was `interrupted=false`.
- No tests were removed or assertions weakened. The four original healthy/lost-stdout/wrong-exit rounds and cleanup sensitivity remain unchanged.

Exact RED jobs are `104751715229` (Node 22), `104751715400` (Node 24), and `104751715179` (Node 26). Full logs are `.claude/artifacts/native-python-sending-1.6.0/windows{22,24,26}-readiness-red-d578a54.log`. Each new case retained its copied fixture/results on failure; these are hosted-runner evidence, not local resources claimed removed. Each diagnostic row verified its owned fixture/command paths absent; original failure receipts remain preserved.

## Verification boundary

Both diagnostic and sensitivity scripts pass `node --check`; `git diff --check` passes. These local syntax checks do not establish Windows behaviour. No package, generated client, dependency, workflow, Windows owner, bridge, or production Job script changes are included. Real Windows GREEN, exact raw cleanup receipts, hosted CI/review settlement and sequential native publication are still open.

Journeys: not applicable to this offline CI diagnostic; production and manual Atlassian journeys remain part of the wider release goal.
