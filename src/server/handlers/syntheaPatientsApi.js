const fs = require("fs");
const path = require("path");
const { ROOT } = require("../../harness/runtime/loadHandoffEngineApi");
const {
  normalizePatientDetail,
  buildSyntheticWardAssignment,
  buildSyntheticDoctorTeam,
  inferClinicalDepartment
} = require("./patientsApi");
const { buildPublicDataPolicyMetadata } = require("../../mcp/runtime/publicDataPolicy");

const DEFAULT_SYNTHEA_DIR = path.join(ROOT, "data", "synthea", "fhir");
const SOURCE_LABEL = "synthea-local-file";

exports.handler = async function handler(event) {
  try {
    const query = event.queryStringParameters || {};
    const patientId = String(query.id || "").trim();
    const count = normalizeCount(query.count, 8);
    const cursor = decodeCursor(query.cursor);
    const repository = loadSyntheaRepository(getSyntheaDataDir());

    if (patientId) {
      const detail = repository.details.get(patientId);
      if (!detail) {
        return jsonResponse(404, {
          error: "Synthea patient not found",
          detail: `No Synthea patient detail found for id ${patientId}`
        });
      }

      return jsonResponse(200, detail);
    }

    const total = repository.summaries.length;
    const start = Math.min(cursor, total);
    const end = Math.min(start + count, total);
    const patients = repository.summaries.slice(start, end);
    const hasNext = end < total;

    return jsonResponse(200, {
      patients,
      source: SOURCE_LABEL,
      policy: buildPublicDataPolicyMetadata({
        selectedBaseUrl: "synthea-local-file",
        sourceAdapter: "synthea-local"
      }),
      pageInfo: {
        count: patients.length,
        hasNext,
        nextCursor: hasNext ? encodeCursor(end) : "",
        cursor: start ? encodeCursor(start) : ""
      },
      repository: {
        dataDir: getSyntheaDataDir(),
        totalPatients: total,
        fileCount: repository.fileCount
      }
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Synthea patient data could not be loaded",
      detail: error.message
    });
  }
};

function getSyntheaDataDir() {
  return path.resolve(process.env.AI_HANDOFF_SYNTHEA_DIR || DEFAULT_SYNTHEA_DIR);
}

function normalizeCount(value, fallback) {
  const parsed = Number.parseInt(String(value || fallback || 8), 10);
  if (!Number.isFinite(parsed)) return fallback || 8;
  return Math.max(1, Math.min(parsed, 80));
}

function encodeCursor(offset) {
  return Buffer.from(String(Math.max(0, Number(offset) || 0)), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    return Math.max(0, Number.parseInt(Buffer.from(String(cursor), "base64url").toString("utf8"), 10) || 0);
  } catch (error) {
    return 0;
  }
}

