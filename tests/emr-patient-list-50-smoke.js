const assert = require("assert");
const { fetchPatientList } = require("../src/harness/runtime/fetchFhirPatients");
const { loadLocalDemoPatients } = require("../src/harness/runtime/loadLocalDemoPatients");

const REQUIRED_HEADER_FIELDS = [
  "id",
  "name",
  "room",
  "ward",
  "department",
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
  assert.strictEqual(localPatients.length, 50, "Local synthetic patient list must contain 50 patients");

  const { handler, patients } = await fetchPatientList({ count: 50 });
  assert.strictEqual(patients.length, 50, "External or fallback patient list must return 50 patients");
  assert(patients.every((patient) => patient.ward && patient.ward !== "ER"), "Patient summaries must include non-ER ward labels");

  const wardSet = new Set(patients.map((patient) => patient.ward));
  const departmentSet = new Set(patients.map((patient) => patient.department));
  assert(wardSet.has("ICU"), "Patient list must include ICU patients");
  assert(wardSet.has("N병동"), "Patient list must include N병동 patients");
  assert(wardSet.size >= 5, "Patient list must be distributed across at least five wards");
  assert(departmentSet.size >= 4, "Patient list must be distributed across at least four departments");

  const firstPatient = JSON.parse((await handler({ queryStringParameters: { id: String(patients[0].id) } })).body);
  const lastPatient = JSON.parse((await handler({ queryStringParameters: { id: String(patients[patients.length - 1].id) } })).body);

  assertPatientForEmr(firstPatient, "first patient");
  assertPatientForEmr(lastPatient, "last patient");

  console.log("EMR patient list 50 smoke test passed.");
  console.log(`List source count: ${patients.length}`);
  console.log(`Ward groups: ${Array.from(wardSet).sort().join(", ")}`);
  console.log(`Departments: ${Array.from(departmentSet).sort().join(", ")}`);
  console.log(`First patient: ${firstPatient.name} (${firstPatient.id})`);
  console.log(`Last patient: ${lastPatient.name} (${lastPatient.id})`);
}

main().catch((error) => {
  console.error(`EMR patient list 50 smoke test failed: ${error.message}`);
  process.exit(1);
});
