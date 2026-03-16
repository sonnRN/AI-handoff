# Hospital Pitch Messaging

## 1. Recommended title options

Primary recommendation:

`Explainable AI Nursing Handoff Engine`

Alternative title options:

- `Clinical Handoff Prioritization Engine`
- `AI Nursing Change-to-Handoff Engine`
- `Explainable Nursing Handoff Intelligence Prototype`
- `Normalized Clinical Data to Handoff Engine`

## 2. Best single-sentence pitch

`This prototype shows how normalized clinical data can be transformed into explainable, prioritized nursing handoff output without depending on one specific EMR data structure.`

## 3. 30-second version

`This is an explainable AI nursing handoff engine. Rather than simply listing chart data, it detects clinically meaningful changes, identifies next-shift action items and carryover responsibilities, prioritizes what matters most, and produces structured handoff output. The current demo uses FHIR, but the core logic is designed to remain stable even when mapped later to real hospital EMR data.`

## 4. 60-second version

`Our goal is not to build a diagnosis engine or replace nursing judgment. This prototype focuses on a narrower and safer problem: supporting continuity of care during nursing handoff. It takes normalized patient data, detects meaningful changes such as status shifts, new or discontinued orders, vital deterioration, result changes, and nursing task state changes, then prioritizes them using explainable rules. The value of the prototype is that the handoff logic is separated from the source data. Today we can demonstrate it with FHIR data, and later the same engine can be connected to large-hospital EMR data through a mapping layer without redesigning the underlying handoff algorithm.`

## 5. What to emphasize in presentations

- explainability over black-box AI
- continuity of care over diagnosis support
- algorithm portability over FHIR dependency
- nursing workflow relevance over flashy interface
- action relevance over data abundance

## 6. What to avoid saying

Avoid messages that make the prototype sound unsafe or unrealistic.

Avoid:

- `The AI decides what to do`
- `The AI replaces handoff judgment`
- `This is basically an autonomous nurse assistant`
- `This is an EMR replacement`
- `This automatically interprets everything clinically`

Prefer:

- `supports`
- `prioritizes`
- `surfaces`
- `organizes`
- `explains`
- `helps continuity of care`

## 7. Suggested section headers for slides or demo narration

- `Why Nursing Handoff Needs Change-Centered Support`
- `From Raw Clinical Data to Prioritized Handoff`
- `Explainable Detection and Prioritization`
- `Portable Beyond FHIR`
- `Ready for Future EMR Mapping`

## 8. Suggested demo talk track

### Opening

`We are not demonstrating an EMR UI. We are demonstrating the core handoff engine.`

### Middle

`Here is the normalized patient snapshot. Here are the changes the engine detected. Here is how those changes were prioritized. Here is the handoff-ready output the next nurse would receive.`

### Closing

`Because the logic sits above the source data layer, the same engine can later be mapped from FHIR demo data to real hospital EMR data while preserving the handoff reasoning model.`

## 9. Suggested strategic claim

`The prototype is valuable not because it looks like a hospital screen, but because it proves that clinically grounded, explainable, source-agnostic nursing handoff intelligence can be implemented today.`

## 10. Recommended tagline candidates

- `See patient change become handoff priority`
- `From clinical change to explainable handoff`
- `Transparent nursing handoff intelligence`
- `Portable handoff logic for future hospital integration`