function loadSyntheaRepository(dataDir) {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Synthea data directory not found: ${dataDir}`);
  }

  const files = collectJsonFiles(dataDir);
  if (!files.length) {
    throw new Error(`No Synthea JSON files found in ${dataDir}`);
  }

  const patientBuckets = new Map();

  files.forEach((filePath) => {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const resources = extractResources(payload);
    resources.forEach((resource) => {
      const patientId = findPatientId(resource);
      if (!patientId) return;
      if (!patientBuckets.has(patientId)) {
        patientBuckets.set(patientId, buildEmptyRecord());
      }

      const bucket = patientBuckets.get(patientId);
      assignResource(bucket, resource);
    });
  });

  const details = new Map();
  const summaries = [];

  Array.from(patientBuckets.entries())
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]), "en"))
    .forEach(([patientId, record], index) => {
      if (!record.patient) return;

      const detail = normalizePatientDetail(record);
      const diagnosisList = String(detail.diagnosis || "").trim() ? [detail.diagnosis] : [];
      const department = inferClinicalDepartment(diagnosisList);
      const wardAssignment = buildSyntheticWardAssignment(patientId, index + 1, {
        department,
        diagnosisList
      });
      const normalizedDetail = {
        ...detail,
        room: wardAssignment.room,
        ward: wardAssignment.ward,
        department,
        doctor: buildSyntheticDoctorTeam(department, wardAssignment.ward),
        source: SOURCE_LABEL,
        policy: buildPublicDataPolicyMetadata({
          selectedBaseUrl: "synthea-local-file",
          sourceAdapter: "synthea-local"
        })
      };

      details.set(String(normalizedDetail.id), normalizedDetail);
      summaries.push(buildSummaryFromDetail(normalizedDetail));
    });

  return {
    summaries: summaries.sort(compareSyntheaSummaries),
    details,
    fileCount: files.length
  };
}

function collectJsonFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  entries.forEach((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
      return;
    }

    if (entry.isFile() && /\.json$/i.test(entry.name)) {
      files.push(fullPath);
    }
  });

  return files;
}

function extractResources(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (payload.resourceType === "Bundle" && Array.isArray(payload.entry)) {
    return payload.entry.map((entry) => entry.resource).filter(Boolean);
  }

  if (payload.resourceType) {
    return [payload];
  }

  if (Array.isArray(payload.resources)) {
    return payload.resources.filter(Boolean);
  }

  return [];
}

function buildEmptyRecord() {
  return {
    patient: null,
    encounters: [],
    conditions: [],
    observations: [],
    medications: [],
    administrations: [],
    allergies: [],
    procedures: [],
    reports: [],
    serviceRequests: [],
    carePlans: [],
    documents: [],
    devices: []
  };
}

function findPatientId(resource) {
  if (!resource || !resource.resourceType) return "";
  if (resource.resourceType === "Patient") return String(resource.id || "").trim();

  const candidates = [
    resource.subject?.reference,
    resource.patient?.reference,
    Array.isArray(resource.subject) ? resource.subject[0]?.reference : ""
  ];

  for (const candidate of candidates) {
    const id = extractReferenceId(candidate);
    if (id) return id;
  }

  return "";
}

function extractReferenceId(reference) {
  const source = String(reference || "").trim();
  if (!source) return "";
  if (!source.includes("/")) return source;
  return source.split("/").pop() || "";
}

function assignResource(bucket, resource) {
  switch (resource.resourceType) {
    case "Patient":
      bucket.patient = resource;
      break;
    case "Encounter":
      bucket.encounters.push(resource);
      break;
    case "Condition":
      bucket.conditions.push(resource);
      break;
    case "Observation":
      bucket.observations.push(resource);
      break;
    case "MedicationRequest":
      bucket.medications.push(resource);
      break;
    case "MedicationAdministration":
      bucket.administrations.push(resource);
      break;
    case "AllergyIntolerance":
      bucket.allergies.push(resource);
      break;
    case "Procedure":
      bucket.procedures.push(resource);
      break;
    case "DiagnosticReport":
      bucket.reports.push(resource);
      break;
    case "ServiceRequest":
      bucket.serviceRequests.push(resource);
      break;
    case "CarePlan":
      bucket.carePlans.push(resource);
      break;
    case "DocumentReference":
      bucket.documents.push(resource);
      break;
    case "Device":
      bucket.devices.push(resource);
      break;
    default:
      break;
  }
}

function buildSummaryFromDetail(detail) {
  return {
    id: detail.id,
    room: detail.room,
    ward: detail.ward,
    name: detail.name,
    registrationNo: detail.registrationNo,
    gender: detail.gender,
    age: detail.age,
    department: detail.department,
    diagnosis: detail.diagnosis,
    admitDate: detail.admitDate,
    bloodType: detail.bloodType,
    bodyInfo: detail.bodyInfo,
    doctor: detail.doctor,
    isolation: detail.isolation,
    external: true,
    source: SOURCE_LABEL
  };
}

function compareSyntheaSummaries(left, right) {
  const wardDelta = String(left?.ward || "").localeCompare(String(right?.ward || ""), "ko");
  if (wardDelta !== 0) return wardDelta;
  const departmentDelta = String(left?.department || "").localeCompare(String(right?.department || ""), "ko");
  if (departmentDelta !== 0) return departmentDelta;
  return String(left?.room || "").localeCompare(String(right?.room || ""), "ko");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60"
    },
    body: JSON.stringify(body)
  };
}

module.exports = {
  handler: exports.handler,
  loadSyntheaRepository,
  getSyntheaDataDir
};
