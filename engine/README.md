# Engine Harness

This directory exposes reusable helpers for loading the browser-side handoff engine from Node-based tests and scripts.

## Included Helpers

- `runtime/createEngineSandbox.js`
  - Creates a minimal DOM-like sandbox for engine execution in Node.
- `runtime/loadHandoffEngineApi.js`
  - Loads `script.js`, `stage2-overrides.js`, and `stage2-period-overrides.js`, then returns `handoffAppApi`.
- `runtime/fetchFhirPatients.js`
  - Fetches patient data through the Netlify function and automatically falls back to local demo patients when remote FHIR access is unavailable.
- `runtime/loadLocalDemoPatients.js`
  - Loads `patients.js` into a VM context so tests can stay offline-capable.

## Example

```js
const { loadHandoffEngineApi, fetchSamplePatient } = require("../engine");

async function main() {
  const patient = await fetchSamplePatient();
  const { api } = loadHandoffEngineApi();
  const dates = Object.keys(patient.dailyData).sort();
  const analysis = api.buildHandoffAnalysis(patient, dates);
  console.log(analysis.longitudinalSummary.conciseSummary);
}
```
