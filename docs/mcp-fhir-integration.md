# MCP FHIR Integration

## Goal

This layer exists to make patient data intake stable before the handoff algorithm runs.

It adds:

- an MCP server
- an MCP client
- a cache-aware patient gateway
- a public-safe synthetic data policy
- a direct gateway path when MCP process startup is blocked

## Public-Safe Data Boundary

Only these data classes are allowed:

- an allowlisted public synthetic FHIR sandbox
- harness-only synthetic fixtures for regression tests

The gateway rejects unknown payload sources, and the FHIR adapter rejects non-allowlisted base URLs.

## Runtime Shape

1. The browser app prefers `patients-mcp`.
2. `patients-mcp` tries the local MCP server first.
3. The MCP server calls `patientDataGateway`.
4. The gateway reads:
   - public synthetic FHIR data
   - local cache
5. Patient-facing identities from external synthetic FHIR data are relabeled as synthetic before display.
6. When the app is served from GitHub Pages, the browser reads `runtime-config.js` and can call a separately deployed Vercel server.
7. Browser runtime does not fall back to a committed patient bundle. If no reachable API exists, the UI reports the MCP connection failure.

## Main Files

- `patients.js`
  - direct synthetic FHIR adapter
- `patients-mcp.js`
  - MCP-backed app-facing proxy
- `handoff-engine.js`
  - canonical client-side engine contract used after patient intake
- `patientDataGateway.js`
  - cache, explicit fallback injection, and source-safety enforcement
- `publicDataPolicy.js`
  - allowlist and public-safe data policy
- `fhirMcpServer.js`
  - local stdio MCP server
- `fhirMcpClient.js`
  - local MCP client

## Stability Rules

- list and detail requests are cached separately
- detail requests can fall back independently from list requests
- unknown or unsafe payload sources are rejected
- when MCP server startup is blocked, the app uses the same gateway directly
- external patient-like identities are converted to synthetic labels
- proxy responses report whether data came through `server`, `direct-fallback`, or `ci-fallback` mode
- proxy responses expose build/version/runtime metadata for deployment inspection

## Validation

- `npm run test:mcp`
  - app-facing MCP proxy smoke test
- `npm run test:mcp:gateway`
  - gateway cache and fallback regression
- `npm run test:mcp:stdio`
  - direct MCP stdio test

## Current Scope

This layer is intentionally limited to:

- patient list intake
- patient detail intake
- page cursor support
- cache and fallback behavior
- public-safe source enforcement

It does not yet include:

- hospital authentication
- production deployment controls
- private EMR connectivity
