const assert = require('assert');
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
      throw new Error('fetch should not be called during EMR render smoke test');
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

async function main() {
  const { handler } = require(path.join(ROOT, 'netlify', 'functions', 'patients.js'));
  const listPayload = JSON.parse((await handler({ queryStringParameters: { count: '1' } })).body);
  const sample = listPayload.patients[0];
  const detail = JSON.parse((await handler({ queryStringParameters: { id: sample.id } })).body);

  if (detail.error) {
    throw new Error(detail.detail || detail.error);
  }

  const api = loadEngineApi();
  const dates = Object.keys(detail.dailyData || {}).sort();
  assert(dates.length > 0, 'dailyData dates missing');

  const startData = detail.dailyData[dates[0]];
  const endData = detail.dailyData[dates[dates.length - 1]];
  const html = api.generateNarrativeSBAR(detail, startData, endData, dates);

  assert(/class="longitudinal-panel"/.test(html));
  assert(/선택 분석기간/.test(html));
  assert(/전체 재원기간/.test(html));
  assert(!/\((disorder|finding|situation|procedure)\)/i.test(html));
  assert(/S - Situation/.test(html));
  assert(/B - Background/.test(html));
  assert(/A - Assessment/.test(html));
  assert(/R - Recommendation/.test(html));

  console.log('EMR render smoke test passed.');
  console.log(`Patient: ${detail.name} (${detail.id})`);
}

main().catch((error) => {
  console.error(`EMR render smoke test failed: ${error.message}`);
  process.exit(1);
});
