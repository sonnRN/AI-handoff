# Public Release Readiness

## Current Status

Prepared for public demo release with synthetic-only boundaries.

## Release Checks

- Synthetic local demo patients only
- Public synthetic FHIR sandbox only
- Allowlisted public synthetic FHIR base URL only
- Synthetic relabeling for external patient-like identities
- No known secrets or private endpoints in tracked files
- Demo and research disclaimer added
- Privacy notice added
- Feedback guidance added
- Public UI notice added
- Direct MCP stdio smoke test completed

## Remaining Boundaries

- This repository is not for clinical use.
- Reviewers should treat all outputs as demo outputs.
- Any ambiguous data should be treated as unsafe and excluded.

## Recommended Ongoing Checks Before Publishing Updates

1. Run `npm test` or `node scripts/run-node-tests.js`
2. Search for realistic names or identifiers before pushing
3. Confirm no screenshots or logs contain unsafe data
4. Confirm external integrations still point only to public synthetic sources
