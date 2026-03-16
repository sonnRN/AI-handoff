const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function createEngineApi() {
  const scriptContent = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
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
      throw new Error('fetch should not be called during stage 2 regression test');
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
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox, { filename: 'script.js' });
  return sandbox.window.handoffAppApi;
}

function buildSyntheticPatient() {
  return {
    id: 'summary-regression',
    name: '요약 테스트 환자',
    gender: 'F',
    age: '61',
    room: '101',
    diagnosis: 'Sepsis',
    admissionNote: '<b>입원정보</b>: 응급실 입원\n<b>진단</b>: Sepsis',
    pastHistory: ['HTN'],
    dailyData: {
      '2026-03-16': {
        nursingProblem: 'Sepsis',
        vital: { bp: '118/72', hr: 92, bt: 37.4, rr: 20, spo2: 97 },
        labs: {},
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Sepsis'],
            isolation: '-',
            activity: 'Bed rest',
            caution: [],
            lines: ['Peripheral IV', 'CT abdomen and pelvis with contrast', 'Coronary artery stent (physical object)'],
            tubes: [],
            drains: [],
            vent: ['Room air']
          },
          orders: {
            active: [],
            routine: [],
            prn: [],
            medications: { inj: [], po: [], running: [] }
          },
          vitals: {
            latest: { bp: '118/72', hr: 92, bt: 37.4, rr: 20, spo2: 97 },
            abnormalFlags: []
          },
          labs: {
            latest: {},
            abnormal: []
          },
          nursingActions: {
            completed: ['라인 상태 확인'],
            pending: ['Sepsis 경과 관찰', 'CT abdomen and pelvis with contrast', '혈당 재확인', '드레싱 상태 재평가'],
            followUp: ['Sepsis 경과 관찰', 'CT abdomen and pelvis with contrast', '혈당 재확인', '드레싱 상태 재평가']
          },
          sourceRefs: {}
        }
      }
    }
  };
}

function buildActivityNoisePatient() {
  return {
    id: 'activity-noise-regression',
    name: '활동 노이즈 테스트 환자',
    gender: 'M',
    age: '45',
    room: '102',
    diagnosis: 'Drug overdose',
    admissionNote: '<b>입원정보</b>: 응급실 입원\n<b>진단</b>: Drug overdose',
    pastHistory: [],
    dailyData: {
      '2026-03-16': {
        nursingProblem: '- 주요 문제: Drug overdose',
        vital: { bp: '124/76', hr: 88, bt: 36.9, rr: 18, spo2: 98 },
        labs: {},
        nursingTasks: [],
        plan: [],
        activity: 'Drug addiction counseling',
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Drug overdose'],
            isolation: '-',
            activity: 'Drug addiction counseling',
            caution: [],
            lines: [],
            tubes: [],
            drains: [],
            vent: []
          },
          orders: {
            active: [],
            routine: [],
            prn: [],
            medications: { inj: [], po: [], running: [] }
          },
          vitals: {
            latest: { bp: '124/76', hr: 88, bt: 36.9, rr: 18, spo2: 98 },
            abnormalFlags: []
          },
          labs: {
            latest: {},
            abnormal: []
          },
          nursingActions: {
            completed: [],
            pending: [],
            followUp: []
          },
          sourceRefs: {}
        }
      }
    }
  };
}

function buildPersistentInterventionNoisePatient() {
  return {
    id: 'persistent-intervention-noise',
    name: '지속문제 노이즈 테스트 환자',
    gender: 'F',
    age: '59',
    room: '103',
    diagnosis: 'Acute bronchitis (disorder)',
    admissionNote: '<b>입원정보</b>: 외래\n<b>진단</b>: Acute bronchitis (disorder)',
    pastHistory: [],
    dailyData: {
      '2026-03-16': {
        nursingProblem: '- 주요 문제: Acute bronchitis (disorder)\n- 간호 초점: Respiratory therapy',
        vital: { bp: '122/74', hr: 84, bt: 37.0, rr: 19, spo2: 98 },
        labs: {},
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Acute bronchitis (disorder)'],
            isolation: '-',
            activity: '-',
            caution: [],
            lines: [],
            tubes: [],
            drains: [],
            vent: []
          },
          orders: {
            active: [],
            routine: [],
            prn: [],
            medications: { inj: [], po: [], running: [] }
          },
          vitals: {
            latest: { bp: '122/74', hr: 84, bt: 37.0, rr: 19, spo2: 98 },
            abnormalFlags: []
          },
          labs: {
            latest: {},
            abnormal: []
          },
          nursingActions: {
            completed: [],
            pending: [],
            followUp: []
          },
          sourceRefs: {}
        }
      }
    }
  };
}

