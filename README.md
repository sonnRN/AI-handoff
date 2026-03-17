# AI Handoff

This project generates and reviews handoff summaries for EMR-style patient data.

## Quick Start for Agents

1. Read [AGENTS.md](AGENTS.md).
2. Read the docs hub at [docs/README.md](docs/README.md).
3. Use the canonical docs there before opening supplemental or historical documents.
4. Validate changes with `npm test`.

## Repository Map

- `docs/`
  - canonical docs, supplemental harness docs, and historical references
- `src/`
  - shared harness code used by tests and Node-based tooling
- `tests/`
  - golden regression tests, smoke tests, and fixtures
- root browser files
  - `script.js`, `stage2-overrides.js`, `stage2-period-overrides.js`

## Harness Workflow

1. Load the browser-side handoff engine through the shared VM harness in `src/harness/runtime/`.
2. Use local fixtures or FHIR-backed patient helpers from the harness runtime.
3. Run `npm test` to validate regression, smoke, batch, and render behavior.

## Validation

- `npm test`
  - Runs the full harness suite.
- `npm run test:stage2`
  - Runs the Stage 2 summary regression test.
- `npm run test:fhir:smoke`
  - Runs a single-patient FHIR smoke test.
- `npm run test:fhir:batch`
  - Runs the batch FHIR validation pass.
- `npm run test:render`
  - Runs the narrative SBAR render smoke test.

There are currently no dedicated lint, format, or build commands configured as repository truth.

## Key Docs

- [Documentation Hub](docs/README.md)
- [Product Spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Current Plan](docs/current-plan.md)
- [Decisions](docs/decisions.md)
- [Glossary](docs/glossary.md)
