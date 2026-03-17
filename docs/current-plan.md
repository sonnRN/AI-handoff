# Current Plan

## Completed

- standardized harness docs and repository entrypoints
- extracted shared VM runtime helpers
- extracted shared patient-fetch helpers
- added offline fallback for remote FHIR failures
- moved golden patient fixtures into shared test data
- unified validation under `npm test`

## Next Improvements

- migrate more handoff rule notes into explicit fixture coverage
- add decision records when summary heuristics change
- consider moving additional reusable app-side utilities into `src/`
- expand render assertions for more UI states and selected-range behavior

## Validation Gate

- run `npm test` before marking handoff-engine work complete
