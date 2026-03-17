const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const LOCAL_PATIENTS_FILE = path.join(ROOT, "patients.js");

let cachedPatients = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadLocalDemoPatients() {
  if (!cachedPatients) {
    const source = fs.readFileSync(LOCAL_PATIENTS_FILE, "utf8");
    const sandbox = {
      console,
      Date,
      Math,
      setTimeout,
      clearTimeout
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: "patients.js" });
    const patients = vm.runInContext("patients", sandbox);

    if (!Array.isArray(patients) || !patients.length) {
      throw new Error("Local demo patients are unavailable");
    }

    cachedPatients = patients;
  }

  return clone(cachedPatients);
}

function buildLocalPatientSummaries(patients) {
  return patients.map((patient) => ({
    id: patient.id,
    room: patient.room || "-",
    ward: patient.ward || "-",
    name: patient.name || `Patient ${patient.id}`,
    registrationNo: patient.registrationNo || String(patient.id),
    gender: patient.gender || "-",
    age: patient.age || "-",
    department: patient.department || "-",
    diagnosis: patient.diagnosis || "-",
    admitDate: patient.admitDate || "-",
    bloodType: patient.bloodType || "-",
    bodyInfo: patient.bodyInfo || "-",
    doctor: patient.doctor || "-",
    isolation: patient.isolation || "-",
    external: false,
    source: "local-demo-fallback"
  }));
}

module.exports = {
  loadLocalDemoPatients,
  buildLocalPatientSummaries
};
