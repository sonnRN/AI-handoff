# Harness Engineering Checklist

This checklist tracks the work needed to make the project reliable for AI-assisted changes, regression testing, and repeatable validation.

- [x] Normalize editor defaults with UTF-8 and consistent line-ending rules.
- [x] Document the handoff engine contract, expected inputs, outputs, and validation targets.
- [x] Document guardrails for AI-driven edits so engine changes and UI changes stay scoped.
- [x] Extract a reusable VM sandbox for loading the browser-side handoff engine in Node-based tests.
- [x] Extract reusable patient-fetch helpers for smoke tests and batch validation.
- [x] Add a local patient-data fallback so harness tests do not depend on remote FHIR availability.
- [x] Move golden regression patients and expectations into shared fixtures.
- [x] Replace duplicated test harness code with shared engine runtime helpers.
- [x] Add a single `npm test` entrypoint for the full regression suite.
- [x] Validate Stage 2 regression, FHIR smoke, FHIR batch, and render smoke in one pass.
- [x] Prepare the repo for commit and remote push after verification.
