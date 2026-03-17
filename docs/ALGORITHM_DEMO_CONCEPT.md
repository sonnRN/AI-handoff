# Explainable AI Nursing Handoff Engine

## 1. Recommended product name

Primary name:

`Explainable AI Nursing Handoff Engine`

Korean label:

`?ㅻ챸 媛?ν븳 AI 媛꾪샇 ?멸퀎 ?붿쭊`

Recommended subtitle:

`A clinically grounded prototype that detects change, prioritizes handoff issues, and produces structured next-shift handoff output.`

## 2. Why this positioning is better than an "EMR-looking demo"

This project should not mainly look like a hospital EMR screen clone.
It should look like a transparent algorithm prototype.

That is strategically better because it communicates:

- the core value is the handoff logic itself
- the same logic can later connect to different hospital data sources
- the prototype is clinically interpretable and reviewable
- the product supports nurses rather than pretending to replace EMR workflows

The message should be:

`This is not an EMR mockup. This is a source-agnostic nursing handoff intelligence engine that can later be mapped to FHIR or real hospital EMR data.`

## 3. One-line positioning statements

### Short version

`An explainable engine that turns clinical change into prioritized nursing handoff output.`

### Hospital-facing version

`A clinically grounded and explainable nursing handoff prioritization engine designed to operate on normalized clinical data today and to remain portable across future hospital EMR environments.`

### Product demo version

`See how patient change becomes handoff priority, action items, and continuity-of-care output in one transparent pipeline.`

## 4. What the prototype is and is not

### It is

- a change-centered handoff engine
- an action-oriented continuity-of-care support tool
- a clinically explainable prioritization prototype
- a data-source-portable algorithm architecture

### It is not

- a diagnosis engine
- a treatment recommendation engine
- an autonomous decision maker
- a fake EMR UI intended to simulate real charting workflows

## 5. Target audience

Primary audience:

- nurse leaders
- nursing informatics teams
- clinical quality / patient safety stakeholders
- hospital digital transformation stakeholders
- professors / tertiary hospital reviewers

Secondary audience:

- engineers evaluating hospital integration feasibility
- EMR / FHIR mapping collaborators

## 6. Core narrative for a hospital discussion

The prototype should make the following claim believable:

`Even if the source data changes from demo FHIR data to real hospital EMR data, the core nursing handoff algorithm can remain stable, clinically meaningful, explainable, and operationally useful.`

To support that claim, the prototype must visibly show:

1. normalized input
2. change detection
3. prioritization logic
4. structured handoff output
5. explanation and evidence

## 7. Product structure for a standalone algorithm demo

The standalone demo should be organized around the algorithm pipeline, not around hospital chart tabs.

Recommended top-level flow:

`Source Data -> Normalized Snapshot -> Change Detection -> Prioritization -> Handoff Output`

Recommended screen sections:

### A. Case selector

- choose sample patient / scenario
- choose date or shift range
- choose policy profile if needed later

### B. Normalized input view

- show what the algorithm actually receives
- do not show raw FHIR bundle first
- show structured patient snapshot by day/shift

### C. Change detection view

- detected events by category
- status change
- new order
- discontinued order
- vital sign change
- result/lab change
- nursing execution state change

### D. Prioritization view

- tier 0 / tier 1 / tier 2 / tier 3
- why promoted
- which rule fired
- action relevance
- carryover relevance

### E. Handoff output view

- top prioritized events
- action-needed items
- carryover items
- grouped background
- optional SBAR mapping hints

### F. Explainability panel

- evidence references
- detection reason
- priority reason
- policy trigger
- uncertainty / missing-data notes

## 8. "One-glance" visual concept

The page should feel like an engine dashboard.

Recommended visual hierarchy:

1. top banner:
   `Explainable AI Nursing Handoff Engine`

2. pipeline ribbon:
   `Input -> Detect -> Prioritize -> Output`

3. main body in 3 columns:

- left:
  `Normalized Patient Snapshot`

- center:
  `Detected Changes` and `Priority Tiers`

- right:
  `Next-Shift Handoff Output`

4. bottom or side drawer:
  `Why this was ranked here`

This gives a reviewer immediate intuition:

`I can see the input, I can see what changed, I can see how it was ranked, and I can see what the nurse would receive.`

## 9. Demo modes to consider

### Mode 1. Executive / pitch mode

- simplified case
- very clear pipeline
- only top handoff issues and reasons

### Mode 2. Clinical review mode

- more detail
- full evidence and rule trace
- grouped lower-priority context

### Mode 3. Developer / integration mode

- normalized JSON
- event objects
- priority metadata
- policy configuration visibility

## 10. Recommended terminology inside the app

Prefer these labels:

- `Normalized Snapshot`
- `Detected Handoff Events`
- `Priority Tier`
- `Action Needed`
- `Carryover Responsibility`
- `Evidence`
- `Why Ranked Here`
- `Policy Trigger`

Avoid overusing:

- `AI Summary`
- `Smart Recommendation`
- `Clinical Decision`

Those labels can make the system sound less safe and less explainable.

## 11. Relationship to current codebase

The current repository can evolve into this standalone demo without changing the core algorithm goal.

Current mapping:

- FHIR adapter and daily data creation:
  [patientsApi.js](../src/server/handlers/patientsApi.js)

- current UI and handoff rendering:
  [script.js](../script.js)

The future standalone algorithm demo should keep:

- data normalization
- change detection
- prioritization
- structured handoff output

But visually pivot away from:

- EMR-like patient detail emphasis
- tab-heavy chart imitation
- text-first SBAR-only presentation

## 12. Recommended v1 standalone deliverable

The v1 standalone program should prove these 4 things clearly:

1. the engine detects clinically meaningful change
2. the engine prioritizes with explainable rules
3. the engine produces next-shift-relevant output
4. the engine is portable beyond FHIR

That is the most credible first milestone for hospital presentation.
