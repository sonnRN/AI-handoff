# Current Plan

## Completed

- standardized harness docs and repository entrypoints
- extracted shared VM runtime helpers
- extracted shared patient-fetch helpers
- added offline fallback for remote FHIR failures
- moved golden patient fixtures into shared test data
- unified validation under `npm test`

## Active Maintenance

- clarify canonical docs versus supplemental and historical docs through a docs hub
- make validation entrypoints more obvious from `AGENTS.md` and `README.md`
- keep repository truth centered on `npm test` until separate lint or build tooling is intentionally added

## Next Improvements

- migrate more handoff rule notes into explicit fixture coverage
- add decision records when summary heuristics change
- consider moving additional reusable app-side utilities into `src/`
- expand render assertions for more UI states and selected-range behavior

## Pending Review Placeholder

- update this file after each harness audit with any newly accepted follow-up items

## Validation Gate

- run `npm test` before marking handoff-engine work complete
