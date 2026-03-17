# AI Handoff

This project generates and reviews handoff summaries for EMR-style patient data.

## Repository Map

- `docs/`
  - product intent, architecture, plan, decisions, glossary
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

## Key Docs

- [Product Spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Current Plan](docs/current-plan.md)
- [Decisions](docs/decisions.md)
- [Glossary](docs/glossary.md)
