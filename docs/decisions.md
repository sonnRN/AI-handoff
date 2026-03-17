# Decisions

## 2026-03-17

### Use a VM harness for browser-side logic

The summary engine still lives in browser files, so tests load it through a shared VM sandbox instead of duplicating setup in each test.

### Keep an offline-capable fallback for patient data

FHIR smoke and batch validation should still run when remote access is unavailable, so the harness falls back to local demo patients from `patients.js`.

### Store regression inputs as shared fixtures

Golden patients and expectations live in `tests/fixtures/` to make behavior easier to extend and review.

### Standardize repo guidance around docs plus src plus tests

Repository-level guidance now points future work toward `README.md`, `docs/`, `src/`, and `tests/` as the primary harness surfaces.
