# AI-Assisted Nursing Handoff Demo

Research prototype for explainable, AI-assisted nursing handoff summarization and prioritization.

## Safety Status

- Demo and research prototype only
- Not for clinical use
- Not a diagnostic or treatment system
- Synthetic data only
- Do not upload, paste, or test with real patient data or PHI

## What This Repo Demonstrates

This project shows how MCP-delivered synthetic patient timeline data can be turned into:

- a longitudinal patient summary
- handoff-relevant changes
- prioritized nursing handoff items
- structured output that can later support SBAR-style rendering

The current demo runtime is built on an MCP-backed public synthetic FHIR adapter. For GitHub Pages, a static public synthetic snapshot is included as a read-only fallback because GitHub Pages cannot run the MCP or local server-handler layer.

## Public-Release Data Policy

- Runtime patient intake is MCP-first and public synthetic FHIR only.
- External FHIR integration targets a public synthetic sandbox.
- GitHub Pages uses a committed public synthetic snapshot fallback when server routes are unavailable.
- Any patient-like identity returned by external synthetic FHIR data is converted to a clearly synthetic label before display.
- No private hospital endpoints, secrets, or production credentials belong in this repository.
- External FHIR access is restricted to an allowlisted public synthetic base URL.
- Local synthetic fixture data is kept only for harness and regression testing, not for browser runtime display.

Read:

- [DISCLAIMER.md](DISCLAIMER.md)
- [PRIVACY.md](PRIVACY.md)
- [FEEDBACK.md](FEEDBACK.md)
- [RELEASE_READINESS.md](RELEASE_READINESS.md)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run validation

```bash
npm test
```

If PowerShell execution policy blocks `npm`, run:

```bash
node scripts/run-node-tests.js
```

### 3. Open the demo

Use your preferred static server to serve the root app files. The browser runtime can use the public demo snapshot on GitHub Pages, and local tooling can call the server handler modules directly.

Main entrypoints:

- `index.html` for the EMR-style demo
- `algorithm-demo.html` for the algorithm-focused demo

### 4. Start the local MCP server directly

```bash
npm run mcp:server
```

### 5. Verify direct MCP stdio mode

```bash
npm run test:mcp:stdio
```

## Architecture Overview

```mermaid
flowchart LR
    A["Public synthetic FHIR sandbox"] --> B["MCP-backed data access layer"]
    B --> C["Normalization"]
    C --> D["Longitudinal patient summary"]
    D --> E["Change detection"]
    E --> F["Prioritization"]
    F --> G["Handoff-ready structured output"]
```

### Runtime Layers

- Browser app
  - UI and rendering
- server handler layer
  - patient data access
  - synthetic FHIR adapter
  - MCP-backed data gateway
- Handoff engine
  - normalization
  - summary logic
  - handoff analysis
- Harness and tests
  - regression and smoke validation

See:

- [docs/architecture.md](docs/architecture.md)
- [docs/product-spec.md](docs/product-spec.md)
- [docs/mcp-fhir-integration.md](docs/mcp-fhir-integration.md)

## Repo Map

- `script.js`
  - browser-side handoff engine and MCP-backed app logic
- `stage2-overrides.js`
  - stage 2 rendering and summary behavior overrides
- `stage2-period-overrides.js`
  - selected-range summary behavior
- `src/server/handlers/`
  - patient data handler modules
- `src/`
  - harness, MCP runtime, and synthetic test fixtures
- `tests/`
  - regression, smoke, and batch validation
- `docs/`
  - product, architecture, and release context

## Validation Commands

- `npm test`
  - full test suite
- `npm run test:mcp`
  - MCP patient smoke test
- `npm run test:mcp:gateway`
  - gateway cache and fallback regression
- `npm run test:stage2`
  - stage 2 summary regression
- `npm run test:fhir:smoke`
  - synthetic FHIR smoke test
- `npm run test:fhir:batch`
  - synthetic FHIR batch validation
- `npm run test:render`
  - render smoke test

## Release Notes for Reviewers

This repository is intended to be understandable to:

- developers reviewing architecture and testability
- clinicians reviewing handoff relevance and explainability
- healthcare AI reviewers reviewing safety boundaries and scope

Key release boundaries:

- no clinical deployment claim
- no patient-care recommendation claim
- no real patient data
- no guarantee of medical completeness

## Feedback

Please use GitHub Issues or Discussions for:

- summary quality feedback
- safety and public-release concerns
- documentation clarity
- architecture suggestions
- synthetic data or labeling concerns

Before sharing screenshots or logs, confirm they contain synthetic data only.

Detailed guidance:

- [FEEDBACK.md](FEEDBACK.md)
- [docs/README.md](docs/README.md)
