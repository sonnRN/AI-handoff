# AI Agent Guardrails

## Scope

- Prefer `src/harness/runtime/` helpers when a test or script needs to load the browser handoff engine.
- Prefer `tests/fixtures/` for regression setup instead of embedding large patient mocks inside test files.
- Change `script.js`, `stage2-overrides.js`, or `stage2-period-overrides.js` only when a runtime or fixture change cannot solve the issue.

## Required Validation

- `npm test` is the default completion gate for handoff-engine work.
- New summary rules should come with either a new fixture or an updated expectation.
- Regression tests should stay deterministic without depending on live network access.

## Safe Change Order

1. Update fixture data or shared runtime helpers.
2. Update tests to express the intended behavior.
3. Update engine logic only when the failing behavior is confirmed.
4. Re-run `npm test`.

## Done Criteria

- Documentation still matches the current harness.
- Shared helpers remain reusable from multiple tests.
- Golden fixtures cover the regression being fixed.
- `npm test` passes.
- Changes are ready to commit and push.