function buildPlaceholderNoisePatient() {
  return {
    id: 'placeholder-noise-patient',
    name: '정보없음 테스트 환자',
    gender: 'F',
    age: '52',
    room: '104',
    diagnosis: 'FHIR 진단 정보 없음',
    admissionNote: '-',
    pastHistory: [],
    dailyData: {
      '2026-03-16': {
        nursingProblem: '간호문제 정보 없음',
        vital: { bp: '118/70', hr: 80, bt: 36.8, rr: 18, spo2: 98 },
        labs: {},
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['FHIR 진단 정보 없음'],
            isolation: '-',
            activity: '-',
            caution: [],
            lines: [],
            tubes: [],
            drains: [],
            vent: []
          },
          orders: {
            active: [],
            routine: [],
            prn: [],
            medications: { inj: [], po: [], running: [] }
          },
          vitals: {
            latest: { bp: '118/70', hr: 80, bt: 36.8, rr: 18, spo2: 98 },
            abnormalFlags: []
          },
          labs: {
            latest: {},
            abnormal: []
          },
          nursingActions: {
            completed: [],
            pending: [],
            followUp: []
          },
          sourceRefs: {}
        }
      }
    }
  };
}

function main() {
  const api = createEngineApi();
  const patient = buildSyntheticPatient();
  const dates = Object.keys(patient.dailyData).sort();
  const timeline = api.buildNormalizedDailyTimeline(patient, dates);
  const summary = api.buildLongitudinalPatientSummary(patient, timeline);
  const latest = timeline[timeline.length - 1];

  assert.deepStrictEqual(latest.clinicalStatus.lines, ['Peripheral IV']);
  assert.deepStrictEqual(latest.clinicalStatus.vent, []);
  assert.deepStrictEqual(latest.carryover.items, ['혈당 재확인', '드레싱 상태 재평가']);
  assert(!latest.carryover.backgroundItems.includes('혈당 재확인'));
  assert(summary.overview.careFrame.every((item) => !/CT abdomen|stent/i.test(item)));
  assert(summary.overview.carryoverItems.every((item) => !/Sepsis 경과 관찰|CT abdomen/i.test(item)));

  const activityNoisePatient = buildActivityNoisePatient();
  const activityTimeline = api.buildNormalizedDailyTimeline(activityNoisePatient, Object.keys(activityNoisePatient.dailyData).sort());
  const activitySummary = api.buildLongitudinalPatientSummary(activityNoisePatient, activityTimeline);
  const activityLatest = activityTimeline[activityTimeline.length - 1];

  assert.strictEqual(activityLatest.clinicalStatus.activity, '-');
  assert(activitySummary.overview.careFrame.every((item) => !/Drug addiction counseling/i.test(item)));

  const persistentInterventionNoisePatient = buildPersistentInterventionNoisePatient();
  const persistentTimeline = api.buildNormalizedDailyTimeline(persistentInterventionNoisePatient, Object.keys(persistentInterventionNoisePatient.dailyData).sort());
  const persistentSummary = api.buildLongitudinalPatientSummary(persistentInterventionNoisePatient, persistentTimeline);

  assert(persistentSummary.overview.persistentConcerns.every((item) => !/Respiratory therapy/i.test(item)));

  const placeholderNoisePatient = buildPlaceholderNoisePatient();
  const placeholderTimeline = api.buildNormalizedDailyTimeline(placeholderNoisePatient, Object.keys(placeholderNoisePatient.dailyData).sort());
  const placeholderSummary = api.buildLongitudinalPatientSummary(placeholderNoisePatient, placeholderTimeline);

  assert.strictEqual(placeholderTimeline[0].nursingProblem, '-');
  assert.deepStrictEqual(placeholderTimeline[0].clinicalStatus.diagnoses, []);
  assert(placeholderSummary.overview.persistentConcerns.length === 0);

  const emrHtml = api.generateNarrativeSBAR(
    patient,
    patient.dailyData['2026-03-16'],
    patient.dailyData['2026-03-16'],
    dates
  );
  assert(/class="longitudinal-panel"/.test(emrHtml));
  assert(/class="longitudinal-group"/.test(emrHtml));

  console.log('Stage 2 summary regression test passed.');
}

main();
