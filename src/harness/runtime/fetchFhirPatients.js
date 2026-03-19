const path = require("path");
const { ROOT } = require("./loadHandoffEngineApi");
const { buildLocalPatientSummaries, loadLocalDemoPatients } = require("./loadLocalDemoPatients");

function isRemoteFhirDisabled() {
  const value = String(process.env.AI_HANDOFF_DISABLE_REMOTE_FHIR || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getPatientsHandler() {
  try {
    return require(path.join(ROOT, "src", "server", "handlers", "patientsMcpApi.js")).handler;
  } catch (error) {
    return require(path.join(ROOT, "src", "server", "handlers", "patientsApi.js")).handler;
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}

function createLocalFallbackHandler() {
  return async function localFallbackHandler(event = {}) {
    const queryStringParameters = event.queryStringParameters || {};
    const patients = loadLocalDemoPatients();
    const patientId = queryStringParameters.id;

    if (typeof patientId !== "undefined") {
      const detail = patients.find((patient) => String(patient.id) === String(patientId));
      if (!detail) {
        return jsonResponse(404, {
          error: "Patient not found",
          detail: `Local demo patient not found: ${patientId}`
        });
      }

      return jsonResponse(200, {
        ...detail,
        external: false,
        source: "local-demo-fallback"
      });
    }

    const count = Number.parseInt(String(queryStringParameters.count || patients.length), 10);
    const normalizedCount = Number.isFinite(count) ? Math.max(1, count) : patients.length;

    return jsonResponse(200, {
      patients: buildLocalPatientSummaries(patients).slice(0, normalizedCount),
      source: "local-demo-fallback",
      fallback: true
    });
  };
}

function parseHandlerPayload(response) {
  if (!response || typeof response.body !== "string") {
    throw new Error("Patient handler returned an invalid response");
  }

  return JSON.parse(response.body);
}

async function tryFetchPatientList(handler, queryStringParameters) {
  const response = await handler({ queryStringParameters });
  const payload = parseHandlerPayload(response);

  if (payload.error) {
    throw new Error(payload.detail || payload.error);
  }

  if (!Array.isArray(payload.patients) || !payload.patients.length) {
    throw new Error("FHIR patient list is empty");
  }

  return payload;
}

async function tryFetchPatientDetail(handler, id) {
  const response = await handler({ queryStringParameters: { id } });
  const payload = parseHandlerPayload(response);

  if (payload.error) {
    throw new Error(payload.detail || payload.error);
  }

  return payload;
}

async function fetchPatientList(options = {}) {
  const queryStringParameters = {};
  if (typeof options.count !== "undefined") {
    queryStringParameters.count = String(options.count);
  }
  if (typeof options.cursor === "string" && options.cursor) {
    queryStringParameters.cursor = options.cursor;
  }

  if (isRemoteFhirDisabled()) {
    const fallbackHandler = createLocalFallbackHandler();
    const payload = await tryFetchPatientList(fallbackHandler, queryStringParameters);
    return {
      handler: fallbackHandler,
      patients: payload.patients,
      source: payload.source || "local-demo-fallback",
      fallback: true,
      fallbackReason: "Remote FHIR disabled by environment",
      pageInfo: payload.pageInfo || null
    };
  }

  const remoteHandler = getPatientsHandler();

  try {
    const payload = await tryFetchPatientList(remoteHandler, queryStringParameters);
    const resilientHandler = async function resilientHandler(event = {}) {
      const nextQuery = event.queryStringParameters || {};
      if (typeof nextQuery.id !== "undefined") {
        const detailResponse = await remoteHandler({
          queryStringParameters: { id: String(nextQuery.id) }
        });
        return jsonResponse(200, parseHandlerPayload(detailResponse));
      }
      const pageResponse = await remoteHandler({ queryStringParameters: nextQuery });
      return jsonResponse(200, parseHandlerPayload(pageResponse));
    };

    return {
      handler: resilientHandler,
      patients: payload.patients,
      source: payload.source || "smart-health-it-sandbox",
      fallback: Boolean(payload.mcp?.fallback || payload.fallback),
      fallbackReason: payload.mcp?.reason || "",
      pageInfo: payload.pageInfo || null,
      mcp: payload.mcp || null
    };
  } catch (remoteError) {
    const fallbackHandler = createLocalFallbackHandler();
    const payload = await tryFetchPatientList(fallbackHandler, queryStringParameters);
    return {
      handler: fallbackHandler,
      patients: payload.patients,
      source: payload.source || "local-demo-fallback",
      fallback: true,
      fallbackReason: remoteError.message,
      pageInfo: payload.pageInfo || null
    };
  }
}

async function fetchPatientDetail(id) {
  if (isRemoteFhirDisabled()) {
    const fallbackHandler = createLocalFallbackHandler();
    return tryFetchPatientDetail(fallbackHandler, id);
  }

  const remoteHandler = getPatientsHandler();

  try {
    return await tryFetchPatientDetail(remoteHandler, id);
  } catch (remoteError) {
    const fallbackHandler = createLocalFallbackHandler();
    return tryFetchPatientDetail(fallbackHandler, id);
  }
}

async function fetchSamplePatient(patientId, count = 10) {
  if (patientId) {
    return fetchPatientDetail(patientId);
  }

  const { handler, patients } = await fetchPatientList({ count });
  const sample = patients[0];

  if (!sample) {
    throw new Error(`Requested patient id not found: ${patientId}`);
  }

  return tryFetchPatientDetail(handler, sample.id);
}

module.exports = {
  fetchPatientList,
  fetchPatientDetail,
  fetchSamplePatient
};
