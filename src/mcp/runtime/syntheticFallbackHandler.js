const { loadLocalDemoPatients, buildLocalPatientSummaries } = require("../../harness/runtime/loadLocalDemoPatients");
const { buildPublicDataPolicyMetadata } = require("./publicDataPolicy");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}

function isRemoteFhirDisabled() {
  const value = String(process.env.AI_HANDOFF_DISABLE_REMOTE_FHIR || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function createSyntheticFallbackHandler() {
  return async function syntheticFallbackHandler(event = {}) {
    const queryStringParameters = event.queryStringParameters || {};
    const patients = loadLocalDemoPatients();
    const patientId = queryStringParameters.id;

    if (typeof patientId !== "undefined") {
      const detail = patients.find((patient) => String(patient.id) === String(patientId));
      if (!detail) {
        return jsonResponse(404, {
          error: "Patient not found",
          detail: `Synthetic fallback patient not found: ${patientId}`
        });
      }

      return jsonResponse(200, {
        ...detail,
        external: false,
        source: "local-demo-fallback",
        policy: buildPublicDataPolicyMetadata({
          selectedBaseUrl: "local-demo-fallback"
        })
      });
    }

    const count = Number.parseInt(String(queryStringParameters.count || patients.length), 10);
    const normalizedCount = Number.isFinite(count) ? Math.max(1, Math.min(count, patients.length)) : patients.length;

    return jsonResponse(200, {
      patients: buildLocalPatientSummaries(patients).slice(0, normalizedCount),
      source: "local-demo-fallback",
      policy: buildPublicDataPolicyMetadata({
        selectedBaseUrl: "local-demo-fallback"
      }),
      pageInfo: {
        count: normalizedCount,
        hasNext: false,
        nextCursor: "",
        cursor: ""
      }
    });
  };
}

module.exports = {
  createSyntheticFallbackHandler,
  isRemoteFhirDisabled
};
