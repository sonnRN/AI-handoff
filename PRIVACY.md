# Privacy Notice

## Public Repository Boundary

This is a public demo repository. No real patient data, PHI, or confidential hospital data should be added here.

## Allowed Data

- synthetic local demo patients
- public synthetic FHIR sandbox data
- synthetic regression fixtures

## Prohibited Data

Do not commit or share:

- real patient names
- dates of birth tied to real people
- medical record numbers from real systems
- hospital-specific private endpoints
- screenshots from live EMRs
- clinician notes copied from production systems
- internal credentials, tokens, or keys

## External Data Handling

The repository can connect to a public synthetic FHIR sandbox for demo purposes.

To reduce confusion and public-release risk:

- externally retrieved patient-like identities are relabeled as synthetic before display
- the project should not depend on private or production healthcare endpoints

## Local Cache

The MCP-backed patient gateway may create local cache files under `.cache/`.

- cache files are not intended for commit
- cache contents must remain synthetic-only
- if there is any doubt about data provenance, delete the cache before sharing or publishing

## Reporting a Privacy Concern

If you think a file, screenshot, fixture, or output may contain unsafe data:

1. Treat it as unsafe.
2. Stop sharing it.
3. Open a repository issue or contact the maintainer with the concern.
