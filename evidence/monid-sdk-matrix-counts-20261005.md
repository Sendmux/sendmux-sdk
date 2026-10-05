# Live E2E matrix gate counts

The generated matrix counted two reads requiring explicit fixture inputs as
executable by default. The runner correctly kept those operations gated.

The shared predicate in `scripts/check-live-e2e-coverage.mjs:724` now honours
scenario gates, matching `gateEnvRequirements` in `scripts/run-live-e2e.mjs:504`.
Regeneration changes the summary from 61 executable / 58 gated to 59 / 60.
All 119 operations and their safety gates remain present.

Verification used Node 22.22.3 and the matching OpenAPI inputs, with unchanged
lockfile and runtime code. Base revision: `894ee580c8331ac19f80a3778300f265a1a39300`.

- Red: `node scripts/check-live-e2e-runner.mjs` exited 1 with `61 !== 59`.
- Generation: the first command omitted `OPENAPI_INPUT_DIR` and failed against
  default inputs on unknown operation `mailboxListDrafts`. Its generated edits
  were restored. The pinned-input generation exited 0.
- Green: pinned-input `pnpm check:live-e2e` exited 0: coverage for 117 API
  operations and 2 MCP operations; runner contracts; historical audit shape.
  The audit remains historical, not fresh live certification.
- Regression: both emitted matrix totals must match the real default CLI plan.
  Existing assertions and all-gates coverage are unchanged.

Raw outputs: Monid `runtime-pin-ci-review/matrix-counts-{red,generation,
generation-pinned,green}.log` task artifacts. No live API run, package
publication or production change occurred during this correction.
