# Agent Guide

## Purpose

This repository uses a harness-first workflow so changes remain testable, reviewable, and repeatable.

## Read Order

1. `README.md`
2. `docs/README.md`
3. `docs/product-spec.md`
4. `docs/architecture.md`
5. `docs/current-plan.md`
6. `docs/decisions.md`
7. `docs/glossary.md`

## Working Rules

- Prefer shared helpers in `src/harness/runtime/` when a test or script needs browser-side engine behavior.
- Prefer fixture updates in `tests/fixtures/` before editing browser runtime code.
- Treat `npm test` as the default completion gate for handoff-engine changes.
- Treat `docs/README.md` plus the canonical docs as the primary documentation surface.
- Read supplemental docs only when the current task needs their extra detail.
- Keep the app runtime and the harness runtime loosely coupled.
- Document new structural decisions in `docs/decisions.md`.
- Current validation commands:
  - `npm test`
  - `npm run test:stage2`
  - `npm run test:fhir:smoke`
  - `npm run test:fhir:batch`
  - `npm run test:render`
- There are currently no separate lint, format, or build commands configured as source of truth.

## Change Order

1. Update or add fixture coverage.
2. Update tests to express expected behavior.
3. Change runtime helpers or engine logic.
4. Run `npm test`.
5. Update docs if the harness contract changed.
