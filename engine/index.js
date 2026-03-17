const { loadHandoffEngineApi } = require("./runtime/loadHandoffEngineApi");
const { fetchPatientList, fetchPatientDetail, fetchSamplePatient } = require("./runtime/fetchFhirPatients");

module.exports = {
  loadHandoffEngineApi,
  fetchPatientList,
  fetchPatientDetail,
  fetchSamplePatient
};
