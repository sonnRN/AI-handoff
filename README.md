# Nursing Handoff Simulation MVP

Serious web-based nursing education simulator for inpatient handoff practice.

This version turns the original EMR/handoff demo repository into a single-scenario simulation loop:

1. Landing / intro
2. Scenario briefing
3. EMR review
4. Handoff recording
5. Transcript confirmation
6. AI receiver follow-up
7. Structured feedback
8. Retry / reset

## Safety Status

- Educational simulation only
- Synthetic patient data only
- Not for clinical use
- No diagnostic or treatment recommendations
- Do not upload or test with real patient data or PHI

## What Changed

- Replaced the multi-patient dashboard experience with one rich telemetry handoff scenario.
- Preserved the repo's Node server shape and canonical `handoff-engine.js`.
- Added a realistic multi-day synthetic adult inpatient chart with:
  - changing vitals
  - changing lab trends
  - medication changes
  - nursing safety concerns
  - unresolved issues
  - concrete pending tasks
- Added a voice-first handoff workflow with:
  - microphone capture
  - server transcription when OpenAI is configured
  - browser/manual fallback when it is not
- Added focused AI receiver follow-up and structured feedback endpoints with deterministic fallback logic.
- Added QA helpers plus Playwright-friendly automation hooks:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

Then open:

- [http://127.0.0.1:8787](http://127.0.0.1:8787)

The local server now serves both:

- the browser app (`/`)
- the existing patient APIs (`/api/patients`, `/api/patients-mcp`)
- the new simulation API (`/api/simulation`)

### 3. Optional: enable OpenAI transcription and AI feedback

Set these environment variables before starting the server:

```bash
set OPENAI_API_KEY=your_key_here
set OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
set OPENAI_SIM_MODEL=gpt-4o-mini
npm start
```

When `OPENAI_API_KEY` is not set:

- transcription falls back to browser speech recognition when available
- otherwise the learner can review and edit text manually
- follow-up questions and scoring use the built-in deterministic evaluator

## MVP Scenario

The included case is a synthetic telemetry patient on hospital day 5:

- admitted for acute decompensated heart failure, right lower lobe pneumonia, and new atrial fibrillation
- now improved from admission but still unsafe for discharge
- still on oxygen with exertional desaturation
- has worsening creatinine during diuresis
- has persistent low potassium and magnesium after replacement
- had a near-fall overnight
- has sacral skin risk
- has multiple pending tests and consults that matter to the next shift

The learner must synthesize the multi-day evolution instead of reading a single snapshot.

## Validation

### Fast local checks

```bash
node tests/http-server-smoke.js
node tests/simulation-api-smoke.js
node tests/mcp-runtime-wiring-smoke.js
node tests/vercel-adapter-smoke.js
```

### Full legacy suite

```bash
npm test
```

Note: the full legacy suite is still much broader than the new MVP and can take a long time because it exercises historical MCP/FHIR paths.

### QA mode

Append `?qa=1` to expose local-only helpers:

- `Run Demo Session`
- `Open Briefing`
- `Open EMR`
- `Open Recorder`

These are intended for deterministic browser validation, not for end users.

## Architecture Notes

### Preserved

- `handoff-engine.js`
- Node HTTP server and Vercel deployment pattern
- legacy MCP/patient endpoints
- algorithm demo page

### New / Updated

- `index.html`
  - state-based simulation shell
- `style.css`
  - modern clinical voice-product UI
- `script.js`
  - client state machine, EMR rendering, recorder flow, QA helpers
- `src/simulation/scenario.js`
  - single rich synthetic inpatient scenario
- `src/simulation/evaluator.js`
  - deterministic follow-up + scoring engine
- `src/server/handlers/simulationApi.js`
  - simulation API
- `src/server/services/openaiSimulationService.js`
  - OpenAI transcription / structured response integration
- `api/simulation.js`
  - Vercel-compatible route

## Known Limitations

- The production-quality transcription path requires `OPENAI_API_KEY`.
- Without OpenAI, browser speech recognition quality depends on the browser and OS.
- The AI receiver currently uses text Q&A, not synthesized speech playback.
- The deterministic feedback engine is scenario-specific by design for this MVP.
- The repo still contains large legacy research/demo codepaths and tests that are not part of the new learner-facing flow.

## Legacy Assets

The original algorithm-focused page remains available at:

- `algorithm-demo.html`

That page is preserved for reference and does not represent the main learner experience anymore.
