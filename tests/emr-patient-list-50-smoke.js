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
  assert.strictEqual(localPatients.length, 60, "Local synthetic patient list must contain 60 patients");

  const { handler, patients, fallback, source } = await fetchPatientList({ count: 60 });
  assert.strictEqual(patients.length, 60, "External or fallback patient list must return 60 patients");
  assert(patients.every((patient) => patient.ward && patient.ward !== "ER"), "Patient summaries must include non-ER ward labels");

  const wardSet = new Set(patients.map((patient) => patient.ward));
  const departmentSet = new Set(patients.map((patient) => patient.department));
  assert(wardSet.has("내과계중환자실"), "Patient list must include medical ICU patients");
  assert(wardSet.has("외과계중환자실"), "Patient list must include surgical ICU patients");
  assert(wardSet.has("N병동"), "Patient list must include N병동 patients");
  assert(wardSet.size >= 6, "Patient list must be distributed across at least six wards");
  if (!fallback && source !== "local-demo-fallback") {
    assert(departmentSet.size >= 10, "FHIR patient list must be distributed across at least ten departments");
  } else {
    assert(departmentSet.size >= 4, "Fallback patient list must remain distributed across at least four departments");
  }

  const firstPatient = JSON.parse((await handler({ queryStringParameters: { id: String(patients[0].id) } })).body);
  const lastPatient = JSON.parse((await handler({ queryStringParameters: { id: String(patients[patients.length - 1].id) } })).body);

  assertPatientForEmr(firstPatient, "first patient");
  assertPatientForEmr(lastPatient, "last patient");

  console.log("EMR patient list 60 smoke test passed.");
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
