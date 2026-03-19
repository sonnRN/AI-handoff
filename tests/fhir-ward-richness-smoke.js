const assert = require("assert");
const { handler } = require("../src/server/handlers/patientsApi");

const EXPECTED_WARD_COUNTS = new Map([
  ["내과계중환자실", 10],
  ["외과계중환자실", 10],
  ["신경과병동", 10],
  ["외과병동", 10],
  ["호흡기내과병동", 10],
  ["소화기내과병동", 5],
  ["신장내과병동", 5]
]);

async function fetchPayload(queryStringParameters) {
  const response = await handler({ queryStringParameters });
  const payload = JSON.parse(response.body);
  if (payload.error) {
    throw new Error(payload.detail || payload.error);
  }
  return payload;
}

function assertHourlyRichness(detail, label) {
  const dates = Object.keys(detail.dailyData || {}).sort();
  assert(dates.length > 0, `${label}: dailyData dates missing`);
  const latest = detail.dailyData[dates[dates.length - 1]];
  assert(Array.isArray(latest.hourly), `${label}: hourly section missing`);
  assert.strictEqual(latest.hourly.length, 24, `${label}: hourly section must cover 24 hours`);
  assert(latest.hourly.every((slot) => Array.isArray(slot.notes) && slot.notes.length >= 1), `${label}: every hour must contain at least one nursing note`);
  const minimumInjectionCount = String(detail.ward || "").includes("중환자실") ? 8 : 5;
  assert((latest.orders?.inj || []).length >= minimumInjectionCount, `${label}: injection list must contain at least ${minimumInjectionCount} daily items`);
  assert(Array.isArray(latest.labSummary), `${label}: labSummary missing`);
  assert(Array.isArray(latest.specialDetails), `${label}: specialDetails missing`);
}

async function main() {
  const list = await fetchPayload({ count: "60" });
  assert.strictEqual(list.patients.length, 60, "Direct FHIR handler must return 60 patients");

  const countsByWard = new Map();
  list.patients.forEach((patient) => {
    assert(/^[가-힣]{3}$/.test(String(patient.name || "")), `Patient name must be a unique three-syllable Korean name: ${patient.name}`);
    countsByWard.set(patient.ward, (countsByWard.get(patient.ward) || 0) + 1);
  });

  EXPECTED_WARD_COUNTS.forEach((expectedCount, ward) => {
    assert(countsByWard.has(ward), `Ward missing from FHIR patient list: ${ward}`);
    assert.strictEqual(countsByWard.get(ward), expectedCount, `Ward count mismatch for ${ward}`);
  });
  assert.strictEqual(countsByWard.size, EXPECTED_WARD_COUNTS.size, "FHIR patient list must only use the configured wards");

  for (const ward of EXPECTED_WARD_COUNTS.keys()) {
    const sample = list.patients.find((patient) => patient.ward === ward);
    assert(sample, `Missing sample for ward ${ward}`);
    const detail = await fetchPayload({
      id: String(sample.id),
      ward: sample.ward,
      department: sample.department
    });
    assert.strictEqual(detail.ward, ward, `Detail ward mismatch for ${ward}`);
    assertHourlyRichness(detail, ward);
  }

  console.log("FHIR ward richness smoke test passed.");
  console.log(`Ward counts: ${JSON.stringify(Object.fromEntries(countsByWard), null, 2)}`);
}

main().catch((error) => {
  console.error(`FHIR ward richness smoke test failed: ${error.message}`);
  process.exit(1);
});
