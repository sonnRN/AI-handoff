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

### Use `docs/README.md` as the documentation entrypoint

The repository now has enough docs that agents need a lightweight router. The docs hub separates canonical product and architecture docs from supplemental harness docs and historical references.

### Keep CI limited to `npm test`

The current source-of-truth validation surface is the harness test suite. CI should run `npm test` and nothing more until separate lint or build commands are intentionally introduced.

### Defer lint and formatter rollout

Lint and formatter tooling are useful, but the repository does not yet have a stable command surface for them. This pass keeps the harness honest by documenting that absence instead of inventing new tooling.

### Prepare the repository for synthetic-only public release

The public repository should not expose realistic patient-like identities or ambiguous demo data. Local demo patients were relabeled as clearly synthetic, and public synthetic FHIR identities are converted to synthetic aliases before display.
