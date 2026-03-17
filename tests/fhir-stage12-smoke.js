const { fetchSamplePatient } = require("../src/harness/runtime/fetchFhirPatients");
const { loadHandoffEngineApi } = require("../src/harness/runtime/loadHandoffEngineApi");

async function main() {
  const requestedId = process.argv[2];
  const detail = await fetchSamplePatient(requestedId);
  const { api } = loadHandoffEngineApi();

  const dates = Object.keys(detail.dailyData || {}).sort();
  if (!dates.length) {
    throw new Error("No dailyData dates were generated for the sample patient");
  }

  const normalizedTimeline = api.buildNormalizedDailyTimeline(detail, dates);
  const analysis = api.buildHandoffAnalysis(detail, dates);
  const longitudinalSummary = analysis.longitudinalSummary;

  if (normalizedTimeline.length !== dates.length) {
    throw new Error(`Normalized timeline mismatch: expected ${dates.length}, got ${normalizedTimeline.length}`);
  }

  if (!longitudinalSummary || !longitudinalSummary.conciseSummary) {
    throw new Error("Longitudinal summary did not produce a concise summary");
  }

  if (/\((disorder|finding|situation|procedure)\)/i.test(longitudinalSummary.conciseSummary)) {
    throw new Error("Localized concise summary still contains raw FHIR classification suffixes");
  }

  const latest = normalizedTimeline[normalizedTimeline.length - 1];

  console.log("FHIR stage 1/2 smoke test passed.");
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
