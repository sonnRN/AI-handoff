# Architecture

## Public Release Scope

This repository is a demo and research prototype. The architecture is organized to keep:

- synthetic data sources separate from handoff logic
- data access separate from algorithm logic
- public-review safety boundaries visible

The core release claim is architectural, not clinical deployment readiness.

## Overview

The repository has two main runtime layers:

- browser runtime
  - `script.js`
  - `handoff-engine.js`
  - `stage2-overrides.js`
  - `stage2-period-overrides.js`
- remote server runtime
  - `src/server/httpServer.js`
  - `src/server/handlers/`
- harness runtime
  - `src/harness/runtime/`
- MCP/FHIR data runtime
  - `src/mcp/runtime/`
  - `src/mcp/client/`
  - `src/mcp/server/`

The harness runtime loads browser-side logic inside a VM sandbox so Node-based tests can validate summary behavior without a DOM or live UI.

## Main Components

- `src/harness/runtime/createEngineSandbox.js`
  - minimal DOM-like environment for VM execution
- `src/harness/runtime/loadHandoffEngineApi.js`
  - loads browser engine files and returns `handoffAppApi`
- `src/harness/runtime/fetchFhirPatients.js`
  - fetches patient summaries/details through the server handler modules
- `src/harness/runtime/loadLocalDemoPatients.js`
  - synthetic fixture loader for harness-only regression tests
- `src/mcp/runtime/patientDataGateway.js`
  - stabilizes remote FHIR fetches with cache and fallback
- `src/mcp/server/fhirMcpServer.js`
  - exposes patient list/detail tools over a local MCP transport
- `src/mcp/client/fhirMcpClient.js`
  - connects Node-side callers to the MCP server
- `tests/fixtures/`
  - golden synthetic patients and expectations

## Data Flow

1. A test or script loads the harness API.
2. The harness reads browser engine files into a VM sandbox.
3. Patient input comes from MCP-backed synthetic FHIR intake or harness-only synthetic fixtures.
4. The engine builds normalized timelines, longitudinal summaries, handoff analysis, and narrative SBAR HTML.
5. Tests assert on the resulting structured output or rendered HTML.

## MCP Data Flow

1. Browser or Node tooling calls `patients-mcp`.
2. `patients-mcp` tries the local MCP client first.
3. The MCP server calls `patientDataGateway`.
4. The gateway reads public synthetic FHIR data or file cache.
5. The resulting patient payload flows into the existing handoff engine unchanged.

## GitHub Pages + Remote Server Flow

1. GitHub Pages serves the static frontend.
2. The frontend reads `runtime-config.js`.
3. If `apiBase` is configured, the browser calls the remote Vercel server.
4. The remote server exposes `/api/patients-mcp` and `/api/patients`.
5. If no remote server is configured, the browser can still use same-origin `/api/patients-mcp` on Vercel.
6. If neither route exists, the UI keeps the MCP connection failure visible instead of loading a committed patient bundle.

## Structural Boundary

- Browser logic remains in root app files for the live UI.
- `handoff-engine.js` is the canonical engine contract that UI and harness should share.
- Reusable validation and automation helpers live under `src/`.
- Live app runtime should depend on `patients-mcp` rather than local patient files.
- Tests should depend on `src/harness/` instead of hand-rolled VM setup.
