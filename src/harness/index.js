const { loadHandoffEngineApi } = require("./runtime/loadHandoffEngineApi");
const { fetchPatientList, fetchPatientDetail, fetchSamplePatient } = require("./runtime/fetchFhirPatients");
const { FhirMcpClient, getSharedFhirMcpClient } = require("../mcp/client/fhirMcpClient");
const { createPatientDataGateway, getSharedPatientDataGateway } = require("../mcp/runtime/patientDataGateway");

module.exports = {
  loadHandoffEngineApi,
  fetchPatientList,
  fetchPatientDetail,
  fetchSamplePatient,
  FhirMcpClient,
  getSharedFhirMcpClient,
  createPatientDataGateway,
  getSharedPatientDataGateway
};
