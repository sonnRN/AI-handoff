const assert = require("assert");
const { loadHandoffEngineApi } = require("../src/harness/runtime/loadHandoffEngineApi");
const fixtures = require("./fixtures/goldenPatients");
const expectations = require("./fixtures/goldenExpectations");

function main() {
  const { api } = loadHandoffEngineApi();

  const patient = fixtures.buildSyntheticPatient();
  const dates = Object.keys(patient.dailyData).sort();
  const timeline = api.buildNormalizedDailyTimeline(patient, dates);
  const summary = api.buildLongitudinalPatientSummary(patient, timeline);
  const latest = timeline[timeline.length - 1];

  assert.deepStrictEqual(latest.clinicalStatus.lines, expectations.synthetic.allowedLines);
  assert.deepStrictEqual(latest.clinicalStatus.vent, []);
  assert.deepStrictEqual(latest.carryover.items, expectations.synthetic.keepCarryover);
  assert(summary.overview.careFrame.every((item) => !/CT abdomen|stent/i.test(item)));
  assert(summary.overview.carryoverItems.every((item) => !/Sepsis 경과 관찰|CT abdomen/i.test(item)));

  const activityNoisePatient = fixtures.buildActivityNoisePatient();
  const activityTimeline = api.buildNormalizedDailyTimeline(activityNoisePatient, Object.keys(activityNoisePatient.dailyData).sort());
  const activitySummary = api.buildLongitudinalPatientSummary(activityNoisePatient, activityTimeline);
  const activityLatest = activityTimeline[activityTimeline.length - 1];

  assert.strictEqual(activityLatest.clinicalStatus.activity, "-");
  assert(activitySummary.overview.careFrame.every((item) => !/Drug addiction counseling/i.test(item)));

  const persistentInterventionNoisePatient = fixtures.buildPersistentInterventionNoisePatient();
  const persistentTimeline = api.buildNormalizedDailyTimeline(
    persistentInterventionNoisePatient,
    Object.keys(persistentInterventionNoisePatient.dailyData).sort()
  );
  const persistentSummary = api.buildLongitudinalPatientSummary(persistentInterventionNoisePatient, persistentTimeline);
  assert(persistentSummary.overview.persistentConcerns.every((item) => !/Respiratory therapy/i.test(item)));

  const placeholderNoisePatient = fixtures.buildPlaceholderNoisePatient();
  const placeholderTimeline = api.buildNormalizedDailyTimeline(placeholderNoisePatient, Object.keys(placeholderNoisePatient.dailyData).sort());
  const placeholderSummary = api.buildLongitudinalPatientSummary(placeholderNoisePatient, placeholderTimeline);
  assert.strictEqual(placeholderTimeline[0].nursingProblem, "-");
  assert.deepStrictEqual(placeholderTimeline[0].clinicalStatus.diagnoses, []);
  assert.strictEqual(placeholderSummary.overview.persistentConcerns.length, 0);

  const strokeIdentityPatient = fixtures.buildStrokeIdentityPatient();
  const strokeTimeline = api.buildNormalizedDailyTimeline(strokeIdentityPatient, Object.keys(strokeIdentityPatient.dailyData).sort());
  const strokeSummary = api.buildLongitudinalPatientSummary(strokeIdentityPatient, strokeTimeline);
  assert(/주진단|진단|Stroke|Infarction/i.test(strokeSummary.sections.identity[0].summary));
  assert(strokeSummary.sections.identity[0].clinicalBasis.some((item) => /MRI|infarction|약위감|구음/i.test(item)));

  const selfCarePatient = fixtures.buildSelfCareDeficitPatient();
  const selfCareTimeline = api.buildNormalizedDailyTimeline(selfCarePatient, Object.keys(selfCarePatient.dailyData).sort());
  const selfCareSummary = api.buildLongitudinalPatientSummary(selfCarePatient, selfCareTimeline);
  assert(selfCareSummary.sections.persistentConcerns.some((item) => /NANDA/i.test(item.summary)));
  assert(selfCareSummary.sections.persistentConcerns[0].clinicalBasis.some((item) => /activity|L-tube|assist|식이|보조/i.test(item)));

  const watchLinkPatient = fixtures.buildWatchLinkPatient();
  const watchDates = Object.keys(watchLinkPatient.dailyData).sort();
  const watchHtml = api.generateNarrativeSBAR(
    watchLinkPatient,
    watchLinkPatient.dailyData[watchDates[0]],
    watchLinkPatient.dailyData[watchDates[0]],
    watchDates
  );

  const emrHtml = api.generateNarrativeSBAR(
    patient,
    patient.dailyData["2026-03-16"],
    patient.dailyData["2026-03-16"],
    dates
  );
  assert(/class="longitudinal-panel"/.test(emrHtml));
  assert(/class="longitudinal-group"/.test(emrHtml));
  assert(/longitudinal-concise/.test(emrHtml));
  assert(!/score|점수 분해/i.test(emrHtml));
  assert(/V\/S .*보기|Lab .*보기/.test(watchHtml));

  const selectedRangePatient = fixtures.buildSelectedRangePatient();
  const scopedAnalysis = api.buildHandoffAnalysis(selectedRangePatient, ["2026-03-16"]);
  const realtimeContext = api.getRealtimeDateContext(selectedRangePatient);

  assert.strictEqual(realtimeContext.displayByRaw["2026-03-16"], api.getKoreanNowParts().date);
  assert(scopedAnalysis.longitudinalSummary.sections.identity.some((item) => /Cerebral|주진단|뇌경색/i.test(item.summary)));
  assert(scopedAnalysis.longitudinalSummary.sections.careFrame.some((item) => expectations.selectedRange.requiredCareFramePattern.test(item.summary)));
  assert(scopedAnalysis.longitudinalSummary.sections.careFrame.every((item) => !expectations.selectedRange.excludedCareFramePattern.test(item.summary)));
  assert.strictEqual(scopedAnalysis.longitudinalSummary.selectedDayCount, 1);
  assert(/\d{4}-\d{2}-\d{2}/.test(scopedAnalysis.longitudinalSummary.fullStayRange.start));
  assert(/\d{4}-\d{2}-\d{2}/.test(scopedAnalysis.longitudinalSummary.displayDateRange.end));

  const watchAnalysis = api.buildHandoffAnalysis(watchLinkPatient, watchDates);
  const watchBasis = (watchAnalysis.longitudinalSummary.sections.watchItems[0]?.clinicalBasis || []).join(" | ");
  assert(watchBasis.includes(api.getKoreanNowParts().date));

  console.log("Stage 2 summary regression test passed.");
}

main();
