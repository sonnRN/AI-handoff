# Architecture

## Overview

The repository has two main runtime layers:

- browser runtime
  - `script.js`
  - `stage2-overrides.js`
  - `stage2-period-overrides.js`
- harness runtime
  - `src/harness/runtime/`

The harness runtime loads browser-side logic inside a VM sandbox so Node-based tests can validate summary behavior without a DOM or live UI.

## Main Components

- `src/harness/runtime/createEngineSandbox.js`
  - minimal DOM-like environment for VM execution
- `src/harness/runtime/loadHandoffEngineApi.js`
  - loads browser engine files and returns `handoffAppApi`
- `src/harness/runtime/fetchFhirPatients.js`
  - fetches patient summaries/details through the Netlify function
- `src/harness/runtime/loadLocalDemoPatients.js`
  - offline fallback loader for `patients.js`
- `tests/fixtures/`
  - golden synthetic patients and expectations

## Data Flow

1. A test or script loads the harness API.
2. The harness reads browser engine files into a VM sandbox.
3. Patient input comes from local fixtures, local demo patients, or the Netlify FHIR function.
4. The engine builds normalized timelines, longitudinal summaries, handoff analysis, and narrative SBAR HTML.
5. Tests assert on the resulting structured output or rendered HTML.

## Structural Boundary

- Browser logic remains in root app files for the live UI.
- Reusable validation and automation helpers live under `src/`.
- Tests should depend on `src/harness/` instead of hand-rolled VM setup.
