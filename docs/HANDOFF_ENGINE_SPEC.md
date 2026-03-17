# Handoff Engine Spec

## Goal

The handoff engine converts daily patient snapshots into:

- normalized longitudinal timeline data
- prioritized handoff analysis
- narrative SBAR output

## Required Inputs

- patient identity fields such as `id`, `name`, `diagnosis`, `admissionNote`, `pastHistory`
- per-day records in `dailyData[date]`
- each day should include as much of the following as possible:
  - `vital`
  - `labs`
  - `handoffMeta`
  - `orders`
  - `nursingTasks`
  - `specials`
  - `hourly`

## Processing Stages

1. Convert raw patient data into normalized daily snapshots.
2. Detect carryover items and persistent concerns across dates.
3. Build a longitudinal summary with these sections:
   - `identity`
   - `careFrame`
   - `persistentConcerns`
   - `watchItems`
   - `carryoverItems`
4. Build prioritized handoff analysis data.
5. Render narrative SBAR HTML.

## Expected Outputs

### Longitudinal Summary

- `conciseSummary`
- `sections.identity`
- `sections.careFrame`
- `sections.persistentConcerns`
- `sections.watchItems`
- `sections.carryoverItems`

### Handoff Analysis

- `timelineEvents`
- `prioritizedHandoffItems`
- `sbarPayload`
- `longitudinalSummary`

### Narrative SBAR

- `S - Situation`
- `B - Background`
- `A - Assessment`
- `R - Recommendation`

## Quality Rules

- Do not emit unsupported claims.
- Do not leak raw FHIR suffixes like `(disorder)` into final user-facing summaries.
- Do not let imaging names, generic requests, or physical-object noise dominate `careFrame`.
- Do not let background-only text crowd `carryoverItems`.

## Test Coverage

- Stage 2 summary regression uses shared golden patients and expectations.
- FHIR smoke and batch tests exercise the shared patient fetch helpers.
- Render smoke verifies that narrative SBAR includes the longitudinal panel and SBAR sections.
