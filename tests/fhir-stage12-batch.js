const { loadHandoffEngineApi } = require("../src/harness/runtime/loadHandoffEngineApi");
const { fetchPatientList } = require("../src/harness/runtime/fetchFhirPatients");

const DEFAULT_COUNT = 10;

function detectSummaryWarnings(result) {
  const warnings = [];
  const activity = String(result.latestActivity || "");
  const careFrame = result.careFrame.join(" | ");
  const carryover = result.carryover.join(" | ");
  const persistent = result.persistent.join(" | ");
  const concise = String(result.conciseSummary || "");

  if (/counsel|education|nutrition|smoking|addiction|consult/i.test(activity)) {
    warnings.push(`activity-noise:${activity}`);
  }
  if (/\bct\b|\bmri\b|x-ray|ultrasound|contrast|stent|consult/i.test(careFrame)) {
    warnings.push(`care-frame-noise:${careFrame}`);
  }
  if (/경과 관찰/.test(carryover) || /\bct\b|\bmri\b|x-ray|ultrasound|서비스 요청|검사 요청/i.test(carryover)) {
    warnings.push(`carryover-noise:${carryover}`);
  }
  if (/요청사항|서비스 요청/i.test(persistent)) {
    warnings.push(`persistent-noise:${persistent}`);
  }
  if (/therapy|counsel|education|teaching/i.test(persistent)) {
    warnings.push(`persistent-intervention-noise:${persistent}`);
  }
  if (/FHIR 진단 정보 없음|간호문제 정보 없음|정보 없음/i.test(persistent)) {
    warnings.push(`persistent-placeholder-noise:${persistent}`);
  }
  if (/\((disorder|finding|situation|procedure)\)/i.test(concise)) {
    warnings.push(`raw-fhir-suffix:${concise}`);
  }

  return warnings;
}

async function main() {
  const count = Math.max(1, parseInt(process.argv[2] || String(DEFAULT_COUNT), 10) || DEFAULT_COUNT);
  const { api } = loadHandoffEngineApi();
  const { handler, patients } = await fetchPatientList({ count });
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
    const analysis = api.buildHandoffAnalysis(detail, dates);
    const longitudinalSummary = analysis.longitudinalSummary;
    const latest = normalizedTimeline[normalizedTimeline.length - 1];

    const result = {
      id: detail.id,
      name: detail.name,
      diagnosis: longitudinalSummary.sections?.identity?.[0]?.summary || detail.diagnosis,
      dateCount: dates.length,
      latestActivity: latest.clinicalStatus?.activity || "-",
      careFrame: (longitudinalSummary.sections?.careFrame || []).map((item) => item.summary),
      persistent: (longitudinalSummary.sections?.persistentConcerns || []).map((item) => item.summary),
      carryover: (longitudinalSummary.sections?.carryoverItems || []).map((item) => item.summary),
      conciseSummary: longitudinalSummary.conciseSummary || ""
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
    console.log(`Care frame: ${item.careFrame.join(" / ") || "-"}`);
    console.log(`Persistent concerns: ${item.persistent.join(" / ") || "-"}`);
    console.log(`Carryover: ${item.carryover.join(" / ") || "-"}`);
    console.log(`Warnings: ${item.warnings.join(" | ") || "none"}`);
  });
}

main().catch((error) => {
  console.error(`FHIR stage 1/2 batch test failed: ${error.message}`);
  process.exit(1);
});
