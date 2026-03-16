const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function createEngineSandbox() {
  const noop = () => {};
  const elementStub = {
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    setAttribute: noop,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {},
    dataset: {},
    innerHTML: '',
    textContent: '',
    value: '',
    getContext: () => ({})
  };

  const documentStub = {
    body: { dataset: { appMode: 'engine-demo' } },
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => elementStub,
    createElement: () => ({ ...elementStub })
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Intl,
    Date,
    Math,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    fetch: async () => {
      throw new Error('fetch should not be called during stage 1/2 smoke test');
    },
    alert: noop,
    patients: [],
    document: documentStub,
    window: {
      handoffAppApi: {},
      document: documentStub,
      addEventListener: noop,
      removeEventListener: noop
    },
    globalThis: null
  };

  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  return sandbox;
}

async function fetchSamplePatient(patientId) {
  const { handler } = require(path.join(ROOT, 'netlify', 'functions', 'patients.js'));

  const listResponse = await handler({ queryStringParameters: {} });
  const listPayload = JSON.parse(listResponse.body);
  if (!listPayload.patients || !listPayload.patients.length) {
    throw new Error('FHIR patient list is empty');
  }

  const sample = patientId
    ? listPayload.patients.find((patient) => String(patient.id) === String(patientId))
    : listPayload.patients[0];

  if (!sample) {
    throw new Error(`Requested patient id not found: ${patientId}`);
  }

  const detailResponse = await handler({ queryStringParameters: { id: sample.id } });
  const detail = JSON.parse(detailResponse.body);
  if (detail.error) {
    throw new Error(detail.detail || detail.error);
  }

  return detail;
}

function loadEngineApi() {
  const scriptContent = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const overrideContent = fs.readFileSync(path.join(ROOT, 'stage2-overrides.js'), 'utf8');
  const sandbox = createEngineSandbox();
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox, { filename: 'script.js' });
  vm.runInContext(overrideContent, sandbox, { filename: 'stage2-overrides.js' });
  return sandbox.window.handoffAppApi;
}

async function main() {
  const requestedId = process.argv[2];
  const detail = await fetchSamplePatient(requestedId);
  const api = loadEngineApi();

  const dates = Object.keys(detail.dailyData || {}).sort();
  if (!dates.length) {
    throw new Error('No dailyData dates were generated for the sample patient');
  }

  const normalizedTimeline = api.buildNormalizedDailyTimeline(detail, dates);
  const longitudinalSummary = api.buildLongitudinalPatientSummary(detail, normalizedTimeline);

  if (normalizedTimeline.length !== dates.length) {
    throw new Error(`Normalized timeline mismatch: expected ${dates.length}, got ${normalizedTimeline.length}`);
  }

  if (!longitudinalSummary || !longitudinalSummary.conciseSummary) {
    throw new Error('Longitudinal summary did not produce a concise summary');
  }

  const latest = normalizedTimeline[normalizedTimeline.length - 1];

  console.log('FHIR stage 1/2 smoke test passed.');
  console.log(`Patient: ${detail.name} (${detail.id})`);
  console.log(`Diagnosis: ${detail.diagnosis}`);
  console.log(`Dates: ${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length} days)`);
  console.log(`Latest snapshot date: ${latest.date}`);
  console.log(`Concise summary: ${longitudinalSummary.conciseSummary}`);
}

main().catch((error) => {
  console.error(`FHIR stage 1/2 smoke test failed: ${error.message}`);
  process.exit(1);
});
