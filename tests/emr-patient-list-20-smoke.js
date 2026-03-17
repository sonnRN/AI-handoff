const assert = require("assert");
const { fetchPatientList } = require("../src/harness/runtime/fetchFhirPatients");
const { loadLocalDemoPatients } = require("../src/harness/runtime/loadLocalDemoPatients");

const REQUIRED_HEADER_FIELDS = [
  "id",
  "name",
  "room",
  "registrationNo",
  "gender",
  "age",
  "diagnosis",
  "admitDate",
  "bloodType",
  "bodyInfo",
  "doctor",
  "isolation",
  "dailyData"
];

function assertPatientForEmr(patient, label) {
  for (const field of REQUIRED_HEADER_FIELDS) {
    assert(patient[field] || patient[field] === 0, `${label}: missing ${field}`);
  }

  const dates = Object.keys(patient.dailyData || {}).sort();
  assert(dates.length > 0, `${label}: missing dailyData dates`);
  const latest = patient.dailyData[dates[dates.length - 1]];
  assert(latest.vital, `${label}: missing latest vital section`);
  assert(latest.orders, `${label}: missing latest orders section`);
  assert(latest.handover, `${label}: missing latest handover section`);
}

async function main() {
  const localPatients = loadLocalDemoPatients();
  assert.strictEqual(localPatients.length, 20, "Local synthetic patient list must contain 20 patients");

  const { handler, patients } = await fetchPatientList({ count: 20 });
  assert.strictEqual(patients.length, 20, "External or fallback patient list must return 20 patients");

  const firstPatient = JSON.parse((await handler({ queryStringParameters: { id: String(patients[0].id) } })).body);
  const lastPatient = JSON.parse((await handler({ queryStringParameters: { id: String(patients[patients.length - 1].id) } })).body);

  assertPatientForEmr(firstPatient, "first patient");
  assertPatientForEmr(lastPatient, "last patient");

  console.log("EMR patient list 20 smoke test passed.");
  console.log(`List source count: ${patients.length}`);
  console.log(`First patient: ${firstPatient.name} (${firstPatient.id})`);
  console.log(`Last patient: ${lastPatient.name} (${lastPatient.id})`);
}

main().catch((error) => {
  console.error(`EMR patient list 20 smoke test failed: ${error.message}`);
  process.exit(1);
});
