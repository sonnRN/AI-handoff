const { handler: smartFhirHandler } = require("./patientsApi");
const { handler: syntheaHandler } = require("./syntheaPatientsApi");

const DEFAULT_SOURCE = "smart-fhir";
const SOURCE_HANDLERS = Object.freeze({
  "smart-fhir": smartFhirHandler,
  synthea: syntheaHandler,
  "synthea-local": syntheaHandler
});

function normalizePatientSource(value) {
  const source = String(value || process.env.AI_HANDOFF_PATIENT_SOURCE || DEFAULT_SOURCE).trim().toLowerCase();
  if (source === "smart") return "smart-fhir";
  if (source === "synthea-local-file") return "synthea-local";
  return SOURCE_HANDLERS[source] ? source : DEFAULT_SOURCE;
}

function resolvePatientSourceHandler(value) {
  const source = normalizePatientSource(value);
  return {
    source,
    handler: SOURCE_HANDLERS[source] || smartFhirHandler
  };
}

module.exports = {
  DEFAULT_SOURCE,
  normalizePatientSource,
  resolvePatientSourceHandler
};
