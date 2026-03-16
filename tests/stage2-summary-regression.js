const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function createEngineApi() {
  const scriptContent = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const overrideContent = fs.readFileSync(path.join(ROOT, 'stage2-overrides.js'), 'utf8');
  const periodOverrideContent = fs.readFileSync(path.join(ROOT, 'stage2-period-overrides.js'), 'utf8');
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
  vm.runInContext(overrideContent, sandbox, { filename: 'stage2-overrides.js' });
  vm.runInContext(periodOverrideContent, sandbox, { filename: 'stage2-period-overrides.js' });
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

function buildStrokeIdentityPatient() {
  return {
    id: 'stroke-identity-patient',
    name: '뇌경색 테스트 환자',
    gender: 'M',
    age: '68',
    room: '515-3',
    diagnosis: 'Cerebral Infraction',
    admissionNote: '금일 오전 편측 위약감과 구음장애로 내원하였고 Brain MRI상 Rt. MCA acute infarction 소견 확인됨. tPA 투여 후 경과 관찰 중.',
    pastHistory: ['Hypertension'],
    dailyData: {
      '2026-03-16': {
        nursingProblem: '#1. 자가간호결핍',
        vital: { bp: '136/78', hr: 96, bt: 36.8, rr: 18, spo2: 97 },
        labs: {},
        nursingTasks: [],
        plan: [],
        specials: ['Brain MRI: Acute infarction extension at Rt. MCA'],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Cerebral Infraction'],
            isolation: '-',
            activity: 'Bed rest',
            caution: ['낙상고위험'],
            lines: ['Peripheral IV'],
            tubes: ['L-tube'],
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
            latest: { bp: '136/78', hr: 96, bt: 36.8, rr: 18, spo2: 97 },
            abnormalFlags: []
          },
          labs: {
            latest: {},
            abnormal: []
          },
          nursingActions: {
            completed: [],
            pending: ['낙상 예방 확인'],
            followUp: ['낙상 예방 확인']
          },
          sourceRefs: {}
        }
      }
    }
  };
}

