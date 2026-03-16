const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_COUNT = 10;

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
      throw new Error('fetch should not be called during batch stage 1/2 test');
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

function loadEngineApi() {
  const scriptContent = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const overrideContent = fs.readFileSync(path.join(ROOT, 'stage2-overrides.js'), 'utf8');
  const periodOverrideContent = fs.readFileSync(path.join(ROOT, 'stage2-period-overrides.js'), 'utf8');
  const sandbox = createEngineSandbox();
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox, { filename: 'script.js' });
  vm.runInContext(overrideContent, sandbox, { filename: 'stage2-overrides.js' });
  vm.runInContext(periodOverrideContent, sandbox, { filename: 'stage2-period-overrides.js' });
  return sandbox.window.handoffAppApi;
}

async function fetchPatientList(count) {
  const { handler } = require(path.join(ROOT, 'netlify', 'functions', 'patients.js'));
  const listResponse = await handler({ queryStringParameters: { count: String(count) } });
  const listPayload = JSON.parse(listResponse.body);
  if (!listPayload.patients || !listPayload.patients.length) {
    throw new Error('FHIR patient list is empty');
  }
  return { handler, patients: listPayload.patients };
}

function detectSummaryWarnings(result) {
  const warnings = [];
  const activity = String(result.latestActivity || '');
  const careFrame = result.careFrame.join(' | ');
  const carryover = result.carryover.join(' | ');
  const persistent = result.persistent.join(' | ');

  if (/counsel|education|nutrition|smoking|addiction|consult/i.test(activity)) {
    warnings.push(`activity-noise:${activity}`);
  }
  if (/\bct\b|\bmri\b|x-ray|ultrasound|contrast|stent|consult/i.test(careFrame)) {
    warnings.push(`care-frame-noise:${careFrame}`);
  }
  if (/경과 관찰/.test(carryover) || /\bct\b|\bmri\b|x-ray|ultrasound|서비스 요청|검사 요청/i.test(carryover)) {
    warnings.push(`carryover-noise:${carryover}`);
  }
  if (/요청사항|서비스 요청/.test(persistent)) {
    warnings.push(`persistent-noise:${persistent}`);
  }
  if (/therapy|counsel|education|teaching/i.test(persistent)) {
    warnings.push(`persistent-intervention-noise:${persistent}`);
  }
  if (/FHIR 진단 정보 없음|간호문제 정보 없음|정보 없음/i.test(persistent)) {
    warnings.push(`persistent-placeholder-noise:${persistent}`);
  }

  return warnings;
}

async function main() {
  const count = Math.max(1, parseInt(process.argv[2] || String(DEFAULT_COUNT), 10) || DEFAULT_COUNT);
  const api = loadEngineApi();
  const { handler, patients } = await fetchPatientList(count);
  const samplePatients = patients.slice(0, count);
  const results = [];

  for (const patient of samplePatients) {
    const detailResponse = await handler({ queryStringParameters: { id: patient.id } });
    const detail = JSON.parse(detailResponse.body);
    if (detail.error) {
      throw new Error(`${patient.id}: ${detail.detail || detail.error}`);
    }

    const dates = Object.keys(detail.dailyData || {}).sort();
    if (!dates.length) {
      throw new Error(`${patient.id}: dailyData dates missing`);
    }

    const normalizedTimeline = api.buildNormalizedDailyTimeline(detail, dates);
    const longitudinalSummary = api.buildLongitudinalPatientSummary(detail, normalizedTimeline);
    const latest = normalizedTimeline[normalizedTimeline.length - 1];

    const result = {
      id: detail.id,
      name: detail.name,
      diagnosis: detail.diagnosis,
      dateCount: dates.length,
      latestActivity: latest.clinicalStatus?.activity || '-',
      careFrame: longitudinalSummary.overview?.careFrame || [],
      persistent: longitudinalSummary.overview?.persistentConcerns || [],
      carryover: longitudinalSummary.overview?.carryoverItems || [],
      conciseSummary: longitudinalSummary.conciseSummary || ''
    };
    result.warnings = detectSummaryWarnings(result);
    results.push(result);
  }

  const warningCount = results.reduce((sum, item) => sum + item.warnings.length, 0);

  console.log(`FHIR stage 1/2 batch test processed ${results.length} patients.`);
  console.log(`Warnings detected: ${warningCount}`);
  results.forEach((item, index) => {
    console.log(`\n[${index + 1}] ${item.name} (${item.id})`);
    console.log(`Diagnosis: ${item.diagnosis}`);
    console.log(`Activity: ${item.latestActivity}`);
    console.log(`Care frame: ${item.careFrame.join(' / ') || '-'}`);
    console.log(`Persistent concerns: ${item.persistent.join(' / ') || '-'}`);
    console.log(`Carryover: ${item.carryover.join(' / ') || '-'}`);
    console.log(`Warnings: ${item.warnings.join(' | ') || 'none'}`);
  });
}

main().catch((error) => {
  console.error(`FHIR stage 1/2 batch test failed: ${error.message}`);
  process.exit(1);
});