function buildSelfCareDeficitPatient() {
  return {
    id: 'self-care-deficit-patient',
    name: '자가간호결핍 테스트 환자',
    gender: 'F',
    age: '72',
    room: '520-2',
    diagnosis: 'Stroke',
    diet: 'L-tube Feeding',
    admissionNote: '좌측 위약감으로 이동과 일상생활 수행에 도움이 필요한 상태로 입원함.',
    pastHistory: [],
    dailyData: {
      '2026-03-16': {
        nursingProblem: '#1. 자가간호결핍',
        vital: { bp: '128/74', hr: 88, bt: 36.7, rr: 18, spo2: 98 },
        labs: {},
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Stroke'],
            isolation: '-',
            activity: 'Bed rest, assist with transfer',
            caution: ['낙상주의'],
            lines: ['Peripheral IV'],
            tubes: ['L-tube'],
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
            latest: { bp: '128/74', hr: 88, bt: 36.7, rr: 18, spo2: 98 },
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

function buildWatchLinkPatient() {
  return {
    id: 'watch-link-patient',
    name: '관찰 링크 테스트 환자',
    gender: 'M',
    age: '54',
    room: '601-1',
    diagnosis: 'Sepsis',
    admissionNote: '빈맥과 발열로 입원하여 혈액검사 추적 중.',
    pastHistory: [],
    dailyData: {
      '2026-03-16': {
        nursingProblem: '#1. 감염위험성',
        vital: { bp: '92/58', hr: 132, bt: 38.6, rr: 24, spo2: 93 },
        labs: {
          Chemistry: { K: '5.8', CRP: '8.2' }
        },
        hourly: [
          { time: '08:00', vital: { bp: '92/58', hr: 132, bt: 38.6, rr: 24, spo2: 93 }, notes: ['빈맥 지속'] }
        ],
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Sepsis'],
            isolation: '-',
            activity: 'Bed rest',
            caution: [],
            lines: ['Peripheral IV'],
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
            latest: { bp: '92/58', hr: 132, bt: 38.6, rr: 24, spo2: 93 },
            abnormalFlags: ['bp', 'hr', 'bt', 'rr']
          },
          labs: {
            latest: { K: '5.8', CRP: '8.2' },
            abnormal: [
              { key: 'K', value: '5.8', status: 'high' },
              { key: 'CRP', value: '8.2', status: 'high' }
            ]
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

function buildSelectedRangePatient() {
  return {
    id: 'selected-range-patient',
    name: 'Selected Range Patient',
    gender: 'M',
    age: '67',
    room: '710-1',
    diagnosis: 'Cerebral Infarction',
    admitDate: '2026-03-10',
    admissionNote: 'Sudden right sided weakness, MRI confirmed acute infarction, admitted for neuro monitoring.',
    pastHistory: ['Hypertension'],
    dailyData: {
      '2026-03-10': {
        nursingProblem: '#1. Self-care deficit',
        vital: { bp: '148/84', hr: 98, bt: 36.9, rr: 18, spo2: 97 },
        labs: {},
        specials: ['Brain MRI: acute infarction at left MCA territory'],
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Cerebral Infarction'],
            isolation: '-',
            activity: 'Absolute bed rest',
            caution: ['Fall risk'],
            lines: ['Peripheral IV'],
            tubes: [],
            drains: [],
            vent: []
          },
          orders: { active: [], routine: [], prn: [], medications: { inj: [], po: [], running: [] } },
          vitals: { latest: { bp: '148/84', hr: 98, bt: 36.9, rr: 18, spo2: 97 }, abnormalFlags: [] },
          labs: { latest: {}, abnormal: [] },
          nursingActions: { completed: [], pending: [], followUp: [] },
          sourceRefs: {}
        }
      },
      '2026-03-16': {
        nursingProblem: '#1. Self-care deficit',
        vital: { bp: '132/76', hr: 86, bt: 36.7, rr: 18, spo2: 98 },
        labs: {},
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ['Cerebral Infarction'],
            isolation: '-',
            activity: 'Assist ambulation with walker',
            caution: ['Fall risk'],
            lines: ['Peripheral IV'],
            tubes: [],
            drains: [],
            vent: []
          },
          orders: { active: [], routine: [], prn: [], medications: { inj: [], po: [], running: [] } },
          vitals: { latest: { bp: '132/76', hr: 86, bt: 36.7, rr: 18, spo2: 98 }, abnormalFlags: [] },
          labs: { latest: {}, abnormal: [] },
          nursingActions: { completed: [], pending: ['Recheck gait safety'], followUp: ['Recheck gait safety'] },
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

  const strokeIdentityPatient = buildStrokeIdentityPatient();
  const strokeTimeline = api.buildNormalizedDailyTimeline(strokeIdentityPatient, Object.keys(strokeIdentityPatient.dailyData).sort());
  const strokeSummary = api.buildLongitudinalPatientSummary(strokeIdentityPatient, strokeTimeline);
  assert(/주진단/.test(strokeSummary.sections.identity[0].summary));
  assert(strokeSummary.sections.identity[0].clinicalBasis.some((item) => /MRI|위약감|구음장애/i.test(item)));

  const selfCarePatient = buildSelfCareDeficitPatient();
  const selfCareTimeline = api.buildNormalizedDailyTimeline(selfCarePatient, Object.keys(selfCarePatient.dailyData).sort());
  const selfCareSummary = api.buildLongitudinalPatientSummary(selfCarePatient, selfCareTimeline);
  assert(selfCareSummary.sections.persistentConcerns.some((item) => /NANDA 간호진단: 자가간호결핍/.test(item.summary)));
  assert(selfCareSummary.sections.persistentConcerns[0].clinicalBasis.some((item) => /활동 제한|보조 장치|식이/i.test(item)));

  const watchLinkPatient = buildWatchLinkPatient();
  const watchDates = Object.keys(watchLinkPatient.dailyData).sort();
  const watchHtml = api.generateNarrativeSBAR(
    watchLinkPatient,
    watchLinkPatient.dailyData[watchDates[0]],
    watchLinkPatient.dailyData[watchDates[0]],
    watchDates
  );

  const emrHtml = api.generateNarrativeSBAR(
    patient,
    patient.dailyData['2026-03-16'],
    patient.dailyData['2026-03-16'],
    dates
  );
  assert(/class="longitudinal-panel"/.test(emrHtml));
  assert(/class="longitudinal-group"/.test(emrHtml));
  assert(/longitudinal-concise-line/.test(emrHtml));
  assert(!/점수 분해/.test(emrHtml));
  assert(!/>\s*\d+점\s*</.test(emrHtml));
  assert(/V\/S 시트 보기|Lab 보기/.test(watchHtml));

  const selectedRangePatient = buildSelectedRangePatient();
  const scopedAnalysis = api.buildHandoffAnalysis(selectedRangePatient, ['2026-03-16']);
  const realtimeContext = api.getRealtimeDateContext(selectedRangePatient);

  assert.strictEqual(realtimeContext.displayByRaw['2026-03-16'], api.getKoreanNowParts().date);
  assert(scopedAnalysis.longitudinalSummary.sections.identity.some((item) => /뇌경색/.test(item.summary)));
  assert(scopedAnalysis.longitudinalSummary.sections.careFrame.some((item) => /보행기 보조 보행|walker|Assist ambulation/i.test(item.summary)));
  assert(scopedAnalysis.longitudinalSummary.sections.careFrame.every((item) => !/Absolute bed rest/i.test(item.summary)));
  assert.strictEqual(scopedAnalysis.longitudinalSummary.selectedDayCount, 1);
  assert(/\d{4}-\d{2}-\d{2}/.test(scopedAnalysis.longitudinalSummary.fullStayRange.start));
  assert(/\d{4}-\d{2}-\d{2}/.test(scopedAnalysis.longitudinalSummary.displayDateRange.end));
  const watchAnalysis = api.buildHandoffAnalysis(watchLinkPatient, watchDates);
  const watchBasis = (watchAnalysis.longitudinalSummary.sections.watchItems[0]?.clinicalBasis || []).join(' | ');
  assert(watchBasis.includes(api.getKoreanNowParts().date));

  console.log('Stage 2 summary regression test passed.');
}

main();
