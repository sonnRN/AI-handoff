const {
  getPublicSafeFhirBaseUrl,
  buildPublicDataPolicyMetadata
} = require("../../mcp/runtime/publicDataPolicy");

const FHIR_BASE_URL = getPublicSafeFhirBaseUrl();
const DEFAULT_PATIENT_COUNT = 8;
const TIMELINE_DAYS = 10;
const FHIR_FETCH_TIMEOUT_MS = Math.max(1000, Number.parseInt(String(process.env.FHIR_FETCH_TIMEOUT_MS || "8000"), 10) || 8000);
const PATIENT_BATCH_FETCH_SIZE = 20;
const LIST_PAGE_FETCH_SIZE = 30;
const MAX_LIST_FETCH_PAGES = 8;
const BALANCED_POOL_MIN = 60;
const BALANCED_POOL_PADDING = 24;
const BALANCED_POOL_MAX = 100;
const DEPARTMENT_SEED_SEARCHES = [
  { department: "감염내과", term: "sepsis", count: 8 },
  { department: "감염내과", term: "infection", count: 8 },
  { department: "감염내과", term: "cellulitis", count: 6 },
  { department: "호흡기내과", term: "pneumonia", count: 8 },
  { department: "호흡기내과", term: "bronchitis", count: 8 },
  { department: "호흡기내과", term: "asthma", count: 6 },
  { department: "순환기내과", term: "angina", count: 6 },
  { department: "순환기내과", term: "myocardial", count: 6 },
  { department: "순환기내과", term: "arrhythmia", count: 4 },
  { department: "신경과", term: "stroke", count: 8 },
  { department: "신경과", term: "seizure", count: 6 },
  { department: "신경과", term: "cerebral", count: 6 },
  { department: "외과", term: "fracture", count: 8 },
  { department: "외과", term: "hernia", count: 6 },
  { department: "외과", term: "wound", count: 6 },
  { department: "종양내과", term: "cancer", count: 8 },
  { department: "종양내과", term: "carcinoma", count: 6 },
  { department: "종양내과", term: "neoplasm", count: 6 },
  { department: "소화기내과", term: "gastritis", count: 6 },
  { department: "소화기내과", term: "colitis", count: 6 },
  { department: "소화기내과", term: "pancreatitis", count: 4 },
  { department: "내분비내과", term: "diabetes", count: 6 },
  { department: "내분비내과", term: "thyroid", count: 4 },
  { department: "신장비뇨의학과", term: "renal", count: 6 },
  { department: "신장비뇨의학과", term: "urinary", count: 6 },
  { department: "재활의학과", term: "weakness", count: 6 },
  { department: "재활의학과", term: "deconditioning", count: 4 },
  { department: "이비인후과", term: "sinusitis", count: 3 }
];
const SYNTHETIC_WARD_LAYOUT = [
  { ward: "ICU", roomPrefix: "ICU", roomBase: 1, roomDigits: 2, doctorTeam: "Synthetic Critical Care Team" },
  { ward: "N병동", roomPrefix: "N", roomBase: 301, roomDigits: 3, doctorTeam: "Synthetic Neuro Team" },
  { ward: "S병동", roomPrefix: "S", roomBase: 401, roomDigits: 3, doctorTeam: "Synthetic Surgical Team" },
  { ward: "내과병동", roomPrefix: "M", roomBase: 501, roomDigits: 3, doctorTeam: "Synthetic Medical Team" },
  { ward: "재활병동", roomPrefix: "R", roomBase: 601, roomDigits: 3, doctorTeam: "Synthetic Rehab Team" }
];
const WARD_DISPLAY_ORDER = SYNTHETIC_WARD_LAYOUT.map((item) => item.ward);
const DEPARTMENT_PRIORITY_ORDER = [
  "감염내과",
  "호흡기내과",
  "순환기내과",
  "소화기내과",
  "내분비내과",
  "신장비뇨의학과",
  "신경과",
  "외과",
  "종양내과",
  "재활의학과",
  "이비인후과",
  "일반내과"
];
const ICU_DIAGNOSIS_PATTERN = /shock|sepsis|respiratory failure|ventilator|ecmo|intubation|cardiac arrest|hemodynamic|critical|status epilepticus|unstable/i;
const DEPARTMENT_WARD_MAP = new Map([
  ["신경과", "N병동"],
  ["외과", "S병동"],
  ["종양내과", "S병동"],
  ["재활의학과", "재활병동"],
  ["감염내과", "내과병동"],
  ["호흡기내과", "내과병동"],
  ["순환기내과", "내과병동"],
  ["소화기내과", "내과병동"],
  ["내분비내과", "내과병동"],
  ["신장비뇨의학과", "내과병동"],
  ["이비인후과", "내과병동"],
  ["일반내과", "내과병동"]
]);
const WARD_TARGET_RATIO = {
  ICU: 0.14,
  N병동: 0.2,
  S병동: 0.2,
  내과병동: 0.34,
  재활병동: 0.12
};

const VITAL_CODES = {
  systolic: ["8480-6"],
  diastolic: ["8462-4"],
  heartRate: ["8867-4"],
  bodyTemp: ["8310-5"],
  spo2: ["59408-5", "2708-6"],
  respiratoryRate: ["9279-1"],
  bodyWeight: ["29463-7"],
  bodyHeight: ["8302-2"]
};

exports.handler = async function handler(event) {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    const requestedCount = event.queryStringParameters && event.queryStringParameters.count;
    const requestedCursor = event.queryStringParameters && event.queryStringParameters.cursor;
    const patientCount = normalizePatientCount(requestedCount);

    if (id) {
      const detail = await fetchPatientDetail(id);
      return jsonResponse(200, detail);
    }

    const page = await fetchPatientListPage({
      count: patientCount,
      cursor: requestedCursor
    });
    return jsonResponse(200, {
      patients: page.patients,
      source: "smart-health-it-sandbox-synthetic",
      pageInfo: page.pageInfo,
      policy: buildPublicDataPolicyMetadata({
        selectedBaseUrl: FHIR_BASE_URL
      })
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "FHIR 환자 정보를 가져오지 못했습니다.",
      detail: error.message
    });
  }
};

async function fetchPatientList(count = DEFAULT_PATIENT_COUNT) {
  const page = await fetchPatientListPage({ count });
  return page.patients;
}

async function fetchPatientListPage(options = {}) {
  const count = normalizePatientCount(options.count);
  const cursor = typeof options.cursor === "string" ? options.cursor : "";
  const poolTargetCount = Math.min(
    Math.max(count + BALANCED_POOL_PADDING, BALANCED_POOL_MIN),
    BALANCED_POOL_MAX
  );
  const candidatePool = await fetchPatientCandidatePool({
    cursor,
    targetCount: poolTargetCount
  });
  const profiles = await buildPatientListProfiles(candidatePool.resources);
  const patients = selectBalancedPatientProfiles(profiles, count);

  return {
    patients,
    pageInfo: {
      count,
      hasNext: Boolean(candidatePool.nextPath),
      nextCursor: candidatePool.nextPath ? encodePatientCursor(candidatePool.nextPath) : "",
      cursor: cursor || ""
    }
  };
}

function normalizePatientCount(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_PATIENT_COUNT), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PATIENT_COUNT;
  return Math.max(1, Math.min(parsed, 50));
}

async function fetchPatientCandidatePool(options = {}) {
  const targetCount = Math.max(1, Number.parseInt(String(options.targetCount || BALANCED_POOL_MIN), 10) || BALANCED_POOL_MIN);
  const seededResources = await fetchDepartmentSeedPatientResources(targetCount);
  const seenIds = new Set(seededResources.map((resource) => String(resource?.id || "")).filter(Boolean));
  let nextPath = typeof options.cursor === "string" && options.cursor
    ? decodePatientCursor(options.cursor)
    : `/Patient?_count=${LIST_PAGE_FETCH_SIZE}&_elements=id,name,gender,birthDate`;
  let finalNextPath = "";
  let pageCount = 0;
  const pages = [];

  while (nextPath && pageCount < MAX_LIST_FETCH_PAGES) {
    const bundle = await fetchFHIR(nextPath);
    const entries = (bundle.entry || []).map((entry) => entry.resource).filter(Boolean);
    const pageResources = [];

    entries.forEach((resource) => {
      if (!resource?.id || seenIds.has(String(resource.id))) return;
      seenIds.add(String(resource.id));
      pageResources.push(resource);
    });

    if (pageResources.length) {
      pages.push(pageResources);
    }

    finalNextPath = toFhirPath(findBundleLink(bundle, "next"));
    nextPath = finalNextPath;
    pageCount += 1;
  }

  const supplementTargetCount = Math.max(
    0,
    Math.max(targetCount - seededResources.length, Math.ceil(targetCount / 3))
  );
  const pagedResources = interleaveCandidatePages(pages, supplementTargetCount);

  return {
    resources: mergeUniqueResources([...seededResources, ...pagedResources]).slice(0, targetCount),
    nextPath: finalNextPath
  };
}

function interleaveCandidatePages(pages, targetCount) {
  const queues = (pages || []).map((page) => page.slice());
  const selected = [];

  while (selected.length < targetCount) {
    let addedInRound = 0;

    queues.forEach((queue) => {
      if (!queue.length || selected.length >= targetCount) return;
      selected.push(queue.shift());
      addedInRound += 1;
    });

    if (!addedInRound) break;
  }

  return selected;
}

async function fetchDepartmentSeedPatientResources(targetCount) {
  const seedGroups = new Map();
  const selectedIds = [];
  const selectedIdSet = new Set();

  for (const search of DEPARTMENT_SEED_SEARCHES) {
    const conditions = await safeFetchResources(
      `/Condition?code:text=${encodeURIComponent(search.term)}&_count=${search.count}&_elements=subject,code`
    );
    const patientIds = unique(
      conditions
        .map((condition) => extractReferenceId(condition?.subject?.reference))
        .filter(Boolean)
    );
    const existingIds = seedGroups.get(search.department) || [];
    seedGroups.set(search.department, unique([...existingIds, ...patientIds]));
  }

  while (selectedIds.length < targetCount) {
    let addedInRound = 0;

    DEPARTMENT_SEED_SEARCHES.forEach((search) => {
      if (selectedIds.length >= targetCount) return;
      const group = seedGroups.get(search.department) || [];
      while (group.length) {
        const nextId = String(group.shift() || "").trim();
        if (!nextId || selectedIdSet.has(nextId)) continue;
        selectedIds.push(nextId);
        selectedIdSet.add(nextId);
        addedInRound += 1;
        break;
      }
    });

    if (!addedInRound) break;
  }

  return fetchPatientResourcesByIds(selectedIds);
}

async function fetchPatientResourcesByIds(ids) {
  const resourceMap = new Map();
  const safeIds = unique((ids || []).map((id) => String(id || "").trim()).filter(Boolean));

  for (let index = 0; index < safeIds.length; index += PATIENT_BATCH_FETCH_SIZE) {
    const batch = safeIds.slice(index, index + PATIENT_BATCH_FETCH_SIZE);
    if (!batch.length) continue;
    const bundle = await fetchFHIR(`/Patient?_id=${encodeURIComponent(batch.join(","))}&_count=${batch.length}&_elements=id,name,gender,birthDate`);
    (bundle.entry || [])
      .map((entry) => entry.resource)
      .filter(Boolean)
      .forEach((resource) => {
        if (resource?.id) {
          resourceMap.set(String(resource.id), resource);
        }
      });
  }

  return safeIds.map((id) => resourceMap.get(id)).filter(Boolean);
}

function extractReferenceId(reference) {
  const source = String(reference || "").trim();
  if (!source.includes("/")) return source || "";
  return source.split("/").pop() || "";
}

function mergeUniqueResources(resources) {
  const merged = [];
  const seenIds = new Set();

  (resources || []).forEach((resource) => {
    const id = String(resource?.id || "").trim();
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    merged.push(resource);
  });

  return merged;
}

async function buildPatientListProfiles(resources) {
  return mapInBatches(resources || [], 8, async (resource, index) => {
    const summary = normalizePatientSummary(resource, index);
    if (!summary) return null;

    const conditions = await safeFetchResources(`/Condition?patient=${encodeURIComponent(resource.id)}&_count=12`);
    const diagnosisList = unique(sortDesc(conditions, conditionDate).map(conditionLabel)).slice(0, 4);
    const department = inferClinicalDepartment(diagnosisList);
    const wardAssignment = buildSyntheticWardAssignment(resource.id, index + 1, {
      department,
      diagnosisList
    });

    return {
      ...summary,
      room: wardAssignment.room,
      ward: wardAssignment.ward,
      department,
      diagnosis: diagnosisList[0] || `${department} synthetic case`,
      doctor: buildSyntheticDoctorTeam(department, wardAssignment.ward),
      sourceDiagnosisCount: diagnosisList.length,
      clinicalQualityScore: buildClinicalQualityScore({
        diagnosisList,
        department
      })
    };
  }).then((items) => items.filter(Boolean));
}

async function mapInBatches(items, batchSize, mapper) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item, batchIndex) => mapper(item, index + batchIndex)));
    results.push(...batchResults);
  }

  return results;
}

function selectBalancedPatientProfiles(profiles, count) {
  const candidates = (profiles || []).filter(Boolean);
  const usableProfiles = candidates.filter((profile) => Number(profile?.sourceDiagnosisCount || 0) > 0);
  const reserveProfiles = candidates.filter((profile) => Number(profile?.sourceDiagnosisCount || 0) <= 0);
  const wardTargets = buildWardSelectionTargets(count);
  const departmentCaps = buildDepartmentSelectionCaps(candidates, count);
  const selected = [];
  const selectedIds = new Set();
  const selectedWardCounts = new Map();
  const selectedDepartmentCounts = new Map();
  const wardGroups = buildWardProfileGroups(usableProfiles);

  while (selected.length < count) {
    let addedInRound = 0;

    WARD_DISPLAY_ORDER.forEach((ward) => {
      if (selected.length >= count) return;
      const target = wardTargets.get(ward) || 0;
      if ((selectedWardCounts.get(ward) || 0) >= target) return;

      const nextPatient = takeNextSelectableProfile(
        wardGroups.get(ward),
        selectedDepartmentCounts,
        departmentCaps,
        false
      );
      if (!nextPatient) return;

      registerSelectedProfile(nextPatient, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
      addedInRound += 1;
    });

    if (!addedInRound) break;
  }

  if (selected.length < count) {
    WARD_DISPLAY_ORDER.forEach((ward) => {
      while (selected.length < count) {
        const nextPatient = takeNextSelectableProfile(
          wardGroups.get(ward),
          selectedDepartmentCounts,
          departmentCaps,
          false
        );
        if (!nextPatient) break;
        registerSelectedProfile(nextPatient, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
      }
    });
  }

  if (selected.length < count) {
    WARD_DISPLAY_ORDER.forEach((ward) => {
      while (selected.length < count) {
        const nextPatient = takeNextSelectableProfile(
          wardGroups.get(ward),
          selectedDepartmentCounts,
          departmentCaps,
          true
        );
        if (!nextPatient) break;
        registerSelectedProfile(nextPatient, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
      }
    });
  }

  if (selected.length < count) {
    reserveProfiles
      .sort(compareClinicalProfiles)
      .forEach((profile) => {
        if (selected.length >= count || selectedIds.has(String(profile.id))) return;
        registerSelectedProfile(profile, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
      });
  }

  return selected.slice(0, count);
}

function buildStablePatientSortKey(id) {
  return buildSyntheticCode(id);
}

function buildClinicalQualityScore(input = {}) {
  const diagnosisList = input.diagnosisList || [];
  const department = String(input.department || "").trim();
  let score = Math.min(4, diagnosisList.length) * 10;
  if (department && department !== "일반내과") score += 8;
  if (department === "이비인후과") score -= 4;
  if (diagnosisList.some((item) => ICU_DIAGNOSIS_PATTERN.test(String(item || "")))) score += 12;
  return score;
}

function compareClinicalProfiles(left, right) {
  const scoreDelta = Number(right?.clinicalQualityScore || 0) - Number(left?.clinicalQualityScore || 0);
  if (scoreDelta !== 0) return scoreDelta;

  const departmentDelta = getDepartmentSortIndex(left?.department) - getDepartmentSortIndex(right?.department);
  if (departmentDelta !== 0) return departmentDelta;

  return buildStablePatientSortKey(left?.id).localeCompare(buildStablePatientSortKey(right?.id), "en");
}

function getDepartmentSortIndex(department) {
  const normalized = String(department || "").trim();
  const fixedIndex = DEPARTMENT_PRIORITY_ORDER.indexOf(normalized);
  return fixedIndex >= 0 ? fixedIndex : DEPARTMENT_PRIORITY_ORDER.length + 1;
}

function buildWardProfileGroups(profiles) {
  const groups = new Map();
  WARD_DISPLAY_ORDER.forEach((ward) => groups.set(ward, []));

  (profiles || []).forEach((profile) => {
    const ward = String(profile?.ward || "내과병동").trim() || "내과병동";
    if (!groups.has(ward)) groups.set(ward, []);
    groups.get(ward).push(profile);
  });

  groups.forEach((items, ward) => {
    groups.set(ward, items.slice().sort(compareClinicalProfiles));
  });

  return groups;
}

function buildWardSelectionTargets(count) {
  const targets = new Map();
  let allocated = 0;

  WARD_DISPLAY_ORDER.forEach((ward) => {
    const rawTarget = Math.max(1, Math.round(count * (WARD_TARGET_RATIO[ward] || 0)));
    targets.set(ward, rawTarget);
    allocated += rawTarget;
  });

  while (allocated > count) {
    const ward = WARD_DISPLAY_ORDER
      .slice()
      .sort((left, right) => (targets.get(right) || 0) - (targets.get(left) || 0))
      .find((item) => (targets.get(item) || 0) > 1);
    if (!ward) break;
    targets.set(ward, (targets.get(ward) || 0) - 1);
    allocated -= 1;
  }

  while (allocated < count) {
    const ward = WARD_DISPLAY_ORDER
      .slice()
      .sort((left, right) => (targets.get(left) || 0) - (targets.get(right) || 0))[0];
    targets.set(ward, (targets.get(ward) || 0) + 1);
    allocated += 1;
  }

  return targets;
}

function buildDepartmentSelectionCaps(profiles, count) {
  const groups = new Map();
  (profiles || []).forEach((profile) => {
    const department = String(profile?.department || "일반내과").trim() || "일반내과";
    if (!groups.has(department)) groups.set(department, 0);
    groups.set(department, groups.get(department) + 1);
  });

  const distinctDepartmentCount = Math.max(1, groups.size);
  const baseCap = Math.max(3, Math.ceil(count / Math.min(8, distinctDepartmentCount)) + 1);
  const caps = new Map();

  groups.forEach((availableCount, department) => {
    let cap = Math.min(availableCount, baseCap);
    if (department === "이비인후과") {
      cap = Math.min(cap, Math.max(3, Math.ceil(count / 10)));
    }
    if (department === "일반내과") {
      cap = Math.min(cap, Math.max(4, Math.ceil(count / 8)));
    }
    caps.set(department, cap);
  });

  return caps;
}

function takeNextSelectableProfile(group, selectedDepartmentCounts, departmentCaps, allowOverflow) {
  if (!Array.isArray(group) || !group.length) return null;

  for (let index = 0; index < group.length; index += 1) {
    const profile = group[index];
    const department = String(profile?.department || "일반내과").trim() || "일반내과";
    const currentCount = selectedDepartmentCounts.get(department) || 0;
    const cap = departmentCaps.get(department) || Number.MAX_SAFE_INTEGER;
    if (!allowOverflow && currentCount >= cap) continue;
    group.splice(index, 1);
    return profile;
  }

  if (!allowOverflow) return null;
  return group.shift() || null;
}

function registerSelectedProfile(profile, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts) {
  if (!profile || selectedIds.has(String(profile.id))) return;
  selected.push(profile);
  selectedIds.add(String(profile.id));

  const ward = String(profile.ward || "내과병동").trim() || "내과병동";
  const department = String(profile.department || "일반내과").trim() || "일반내과";
  selectedWardCounts.set(ward, (selectedWardCounts.get(ward) || 0) + 1);
  selectedDepartmentCounts.set(department, (selectedDepartmentCounts.get(department) || 0) + 1);
}

async function fetchPatientDetail(id) {
  const patient = await fetchFHIR(`/Patient/${encodeURIComponent(id)}`);

  const [
    encounters,
    conditions,
    observations,
    medications,
    administrations,
    allergies,
    procedures,
    reports,
    serviceRequests,
    carePlans,
    documents,
    devices
  ] = await Promise.all([
    safeFetchResources(`/Encounter?patient=${encodeURIComponent(id)}&_count=20&_sort=-date`),
    safeFetchResources(`/Condition?patient=${encodeURIComponent(id)}&_count=50`),
    safeFetchResources(`/Observation?subject=${encodeURIComponent(id)}&_count=200&_sort=-date`),
    safeFetchResources(`/MedicationRequest?patient=${encodeURIComponent(id)}&_count=50`),
    safeFetchResources(`/MedicationAdministration?patient=${encodeURIComponent(id)}&_count=50&_sort=-effective-time`),
    safeFetchResources(`/AllergyIntolerance?patient=${encodeURIComponent(id)}&_count=20`),
    safeFetchResources(`/Procedure?patient=${encodeURIComponent(id)}&_count=30`),
    safeFetchResources(`/DiagnosticReport?patient=${encodeURIComponent(id)}&_count=30`),
    safeFetchResources(`/ServiceRequest?patient=${encodeURIComponent(id)}&_count=30`),
    safeFetchResources(`/CarePlan?patient=${encodeURIComponent(id)}&_count=20`),
    safeFetchResources(`/DocumentReference?patient=${encodeURIComponent(id)}&_count=20`),
    safeFetchResources(`/Device?patient=${encodeURIComponent(id)}&_count=20`)
  ]);

  return normalizePatientDetail({
    patient,
    encounters,
    conditions,
    observations,
    medications,
    administrations,
    allergies,
    procedures,
    reports,
    serviceRequests,
    carePlans,
    documents,
    devices
  });
}

async function fetchFHIR(path) {
  const targetUrl = /^https?:\/\//i.test(String(path || ""))
    ? String(path)
    : `${FHIR_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FHIR_FETCH_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(targetUrl, {
      headers: { accept: "application/fhir+json" },
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`FHIR request timed out after ${FHIR_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`FHIR request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function findBundleLink(bundle, relation) {
  return (bundle?.link || []).find((link) => link?.relation === relation)?.url || "";
}

function toFhirPath(url) {
  const source = String(url || "").trim();
  if (!source) return "";
  if (source.startsWith(FHIR_BASE_URL)) {
    return source.slice(FHIR_BASE_URL.length);
  }
  if (source.startsWith("/")) {
    return source;
  }
  return source;
}

function encodePatientCursor(path) {
  return Buffer.from(String(path || ""), "utf8").toString("base64url");
}

function decodePatientCursor(cursor) {
  try {
    const decoded = Buffer.from(String(cursor || ""), "base64url").toString("utf8");
    return decoded || "";
  } catch (error) {
    throw new Error(`Invalid patient cursor: ${error.message}`);
  }
}

async function safeFetchResources(path) {
  try {
    const bundle = await fetchFHIR(path);
    return (bundle.entry || []).map((entry) => entry.resource).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function normalizePatientSummary(resource, index) {
  if (!resource || !resource.id) return null;
  const wardAssignment = buildSyntheticWardAssignment(resource.id, index + 1);

  return {
    id: resource.id,
    room: wardAssignment.room,
    ward: wardAssignment.ward,
    name: buildSyntheticPatientLabel(resource.id, index + 1),
    registrationNo: buildSyntheticRegistrationNo(resource.id),
    gender: toGender(resource.gender),
    age: resource.birthDate ? String(calculateAge(resource.birthDate)) : "-",
    department: "일반내과",
    diagnosis: "외부 FHIR 환자",
    admitDate: "-",
    bloodType: "-",
    bodyInfo: "-",
    doctor: buildSyntheticDoctorTeam("일반내과", wardAssignment.ward),
    isolation: "-",
    external: true
  };
}

function normalizePatientDetail(data) {
  const latestEncounter = sortDesc(data.encounters, encounterDate)[0];
  const conditions = sortDesc(data.conditions, conditionDate);
  const observations = sortDesc(data.observations, observationDateTime);
  const reports = sortDesc(data.reports, reportDate);
  const procedures = sortDesc(data.procedures, procedureDate);
  const medications = sortDesc(data.medications, medicationDate);
  const serviceRequests = sortDesc(data.serviceRequests, serviceRequestDate);
  const carePlans = sortDesc(data.carePlans, carePlanDate);
  const documents = sortDesc(data.documents, documentDate);

  const diagnosisList = unique(conditions.map(conditionLabel)).slice(0, 10);
  const department = inferClinicalDepartment(diagnosisList);
  const wardAssignment = buildSyntheticWardAssignment(data.patient.id, 0, {
    department,
    diagnosisList
  });
  const pastHistory = unique(conditions.map(conditionHistoryLabel)).slice(0, 10);
  const allergyList = unique(data.allergies.map(allergyLabel)).slice(0, 10);
  const procedureList = unique(procedures.map(procedureLabel)).slice(0, 10);
  const reportList = unique(reports.map(reportLabel)).slice(0, 10);
  const timelineDates = buildTimelineDates(data, latestEncounter);
  const dateMap = buildSourceDateMap(data, timelineDates);
  const medicationOrders = buildMedicationOrders(medications, data.administrations);
  const lineTube = buildLineTubeSummary(data.devices, procedures, serviceRequests, observations);
  const observationSummary = summarizeObservations(observations, dateMap);
  const dailyData = buildDailyData({
    dates: timelineDates,
    dateMap,
    diagnosisList,
    pastHistory,
    allergyList,
    procedureList,
    reportList,
    medicationOrders,
    conditions,
      medications,
      observations,
      administrations: data.administrations,
    reports,
    procedures,
    lineTube,
    observationSummary,
    serviceRequests,
    carePlans,
    documents,
    latestEncounter
  });

  return {
    id: data.patient.id,
    room: wardAssignment.room,
    ward: wardAssignment.ward,
    name: buildSyntheticPatientLabel(data.patient.id),
    registrationNo: buildSyntheticRegistrationNo(data.patient.id),
    gender: toGender(data.patient.gender),
    age: data.patient.birthDate ? String(calculateAge(data.patient.birthDate)) : "-",
    department,
    diagnosis: diagnosisList[0] || "FHIR 진단 정보 없음",
    admitDate: encounterDate(latestEncounter) || timelineDates[0],
    bloodType: findBloodType(observations),
    bodyInfo: buildBodyInfo(observationSummary.latestVital),
    doctor: buildSyntheticDoctorTeam(department, wardAssignment.ward),
    isolation: findIsolation(serviceRequests, conditions, documents),
    admitReason: findAdmitReason(latestEncounter, diagnosisList, procedures),
    admissionNote: buildAdmissionNote(latestEncounter, diagnosisList, allergyList, procedureList, reportList, serviceRequests, documents),
    pastHistory,
    allergies: allergyList,
    caution: allergyList[0] || findIsolation(serviceRequests, conditions, documents),
    dailyData,
    external: true,
    source: "smart-health-it-sandbox-synthetic",
    policy: buildPublicDataPolicyMetadata({
      selectedBaseUrl: FHIR_BASE_URL
    })
  };
}

function buildDailyData(input) {
  const dayMap = {};

  input.dates.forEach((date, index) => {
    const fallbackVital = input.observationSummary.latestVital || defaultVital();
    const dayVital = input.observationSummary.vitalsByDate[date] || varyVital(fallbackVital, index - (input.dates.length - 1));
    dayMap[date] = {
      pastHistory: input.pastHistory.slice(0, 8),
      nursingProblem: buildNursingProblemText(
        dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
        dailyServiceRequests,
        dailyCarePlans
      ),
      handover: {
        lines: dailyLineTube.lines,
        tubes: dailyLineTube.tubes,
        drains: dailyLineTube.drains,
        drugs: dailyMedicationOrders.running,
        vent: dailyLineTube.vent,
        neuro: buildNeuroItems(dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList, dailyCarePlans),
        etc: input.allergyList.slice(0, 2).map((text) => ({ text, detail: "알레르기 / 주의" }))
      },
      hourly: buildHourlyTimeline(date, dayVital, input.observationSummary.eventsByDate[date] || []),
      io: input.observationSummary.ioByDate[date] || { input: "-", totalOutput: "-" },
      activity: findActivity(dailyCarePlans.length ? dailyCarePlans : input.carePlans, input.latestEncounter),
      orders: {
        inj: dailyMedicationOrders.inj,
        po: dailyMedicationOrders.po
      },
      labs: input.observationSummary.labsByDate[date] || input.observationSummary.latestLabs || {},
      specials: buildSpecialsForDate(dailyReports, dailyProcedures, dailyDocuments),
      docOrders: buildDoctorOrders(dailyMedicationOrders, dailyServiceRequests, dailyCarePlans),
      medSchedule: buildMedicationSchedule(dailyMedicationOrders),
      todoList: buildTodoList(
        dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
        dailyServiceRequests,
        dailyCarePlans,
        date,
        input.dates[input.dates.length - 1]
      ),
      nursingTasks: buildNursingTasks(input.lineTube, dailyCarePlans, dailyDocuments),
      plan: buildPlanItems(dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList, dailyCarePlans, dailyServiceRequests),
      consults: buildConsults(dailyServiceRequests, dailyCarePlans),
      tMax: Number(dayVital.bt),
      vital: dayVital
    };
  });

  propagateLabs(dayMap, input.dates);
  return dayMap;
}

function summarizeObservations(observations, dateMap = {}) {
  const latestVital = {};
  const vitalsByDate = {};
  const labsByDate = {};
  const eventsByDate = {};
  const ioByDate = {};

  observations.forEach((observation) => {
    const date = remapTimelineDate(observationDate(observation), dateMap) || todayIso();
    const time = observationTime(observation) || "08:00";
    const label = observationLabel(observation);
    const value = observationValue(observation);
    if (!label || !value) return;

    const codes = codingCodes(observation.code);
    updateVitalValues(latestVital, codes, observation, value);

    if (isVitalObservation(codes)) {
      if (!vitalsByDate[date]) vitalsByDate[date] = defaultVital();
      updateVitalValues(vitalsByDate[date], codes, observation, value);
    }

    if (isLabObservation(observation)) {
      if (!labsByDate[date]) labsByDate[date] = {};
      const category = mapLabCategory(label);
      if (!labsByDate[date][category]) labsByDate[date][category] = {};
      labsByDate[date][category][normalizeLabLabel(label)] = formatNumericValue(value);
    }

    if (/input/i.test(label)) {
      if (!ioByDate[date]) ioByDate[date] = { input: "-", totalOutput: "-" };
      ioByDate[date].input = value;
    }
    if (/output|urine|drain/i.test(label)) {
      if (!ioByDate[date]) ioByDate[date] = { input: "-", totalOutput: "-" };
      ioByDate[date].totalOutput = value;
    }

    if (!eventsByDate[date]) eventsByDate[date] = [];
    if (isVitalObservation(codes) || isLabObservation(observation) || hasInterpretation(observation)) {
      eventsByDate[date].push({
        time,
        note: `${label}: ${value}`,
        event: hasInterpretation(observation) ? label : ""
      });
    }
  });

  return {
    latestVital: finalizeVital(latestVital),
    latestLabs: latestLabs(labsByDate),
    vitalsByDate: mapValues(vitalsByDate, finalizeVital),
    labsByDate,
    eventsByDate,
    ioByDate
  };
}

function buildMedicationOrders(medications, administrations) {
  const adminMap = {};
  administrations.forEach((item) => {
    const label = medicationAdministrationLabel(item);
    if (label && !adminMap[label]) adminMap[label] = item;
  });

  const all = medications.map((medication) => {
    const label = medicationLabel(medication);
    const detail = [
      dosageText(medication),
      medication.status || "",
      adminMap[label] ? `투약:${adminMap[label].status || "-"}` : ""
    ].filter(Boolean).join(" / ");

    return {
      text: label,
      detail: detail || "FHIR 처방",
      prn: isPrnMedication(medication)
    };
  }).filter((item) => item.text);

  return {
    all,
    inj: all.filter((item) => isInjectionLike(item)).map(toDisplayItem),
    po: all.filter((item) => !isInjectionLike(item)).map(toDisplayItem),
    running: all.filter((item) => /iv|infusion|drip|pump|continuous/i.test(`${item.text} ${item.detail}`)).map(toDisplayItem)
  };
}

function buildLineTubeSummary(devices, procedures, serviceRequests, observations) {
  const buckets = { lines: [], tubes: [], drains: [], vent: [] };
  const add = (sourceType, label, detail) => {
    const bucket = classifyClinicalStatusBucket(sourceType, label, detail);
    if (!bucket) return;
    buckets[bucket].push({ text: label, detail: detail || "FHIR 정보" });
  };

  devices
    .filter((device) => isCurrentStatus(device.status))
    .forEach((device) => add("device", deviceLabel(device), device.status || ""));
  procedures
    .filter((procedure) => isCurrentStatus(procedure.status))
    .forEach((procedure) => add("procedure", procedureLabel(procedure), procedure.status || ""));
  serviceRequests
    .filter((request) => isCurrentStatus(request.status))
    .forEach((request) => add("service_request", serviceRequestLabel(request), request.status || ""));
  observations.forEach((observation) => {
    add("observation", observationLabel(observation), observationValue(observation));
  });

  return {
    lines: dedupeItems(buckets.lines),
    tubes: dedupeItems(buckets.tubes),
    drains: dedupeItems(buckets.drains),
    vent: dedupeItems(buckets.vent)
  };
}

function buildDailyLineTubeSummary(input = {}) {
  const buckets = { lines: [], tubes: [], drains: [], vent: [] };
  const addItems = (key, items) => {
    (items || []).forEach((item) => {
      if (item?.text) buckets[key].push(item);
    });
  };

  const resourceSummary = buildLineTubeSummary(
    [],
    input.procedures || [],
    input.serviceRequests || [],
    input.observations || []
  );

  addItems("lines", resourceSummary.lines);
  addItems("tubes", resourceSummary.tubes);
  addItems("drains", resourceSummary.drains);
  addItems("vent", resourceSummary.vent);

  inferLineTubeFromMedicationOrders(buckets, input.medicationOrders);
  inferLineTubeFromCarePlans(buckets, input.carePlans);

  if (input.useBaseFallback) {
    if (!buckets.lines.length) addItems("lines", input.baseLineTube?.lines || []);
    if (!buckets.tubes.length) addItems("tubes", input.baseLineTube?.tubes || []);
    if (!buckets.drains.length) addItems("drains", input.baseLineTube?.drains || []);
    if (!buckets.vent.length) addItems("vent", input.baseLineTube?.vent || []);
  }

  return {
    lines: dedupeItems(buckets.lines).slice(0, 1),
    tubes: dedupeItems(buckets.tubes).slice(0, 1),
    drains: dedupeItems(buckets.drains).slice(0, 1),
    vent: dedupeItems(buckets.vent).slice(0, 1)
  };
}

function inferLineTubeFromMedicationOrders(buckets, medicationOrders) {
  const candidates = [
    ...(medicationOrders?.running || []),
    ...(medicationOrders?.inj || [])
  ];

  candidates.forEach((item) => {
    const text = normalizeClinicalText(`${item?.text || ""} ${item?.detail || ""}`);
    if (!text) return;

    if (/picc/.test(text)) {
      buckets.lines.push({ text: "PICC", detail: item.text || item.detail || "medication support" });
      return;
    }

    if (/port|chemo port|implanted port/.test(text)) {
      buckets.lines.push({ text: "Implanted port", detail: item.text || item.detail || "medication support" });
      return;
    }

    if (/central line|cvc|midline/.test(text)) {
      buckets.lines.push({ text: "Central line", detail: item.text || item.detail || "medication support" });
      return;
    }

    if (/iv|infusion|drip|pump|continuous|tpn|loading/.test(text)) {
      buckets.lines.push({ text: "Peripheral IV", detail: item.text || item.detail || "IV therapy" });
      return;
    }

    if (/oxygen|nasal cannula|mask|hfnc|high flow|ventilator|trach|bipap|cpap|ecmo/.test(text) && !/room air/.test(text)) {
      buckets.vent.push({ text: "Oxygen support", detail: item.text || item.detail || "respiratory support" });
    }
  });
}

function inferLineTubeFromCarePlans(buckets, carePlans) {
  (carePlans || []).forEach((item) => {
    const title = normalizeClinicalText(carePlanTitle(item));
    if (!title) return;

    if (/foley|urinary catheter|catheter care/.test(title)) {
      buckets.tubes.push({ text: "Foley catheter", detail: carePlanTitle(item) });
    } else if (/ng|l-tube|feeding tube|peg|g-tube/.test(title)) {
      buckets.tubes.push({ text: "Feeding tube", detail: carePlanTitle(item) });
    } else if (/jp drain|drain|hemovac|pcd|chest tube/.test(title)) {
      buckets.drains.push({ text: "Drain", detail: carePlanTitle(item) });
    } else if (/oxygen|nasal cannula|mask|ventilator|trach|hfnc|bipap|cpap/.test(title)) {
      buckets.vent.push({ text: "Oxygen support", detail: carePlanTitle(item) });
    }
  });
}

function classifyClinicalStatusBucket(sourceType, label, detail) {
  const text = normalizeClinicalText(`${label || ""} ${detail || ""}`);
  if (!text) return "";

  const genericExclusions = [
    /\bct\b/,
    /\bmri\b/,
    /x-ray/,
    /ultrasound/,
    /\bscan\b/,
    /\bpanel\b/,
    /\bculture\b/,
    /\blipid\b/,
    /complete blood count/,
    /documentation/,
    /\bencounter\b/,
    /\bconsult\b/,
    /\bcontrast\b/,
    /\bstent\b/,
    /arterial blood/,
    /oxygen saturation/,
    /\bspo2\b/
  ];
  if (genericExclusions.some((pattern) => pattern.test(text))) return "";

  const ventPatterns = [
    /ventilator/,
    /\bvent\b/,
    /trach/,
    /tracheost/,
    /intubat/,
    /nasal cannula/,
    /non-rebreather/,
    /\bhfnc\b/,
    /high flow/,
    /\becmo\b/,
    /\bcpap\b/,
    /\bbipap\b/,
    /oxygen therapy/,
    /\bo2\b/,
    /oxygen/
  ];
  const linePatterns = [
    /peripheral iv/,
    /\bmidline\b/,
    /\bpicc\b/,
    /central line/,
    /\bcvc\b/,
    /\bport\b/,
    /arterial line/,
    /\ba-line\b/,
    /\biv\b/
  ];
  const tubePatterns = [
    /\bfoley\b/,
    /\bcatheter\b/,
    /\bng\b/,
    /\bog\b/,
    /\bpeg\b/,
    /\bg-tube\b/,
    /feeding tube/,
    /urinary catheter/,
    /\btube\b/
  ];
  const drainPatterns = [
    /\bdrain\b/,
    /hemovac/,
    /\bjp\b/,
    /jackson-pratt/,
    /chest tube/,
    /biliary drain/,
    /nephrostomy/
  ];
  const explicitDevicePatterns = [...ventPatterns, ...linePatterns, ...tubePatterns, ...drainPatterns];

  if (sourceType === "service_request" && !explicitDevicePatterns.some((pattern) => pattern.test(text))) {
    return "";
  }

  if (sourceType === "procedure") {
    const procedureNoise = [/injection/, /\biud\b/, /documentation/, /\bstent\b/];
    if (procedureNoise.some((pattern) => pattern.test(text)) && !explicitDevicePatterns.some((pattern) => pattern.test(text))) {
      return "";
    }
  }

  if (ventPatterns.some((pattern) => pattern.test(text))) return "vent";
  if (drainPatterns.some((pattern) => pattern.test(text))) return "drains";
  if (tubePatterns.some((pattern) => pattern.test(text))) return "tubes";
  if (linePatterns.some((pattern) => pattern.test(text))) return "lines";

  return "";
}

function normalizeClinicalText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function inferClinicalDepartment(diagnosisList) {
  const source = normalizeClinicalText((diagnosisList || []).join(" / "));
  if (!source) return "일반내과";

  if (/stroke|cerebral|concussion|brain|neuro|seizure|hemiplegia|aphasia|parkinson|dementia/.test(source)) {
    return "신경과";
  }

  if (/sinusitis|pharyngitis|tonsillitis|otitis|rhinitis|laryng|bronchitis|pneumonia|copd|asthma/.test(source)) {
    return /sinusitis|pharyngitis|tonsillitis|otitis|rhinitis|laryng/.test(source) ? "이비인후과" : "호흡기내과";
  }

  if (/cancer|carcinoma|neoplasm|tumor|lymphoma|leukemia|pancreatic ca|rectal ca/.test(source)) {
    return "종양내과";
  }

  if (/fracture|sprain|strain|injury|trauma|whiplash|laceration|wound|postop|post-op|surgery|hernia|appendic|arthr|joint|spine/.test(source)) {
    return "외과";
  }

  if (/kidney|renal|uti|urinary|pyeloneph|prostate|bladder/.test(source)) {
    return "신장비뇨의학과";
  }

  if (/diabetes|thyroid|adrenal|hyperglycemia|hypoglycemia/.test(source)) {
    return "내분비내과";
  }

  if (/angina|myocard|heart failure|arrhythm|coronary|cardiac/.test(source)) {
    return "순환기내과";
  }

  if (/hepatitis|cirrhosis|gastritis|colitis|crohn|ulcer|liver|pancreatitis|bowel|rectal|colon|abdomen/.test(source)) {
    return "소화기내과";
  }

  if (/infection|sepsis|cellulitis|fever|abscess/.test(source)) {
    return "감염내과";
  }

  if (/rehab|gait|deconditioning|mobility|self care deficit|weakness/.test(source)) {
    return "재활의학과";
  }

  return "일반내과";
}

function buildHourlyTimeline(date, dayVital, events) {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    time: `${String(hour).padStart(2, "0")}:00`,
    vital: dayVital,
    event: "",
    notes: []
  }));

  events.slice(0, 16).forEach((event) => {
    const hour = clampHour(event.time);
    hourly[hour].notes.push(event.note);
    if (event.event && !hourly[hour].event) hourly[hour].event = event.event;
  });

  hourly.forEach((slot, index) => {
    if (!slot.notes.length && index % 6 === 0) {
      slot.notes.push("FHIR 경과 모니터링 기록");
    }
  });

  return hourly;
}

function buildDoctorOrders(medicationOrders, serviceRequests, carePlans) {
  const routine = unique([
    ...medicationOrders.all.filter((item) => !item.prn).map((item) => item.text),
    ...serviceRequests.map((item) => serviceRequestLabel(item)),
    ...carePlans.map((item) => carePlanTitle(item))
  ]).slice(0, 12);

  const prn = unique([
    ...medicationOrders.all.filter((item) => item.prn).map((item) => item.text),
    ...serviceRequests
      .map((item) => serviceRequestLabel(item))
      .filter((text) => /prn|as needed|notify/i.test(text))
  ]).slice(0, 8);

  return { routine, prn };
}

function buildMedicationSchedule(medicationOrders) {
  return medicationOrders.all.slice(0, 8).map((item) => ({
    time: inferMedicationTime(item.detail),
    name: item.text,
    detail: item.detail
  }));
}

function inferMedicationTime(detail) {
  const text = String(detail || '').toUpperCase();
  if (text.includes('BID')) return '09:00 / 21:00';
  if (text.includes('TID')) return '09:00 / 13:00 / 18:00';
  if (text.includes('QID')) return '09:00 / 13:00 / 17:00 / 21:00';
  if (text.includes('HS')) return '22:00';
  if (text.includes('PRN')) return '필요시';
  if (text.includes('IV')) return '정규 시간 확인';
  return '09:00';
}

function buildTodoList(diagnosisList, serviceRequests, carePlans, date, todayDate) {
  const items = [];

  diagnosisList.slice(0, 2).forEach((text) => {
    items.push({ text: "진단 경과 확인", detail: text, isToday: date === todayDate });
  });

  serviceRequests.slice(0, 3).forEach((item) => {
    items.push({ text: serviceRequestLabel(item), detail: item.status || "요청 상태 확인", isToday: date === todayDate });
  });

  carePlans.slice(0, 2).forEach((item) => {
    items.push({ text: "간호계획 확인", detail: carePlanTitle(item), isToday: false });
  });

  return items.slice(0, 6);
}

function buildNursingTasks(lineTube, carePlans, documents) {
  const tasks = [];

  lineTube.lines.slice(0, 2).forEach((item) => tasks.push({ text: "라인 상태 확인", detail: item.text }));
  lineTube.tubes.slice(0, 2).forEach((item) => tasks.push({ text: "튜브 상태 확인", detail: item.text }));
  carePlans.slice(0, 2).forEach((item) => tasks.push({ text: "간호계획 수행 확인", detail: carePlanTitle(item) }));
  documents.slice(0, 2).forEach((item) => tasks.push({ text: "문서 기록 확인", detail: documentTitle(item) }));

  return tasks.slice(0, 6);
}

function buildPlanItems(diagnosisList, carePlans, serviceRequests) {
  return unique([
    ...diagnosisList.slice(0, 3).map((text) => `${text} 경과 관찰`),
    ...carePlans.slice(0, 3).map((item) => carePlanTitle(item)),
    ...serviceRequests.slice(0, 3).map((item) => serviceRequestLabel(item))
  ]).slice(0, 8);
}

function buildConsults(serviceRequests, carePlans) {
  return unique([
    ...serviceRequests.slice(0, 3).map((item) => serviceRequestLabel(item)),
    ...carePlans.slice(0, 2).map((item) => carePlanTitle(item))
  ]).join(", ") || "-";
}

function buildSpecialsForDate(reports, procedures, documents) {
  return unique([
    ...(reports || []).map((item) => reportLabel(item)).slice(0, 3),
    ...(procedures || []).map((item) => procedureLabel(item)).slice(0, 3),
    ...(documents || []).map((item) => documentTitle(item)).slice(0, 2)
  ]).slice(0, 8);
}

function buildNeuroItems(diagnosisList, carePlans) {
  const items = [];
  diagnosisList.forEach((text) => {
    if (/stroke|brain|cerebral|neuro|seizure/i.test(text)) {
      items.push({ text, detail: "신경계 관찰 필요" });
    }
  });
  carePlans.forEach((item) => {
    const title = carePlanTitle(item);
    if (/neuro|gcs|pupil|의식/i.test(title)) {
      items.push({ text: title, detail: item.status || "care plan" });
    }
  });
  return items.slice(0, 4);
}

function findAdmitReason(encounter, diagnosisList, procedures) {
  return codeableText(encounter && encounter.reasonCode && encounter.reasonCode[0]) ||
    codeableText(encounter && encounter.type && encounter.type[0]) ||
    diagnosisList[0] ||
    (procedures[0] && procedureLabel(procedures[0])) ||
    "FHIR 입원동기 정보 없음";
}

function buildAdmissionNote(encounter, diagnosisList, allergyList, procedureList, reportList, serviceRequests, documents) {
  const parts = [];
  const encounterInfo = [
    codeableText(encounter && encounter.type && encounter.type[0]),
    codeableText(encounter && encounter.reasonCode && encounter.reasonCode[0]),
    encounter && encounter.period && encounter.period.start ? encounter.period.start.slice(0, 10) : ""
  ].filter(Boolean).join(" / ");

  if (encounterInfo) parts.push(`<b>입원정보</b>: ${encounterInfo}`);
  if (diagnosisList.length) parts.push(`<b>진단</b>: ${diagnosisList.slice(0, 4).join(", ")}`);
  if (allergyList.length) parts.push(`<b>알레르기</b>: ${allergyList.slice(0, 2).join(", ")}`);
  if (procedureList.length) parts.push(`<b>시술/수술</b>: ${procedureList.slice(0, 3).join(", ")}`);
  if (reportList.length) parts.push(`<b>검사/판독</b>: ${reportList.slice(0, 2).join(", ")}`);
  if (serviceRequests.length) parts.push(`<b>요청사항</b>: ${serviceRequests.slice(0, 3).map((item) => serviceRequestLabel(item)).join(", ")}`);
  if (documents.length) parts.push(`<b>문서</b>: ${documents.slice(0, 2).map((item) => documentTitle(item)).join(", ")}`);

  return parts.join("\n") || "외부 FHIR 기록에서 가져온 입원 정보";
}

function findActivity(carePlans, encounter) {
  const carePlanActivities = carePlans
    .flatMap((item) => item.activity || [])
    .map((activity) => codeableText(activity.detail && activity.detail.code) || activity.detail?.description || "")
    .map((text) => normalizeActivityText(text))
    .filter(Boolean);

  if (carePlanActivities.length) return carePlanActivities[0];

  const encounterActivity = normalizeActivityText(codeableText(encounter && encounter.type && encounter.type[0]));
  return encounterActivity || "-";
}

function normalizeActivityText(text) {
  const source = normalizeClinicalText(text);
  if (!source) return "";

  const exclusionPatterns = [
    /counsel/,
    /education/,
    /teaching/,
    /nutrition/,
    /diet/,
    /smoking/,
    /addiction/,
    /behavior/,
    /psych/,
    /therapy session/,
    /consult/,
    /documentation/,
    /screening/,
    /assessment/,
    /follow-up/,
    /blepharoplasty/,
    /cataract/,
    /medication/
  ];
  if (exclusionPatterns.some((pattern) => pattern.test(source))) return "";

  const activityPatterns = [
    /bed rest/,
    /rest/,
    /ambulat/,
    /out of bed/,
    /\boob\b/,
    /chair/,
    /wheelchair/,
    /walk/,
    /exercise/,
    /activity as tolerated/,
    /\baat\b/,
    /range of motion/,
    /\brom\b/,
    /weight bearing/,
    /mobil/,
    /turn/,
    /reposition/,
    /fall precaution/,
    /assist/,
    /progressive mobility/
  ];
  if (!activityPatterns.some((pattern) => pattern.test(source))) return "";

  return String(text || "").replace(/\s+/g, " ").trim();
}

function findIsolation(serviceRequests, conditions, documents) {
  const texts = unique([
    ...serviceRequests.map((item) => serviceRequestLabel(item)),
    ...conditions.map((item) => conditionLabel(item)),
    ...documents.map((item) => documentTitle(item))
  ]);

  return texts.find((text) => /contact|droplet|airborne|isolation|reverse/i.test(text)) || "-";
}

function findBloodType(observations) {
  const item = observations.find((observation) => /blood group|abo|rh/i.test(observationLabel(observation)));
  return item ? observationValue(item) : "-";
}

function buildBodyInfo(vital) {
  const weight = vital.weight ? `${Math.round(toNumber(vital.weight, 0))}kg` : "-";
  const height = vital.height ? `${Math.round(toNumber(vital.height, 0))}cm` : "-";
  return weight === "-" && height === "-" ? "-" : `${height}/${weight}`;
}

function encounterRoom(encounter) {
  return referenceText(encounter && encounter.location && encounter.location[0] && encounter.location[0].location) || "FHIR";
}

function encounterDoctor(encounter) {
  return referenceText(encounter && encounter.participant && encounter.participant[0] && encounter.participant[0].individual) || "-";
}

function buildTimelineDates(data, latestEncounter) {
  const today = new Date(`${todayIso()}T00:00:00+09:00`);
  const dates = [];
  for (let i = TIMELINE_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(normalizeDate(date));
  }
  return dates;
}

function buildSourceDateMap(data, timelineDates) {
  const sourceDates = unique([
    ...data.encounters.map(encounterDate),
    ...data.conditions.map(conditionDate),
    ...data.observations.map(observationDate),
    ...data.medications.map(medicationDate),
    ...data.administrations.map(administrationDate),
    ...data.procedures.map(procedureDate),
    ...data.reports.map(reportDate),
    ...data.serviceRequests.map(serviceRequestDate),
    ...data.carePlans.map(carePlanDate),
    ...data.documents.map(documentDate)
  ].filter(Boolean)).sort().slice(-timelineDates.length);

  const startIndex = Math.max(0, timelineDates.length - sourceDates.length);
  return Object.fromEntries(sourceDates.map((date, index) => [date, timelineDates[startIndex + index]]));
}

function remapTimelineDate(date, dateMap) {
  if (!date) return "";
  return dateMap && dateMap[date] ? dateMap[date] : date;
}

function toSeoulDate(date) {
  return new Date(`${date}T00:00:00+09:00`);
}

function dayDiff(laterDate, earlierDate) {
  if (!laterDate || !earlierDate) return Number.POSITIVE_INFINITY;
  return Math.round((toSeoulDate(laterDate).getTime() - toSeoulDate(earlierDate).getTime()) / 86400000);
}

function filterResourcesForDate(items, dateFn, targetDate, dateMap, options = {}) {
  const { mode = "exact", daysBack = 0, limit = 20 } = options;

  return sortDesc(
    (items || []).filter((item) => {
      const mappedDate = remapTimelineDate(dateFn(item), dateMap);
      if (!mappedDate) return false;
      if (mode === "exact") return mappedDate === targetDate;
      if (mappedDate > targetDate) return false;
      return dayDiff(targetDate, mappedDate) <= daysBack;
    }),
    (item) => remapTimelineDate(dateFn(item), dateMap)
  ).slice(0, limit);
}

function filterMedicationSetForDate(medications, administrations, date, dateMap) {
  const dailyAdministrations = filterResourcesForDate(
    administrations,
    administrationDate,
    date,
    dateMap,
    { mode: "exact", limit: 20 }
  );
  const exactMedications = filterResourcesForDate(
    medications,
    medicationDate,
    date,
    dateMap,
    { mode: "exact", limit: 20 }
  );
  const recentMedications = filterResourcesForDate(
    medications,
    medicationDate,
    date,
    dateMap,
    { mode: "recent", daysBack: 3, limit: 20 }
  );
  const dailyAdministrationNames = new Set(
    dailyAdministrations.map((item) => medicationAdministrationLabel(item)).filter(Boolean)
  );
  const merged = [];

  [...exactMedications, ...recentMedications].forEach((item) => {
    const label = medicationLabel(item);
    if (!label) return;
    if (!merged.some((saved) => medicationLabel(saved) === label)) merged.push(item);
  });

  dailyAdministrationNames.forEach((label) => {
    const matchedMedication = (medications || []).find((item) => medicationLabel(item) === label);
    if (matchedMedication && !merged.some((saved) => medicationLabel(saved) === label)) {
      merged.push(matchedMedication);
    }
  });

  return {
    medications: merged.slice(0, 12),
    administrations: dailyAdministrations
  };
}

function buildDailyOrderEventsByDate(dates, medications, serviceRequests, carePlans, dateMap) {
  const byDate = {};

  dates.forEach((date, index) => {
    const items = [];

    filterResourcesForDate(medications, medicationDate, date, dateMap, { mode: "exact", limit: 3 }).forEach((item, medIndex) => {
      items.push({
        time: medIndex === 0 ? "08:30" : medIndex === 1 ? "12:30" : "17:30",
        nurse: fallbackNurseName(index + medIndex),
        note: `신규 처방 확인함: ${medicationLabel(item)}`,
        event: ""
      });
    });

    filterResourcesForDate(serviceRequests, serviceRequestDate, date, dateMap, { mode: "exact", limit: 2 }).forEach((item, requestIndex) => {
      items.push({
        time: requestIndex === 0 ? "09:30" : "15:00",
        nurse: fallbackNurseName(index + 2 + requestIndex),
        note: `검사 및 처치 오더 확인함: ${serviceRequestLabel(item)}`,
        event: ""
      });
    });

    filterResourcesForDate(carePlans, carePlanDate, date, dateMap, { mode: "exact", limit: 2 }).forEach((item, careIndex) => {
      items.push({
        time: careIndex === 0 ? "13:30" : "19:00",
        nurse: fallbackNurseName(index + 4 + careIndex),
        note: `간호계획 변경사항 확인함: ${carePlanTitle(item)}`,
        event: ""
      });
    });

    byDate[date] = items;
  });

  return byDate;
}

function propagateLabs(dayMap, dates) {
  let lastLabs = {};
  dates.forEach((date) => {
    const current = dayMap[date].labs || {};
    lastLabs = mergeLabs(lastLabs, current);
    dayMap[date].labs = clone(lastLabs);
  });
}

function latestLabs(labsByDate) {
  const dates = Object.keys(labsByDate).sort();
  return dates.length ? clone(labsByDate[dates[dates.length - 1]]) : {};
}

function mergeLabs(base, next) {
  const merged = clone(base);
  Object.keys(next || {}).forEach((category) => {
    if (!merged[category]) merged[category] = {};
    Object.assign(merged[category], next[category]);
  });
  return merged;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function updateVitalValues(target, codes, observation, value) {
  if (matchesAnyCode(codes, VITAL_CODES.systolic) || matchesAnyCode(codes, VITAL_CODES.diastolic)) {
    (observation.component || []).forEach((component) => {
      const componentCodes = codingCodes(component.code);
      const componentValue = quantityValue(component.valueQuantity);
      if (matchesAnyCode(componentCodes, VITAL_CODES.systolic) && componentValue) target.systolic = componentValue;
      if (matchesAnyCode(componentCodes, VITAL_CODES.diastolic) && componentValue) target.diastolic = componentValue;
    });
  }
  if (matchesAnyCode(codes, VITAL_CODES.heartRate)) target.hr = value;
  if (matchesAnyCode(codes, VITAL_CODES.bodyTemp)) target.bt = value;
  if (matchesAnyCode(codes, VITAL_CODES.spo2)) target.spo2 = value;
  if (matchesAnyCode(codes, VITAL_CODES.respiratoryRate)) target.rr = value;
  if (matchesAnyCode(codes, VITAL_CODES.bodyWeight)) target.weight = value;
  if (matchesAnyCode(codes, VITAL_CODES.bodyHeight)) target.height = value;
}

function finalizeVital(vital) {
  const systolic = toNumber(vital.systolic || "120", 120);
  const diastolic = toNumber(vital.diastolic || "80", 80);
  return {
    bp: `${Math.round(systolic)}/${Math.round(diastolic)}`,
    hr: Math.round(toNumber(vital.hr, 80)),
    bt: toNumber(vital.bt, 36.8).toFixed(1),
    spo2: Math.round(toNumber(vital.spo2, 98)),
    rr: Math.round(toNumber(vital.rr, 18)),
    weight: vital.weight || "",
    height: vital.height || ""
  };
}

function defaultVital() {
  return finalizeVital({});
}

function varyVital(vital, delta) {
  const [sys, dia] = String(vital.bp || "120/80").split("/");
  return {
    bp: `${Math.max(80, Math.round(toNumber(sys, 120) + delta))}/${Math.max(50, Math.round(toNumber(dia, 80) + delta / 2))}`,
    hr: Math.max(48, Math.round(toNumber(vital.hr, 80) + delta)),
    bt: Math.max(35.5, toNumber(vital.bt, 36.8) + delta * 0.03).toFixed(1),
    spo2: Math.min(100, Math.max(88, Math.round(toNumber(vital.spo2, 98) + delta / 2))),
    rr: Math.max(10, Math.round(toNumber(vital.rr, 18) + delta / 3)),
    weight: vital.weight || "",
    height: vital.height || ""
  };
}

function medicationAdministrationLabel(item) {
  return codeableText(item.medicationCodeableConcept) || referenceText(item.medicationReference) || "";
}

function dosageText(medication) {
  return (medication.dosageInstruction || []).map((item) => {
    const parts = [
      item.text || "",
      codeableText(item.route),
      timingText(item.timing),
      quantityValue(item.doseAndRate && item.doseAndRate[0] && item.doseAndRate[0].doseQuantity)
    ].filter(Boolean);
    return parts.join(" / ");
  }).find(Boolean) || "";
}

function timingText(timing) {
  if (!timing || !timing.repeat) return "";
  const repeat = timing.repeat;
  const items = [];
  if (repeat.frequency && repeat.period && repeat.periodUnit) {
    items.push(`${repeat.frequency}회/${repeat.period}${repeat.periodUnit}`);
  }
  if (repeat.when && repeat.when.length) items.push(repeat.when.join(", "));
  return items.join(" / ");
}

function isPrnMedication(medication) {
  return (medication.dosageInstruction || []).some((item) => item.asNeededBoolean || item.asNeededCodeableConcept);
}

function isInjectionLike(item) {
  return /iv|inj|infusion|drip|syringe|intraven|subcut|intramus|patch|pump/i.test(`${item.text} ${item.detail}`);
}

function toDisplayItem(item) {
  return { text: item.text, detail: item.detail };
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.text}|${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function conditionLabel(item) {
  return codeableText(item.code) || "진단";
}

function conditionHistoryLabel(item) {
  const label = conditionLabel(item);
  const date = conditionDate(item);
  return date ? `${label} (${date})` : label;
}

function allergyLabel(item) {
  const reaction = (item.reaction || [])
    .flatMap((part) => part.manifestation || [])
    .map(codeableText)
    .filter(Boolean)
    .join(", ");
  return [codeableText(item.code), reaction].filter(Boolean).join(" / ") || "알레르기";
}

function procedureLabel(item) {
  return codeableText(item.code) || "시술/수술";
}

function reportLabel(item) {
  return codeableText(item.code) || "검사결과";
}

function medicationLabel(item) {
  return codeableText(item.medicationCodeableConcept) || referenceText(item.medicationReference) || "처방";
}

function serviceRequestLabel(item) {
  return codeableText(item.code) || "서비스 요청";
}

function carePlanTitle(item) {
  return item.title || item.description || (item.category || []).map(codeableText).find(Boolean) || "간호계획";
}

function documentTitle(item) {
  return item.description || codeableText(item.type) || "문서";
}

function deviceLabel(item) {
  return (item.deviceName && item.deviceName[0] && item.deviceName[0].name) || codeableText(item.type) || "기구";
}

function isVitalObservation(codes) {
  return Object.values(VITAL_CODES).some((list) => matchesAnyCode(codes, list));
}

function isLabObservation(observation) {
  return /laboratory|lab/i.test(observationCategory(observation));
}

function hasInterpretation(observation) {
  return !!((observation.interpretation || []).map(codeableText).filter(Boolean).length);
}

function observationCategory(observation) {
  return (observation.category || []).map(codeableText).filter(Boolean).join(", ");
}

function observationLabel(observation) {
  return codeableText(observation.code);
}

function observationValue(observation) {
  if (Array.isArray(observation.component) && observation.component.length && /blood pressure/i.test(observationLabel(observation))) {
    const systolic = observation.component.find((item) => matchesAnyCode(codingCodes(item.code), VITAL_CODES.systolic));
    const diastolic = observation.component.find((item) => matchesAnyCode(codingCodes(item.code), VITAL_CODES.diastolic));
    return `${quantityValue(systolic && systolic.valueQuantity) || "-"} / ${quantityValue(diastolic && diastolic.valueQuantity) || "-"}`;
  }
  if (observation.valueQuantity) return formatNumericValue(quantityValue(observation.valueQuantity));
  if (observation.valueString) return observation.valueString;
  if (observation.valueCodeableConcept) return codeableText(observation.valueCodeableConcept);
  if (typeof observation.valueBoolean === "boolean") return observation.valueBoolean ? "예" : "아니오";
  return "";
}

function quantityValue(quantity) {
  if (!quantity || typeof quantity.value === "undefined" || quantity.value === null) return "";
  const numeric = Number(quantity.value);
  const value = Number.isFinite(numeric) ? numeric.toFixed(2) : quantity.value;
  return `${value}${quantity.unit ? ` ${quantity.unit}` : ""}`.trim();
}

function mapValues(obj, mapper) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, mapper(value)]));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function sortDesc(items, dateFn) {
  return [...items].sort((a, b) => String(dateFn(b) || "").localeCompare(String(dateFn(a) || "")));
}

function encounterDate(item) {
  return normalizeDate(item && item.period && (item.period.start || item.period.end));
}

function conditionDate(item) {
  return normalizeDate(item && (item.recordedDate || item.onsetDateTime || (item.meta && item.meta.lastUpdated)));
}

function observationDateTime(item) {
  return normalizeDate(item && (item.effectiveDateTime || item.issued || (item.meta && item.meta.lastUpdated)));
}

function observationDate(item) {
  return observationDateTime(item);
}

function observationTime(item) {
  return normalizeTime(item && (item.effectiveDateTime || item.issued || (item.meta && item.meta.lastUpdated)));
}

function medicationDate(item) {
  return normalizeDate(item && (item.authoredOn || (item.meta && item.meta.lastUpdated)));
}

function administrationDate(item) {
  return normalizeDate(
    item && (
      item.effectiveDateTime ||
      (item.effectivePeriod && item.effectivePeriod.start) ||
      (item.meta && item.meta.lastUpdated)
    )
  );
}

function procedureDate(item) {
  return normalizeDate(item && (item.performedDateTime || (item.performedPeriod && item.performedPeriod.start) || (item.meta && item.meta.lastUpdated)));
}

function reportDate(item) {
  return normalizeDate(item && (item.effectiveDateTime || item.issued || (item.meta && item.meta.lastUpdated)));
}

function serviceRequestDate(item) {
  return normalizeDate(item && (item.authoredOn || (item.meta && item.meta.lastUpdated)));
}

function carePlanDate(item) {
  return normalizeDate(item && ((item.period && item.period.start) || item.created || (item.meta && item.meta.lastUpdated)));
}

function documentDate(item) {
  return normalizeDate(item && (item.date || (item.meta && item.meta.lastUpdated)));
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function normalizeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function codeableText(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (item.text) return item.text;
  const coding = item.coding && item.coding[0];
  return coding ? (coding.display || coding.code || "") : "";
}

function referenceText(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.display || item.reference || "";
}

function codingCodes(codeable) {
  return ((codeable && codeable.coding) || []).map((item) => item.code).filter(Boolean);
}

function matchesAnyCode(actual, expected) {
  return actual.some((item) => expected.includes(item));
}

function toGender(value) {
  if (!value) return "-";
  if (/^m/i.test(value)) return "M";
  if (/^f/i.test(value)) return "F";
  return value.toUpperCase().slice(0, 1);
}

function formatHumanName(name) {
  if (!name) return "";
  if (name.text) return name.text;
  const given = Array.isArray(name.given) ? name.given.join(" ") : "";
  return `${given} ${name.family || ""}`.trim();
}

function buildSyntheticPatientLabel(id, fallbackIndex = 0) {
  return `Synthetic FHIR Patient ${buildSyntheticCode(id, fallbackIndex)}`;
}

function buildSyntheticWardAssignment(id, fallbackIndex = 0, options = {}) {
  const numericCode = Number.parseInt(buildSyntheticCode(id, fallbackIndex), 10) || Math.max(1, fallbackIndex || 1);
  const absoluteIndex = Math.max(0, numericCode - 1);
  const diagnosisText = normalizeClinicalText((options.diagnosisList || []).join(" / "));
  const department = String(options.department || "").trim();
  const preferredWard = inferWardFromClinicalContext(department, diagnosisText, numericCode);
  const wardSpec = resolveWardSpec(preferredWard) || SYNTHETIC_WARD_LAYOUT[absoluteIndex % SYNTHETIC_WARD_LAYOUT.length];
  const slot = Math.floor(absoluteIndex / Math.max(1, SYNTHETIC_WARD_LAYOUT.length));
  const roomNumber = String(wardSpec.roomBase + slot).padStart(wardSpec.roomDigits, "0");

  return {
    ward: wardSpec.ward,
    room: `${wardSpec.roomPrefix}-${roomNumber}`,
    doctorTeam: wardSpec.doctorTeam
  };
}

function inferWardFromClinicalContext(department, diagnosisText, numericCode) {
  if (ICU_DIAGNOSIS_PATTERN.test(diagnosisText || "")) return "ICU";

  const mappedWard = DEPARTMENT_WARD_MAP.get(String(department || "").trim());
  if (mappedWard === "내과병동") {
    const shouldEscalateToIcu = ["감염내과", "호흡기내과", "순환기내과"].includes(String(department || "").trim())
      && numericCode % 9 === 0;
    if (shouldEscalateToIcu) return "ICU";
  }

  return mappedWard || "내과병동";
}

function resolveWardSpec(ward) {
  return SYNTHETIC_WARD_LAYOUT.find((item) => item.ward === ward) || null;
}

function buildSyntheticDoctorTeam(department, ward) {
  const safeDepartment = String(department || "").trim();
  const safeWard = String(ward || "").trim();
  if (safeDepartment) return `Synthetic ${safeDepartment} Team`;
  if (safeWard) return `Synthetic ${safeWard} Team`;
  return "Synthetic Care Team";
}

function buildSyntheticRoomLabel(id) {
  return buildSyntheticWardAssignment(id).room;
}

function buildSyntheticRegistrationNo(id) {
  return `FHIR-SYN-${buildSyntheticCode(id)}`;
}

function buildSyntheticCode(id, fallbackIndex = 0) {
  const source = String(id || fallbackIndex || "0");
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash * 31) + source.charCodeAt(index)) % 10000;
  }

  if (!hash && fallbackIndex) {
    hash = fallbackIndex;
  }

  return String(Math.abs(hash) || 1).padStart(4, "0");
}

function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function toNumber(value, fallback) {
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function formatNumericValue(value) {
  const text = String(value);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text).toFixed(2);
  return text.replace(/(-?\d+\.\d{2})\d+/g, '$1');
}

function normalizeLabLabel(label) {
  const map = {
    Hemoglobin: 'Hb',
    'Platelet count': 'Plt',
    Leukocytes: 'WBC',
    Creatinine: 'Cr',
    'Urea Nitrogen': 'BUN',
    Potassium: 'K',
    Sodium: 'Na',
    Chloride: 'Cl',
    Glucose: 'Glucose',
    'C-Reactive Protein': 'CRP'
  };
  return map[label] || label;
}

function getLabStatus(key, value) {
  if (value === '-' || typeof value !== 'string') return { status: 'normal' };

  const numeric = parseFloat(value.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(numeric)) return { status: 'normal' };

  let range = { min: -Infinity, max: Infinity };

  if (key === 'WBC') range = { min: 4.0, max: 10.0 };
  else if (key === 'Hb') range = { min: 12.0, max: 16.0 };
  else if (key === 'Plt') range = { min: 150, max: 450 };
  else if (key === 'Na') range = { min: 135, max: 145 };
  else if (key === 'K') range = { min: 3.5, max: 5.0 };
  else if (key === 'Cl') range = { min: 98, max: 107 };
  else if (key === 'BUN') range = { min: 8, max: 20 };
  else if (key === 'Cr') range = { min: 0.6, max: 1.2 };
  else if (key === 'AST') range = { min: 0, max: 40 };
  else if (key === 'ALT') range = { min: 0, max: 40 };
  else if (key === 'CRP') range = { min: 0, max: 0.5 };
  else if (key === 'Lactate') range = { min: 0, max: 2.0 };
  else if (key === 'pH') range = { min: 7.35, max: 7.45 };
  else if (key === 'pCO2') range = { min: 35, max: 45 };
  else if (key === 'pO2') range = { min: 80, max: 100 };
  else if (key === 'HCO3') range = { min: 22, max: 26 };

  if (numeric > range.max) return { status: 'high' };
  if (numeric < range.min) return { status: 'low' };
  return { status: 'normal' };
}

function mapLabCategory(label) {
  const text = String(label || '').toLowerCase();
  if (/wbc|rbc|hemoglobin|hematocrit|platelet|cbc|neutrophil|lymphocyte/.test(text)) return 'CBC';
  if (/sodium|potassium|chloride|calcium|magnesium|phosphate/.test(text)) return '전해질';
  if (/bun|creatinine|egfr|uric/.test(text)) return '신장기능';
  if (/ast|alt|alp|bilirubin|albumin|protein/.test(text)) return '간기능';
  if (/crp|esr|procalcitonin|lactate/.test(text)) return '염증검사';
  if (/ph|pco2|po2|hco3|abg|blood gas/.test(text)) return '혈액가스';
  if (/pt|inr|aptt|fibrinogen|d-dimer/.test(text)) return '응고검사';
  if (/urine|ua|ketone|specific gravity/.test(text)) return '요검사';
  if (/glucose|cholesterol|triglyceride|amylase|lipase/.test(text)) return '화학검사';
  return '기타';
}

function isCurrentStatus(status) {
  const text = String(status || '').toLowerCase();
  if (!text) return true;
  return !['completed', 'entered-in-error', 'stopped', 'inactive', 'revoked', 'cancelled', 'resolved'].includes(text);
}

function buildNursingProblemText(diagnosisList, serviceRequests, carePlans) {
  const lines = [];
  diagnosisList.slice(0, 3).forEach((item) => lines.push(`- 주요 문제: ${item}`));
  carePlans
    .map((item) => carePlanTitle(item))
    .filter((item) => isMeaningfulNursingProblemText(item))
    .slice(0, 2)
    .forEach((item) => lines.push(`- 간호 초점: ${item}`));
  return lines.join('\n') || '간호문제 정보 없음';
}

function isMeaningfulNursingProblemText(text) {
  const source = normalizeClinicalText(text);
  if (!source) return false;
  if (/\bct\b|\bmri\b|x-ray|ultrasound|panel|culture|documentation|consult|service request/.test(source)) return false;
  if (/therapy|counsel|education|teaching|exercise therapy|respiratory therapy|physical therapy|occupational therapy|speech therapy/.test(source)) return false;
  return /위험|통증|낙상|욕창|피부|상처|호흡|산소|감염|출혈|의식|신경|혈당|배액|격리|pain|fall|pressure|skin|wound|resp|oxygen|infection|bleed|neuro|glycemic|drain/.test(source);
}

function clampHour(value) {
  const hour = parseInt(String(value || "08:00").slice(0, 2), 10);
  if (Number.isNaN(hour)) return 8;
  return Math.max(0, Math.min(23, hour));
}

function todayIso() {
  return normalizeDate(new Date());
}

function buildDailyData(input) {
  const administrationEvents = buildAdministrationEventsByDate(input.administrations || [], input.dateMap || {});
  const reportEvents = buildReportEventsByDate(input.documents || [], input.reports || [], input.dateMap || {});
  const nursingTaskEvents = buildNursingTaskEventsByDate(
    input.dates,
    input.lineTube,
    input.carePlans,
    input.serviceRequests,
    input.dateMap || {}
  );
  const orderEvents = buildDailyOrderEventsByDate(
    input.dates,
    input.medications || [],
    input.serviceRequests || [],
    input.carePlans || [],
    input.dateMap || {}
  );
  const dayMap = {};

  input.dates.forEach((date, index) => {
    const fallbackVital = input.observationSummary.latestVital || defaultVital();
    const dayVital = input.observationSummary.vitalsByDate[date] || varyVital(fallbackVital, index - (input.dates.length - 1));
    const dailyConditions = filterResourcesForDate(input.conditions || [], conditionDate, date, input.dateMap || {}, { mode: "recent", daysBack: 4, limit: 6 });
    const dailyServiceRequests = filterResourcesForDate(input.serviceRequests || [], serviceRequestDate, date, input.dateMap || {}, { mode: "recent", daysBack: 3, limit: 6 });
    const dailyCarePlans = filterResourcesForDate(input.carePlans || [], carePlanDate, date, input.dateMap || {}, { mode: "recent", daysBack: 3, limit: 4 });
    const dailyReports = filterResourcesForDate(input.reports || [], reportDate, date, input.dateMap || {}, { mode: "recent", daysBack: 2, limit: 4 });
    const dailyProcedures = filterResourcesForDate(input.procedures || [], procedureDate, date, input.dateMap || {}, { mode: "recent", daysBack: 2, limit: 4 });
    const dailyDocuments = filterResourcesForDate(input.documents || [], documentDate, date, input.dateMap || {}, { mode: "recent", daysBack: 2, limit: 4 });
    const dailyObservations = filterResourcesForDate(input.observations || [], observationDateTime, date, input.dateMap || {}, { mode: "recent", daysBack: 1, limit: 40 });
    const dailyMedicationSet = filterMedicationSetForDate(input.medications || [], input.administrations || [], date, input.dateMap || {});
    const dailyMedicationOrders = buildMedicationOrders(dailyMedicationSet.medications, dailyMedicationSet.administrations);
    const dailyDiagnosisList = unique(dailyConditions.map(conditionLabel)).slice(0, 6);
    const dailyDoctorOrders = buildDoctorOrders(dailyMedicationOrders, dailyServiceRequests, dailyCarePlans);
    const dailyLabs = input.observationSummary.labsByDate[date] || input.observationSummary.latestLabs || {};
    const dailyLineTube = buildDailyLineTubeSummary({
      baseLineTube: input.lineTube,
      procedures: dailyProcedures,
      serviceRequests: dailyServiceRequests,
      observations: dailyObservations,
      medicationOrders: dailyMedicationOrders,
      carePlans: dailyCarePlans,
      useBaseFallback: date === input.dates[input.dates.length - 1]
    });
    const dailyNursingTasks = buildNursingTasks(dailyLineTube, dailyCarePlans, dailyDocuments);
    const dailyPlanItems = buildPlanItems(dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList, dailyCarePlans, dailyServiceRequests);
    const eventNotes = [
      ...(input.observationSummary.eventsByDate[date] || []),
      ...(administrationEvents[date] || []),
      ...(reportEvents[date] || []),
      ...(nursingTaskEvents[date] || []),
      ...(orderEvents[date] || [])
    ].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

    dayMap[date] = {
      pastHistory: input.pastHistory.slice(0, 8),
      nursingProblem: buildNursingProblemText(
        dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
        dailyServiceRequests,
        dailyCarePlans
      ),
      handover: {
        lines: input.lineTube.lines,
        tubes: input.lineTube.tubes,
        drains: input.lineTube.drains,
        drugs: dailyMedicationOrders.running,
        vent: input.lineTube.vent,
        neuro: buildNeuroItems(dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList, dailyCarePlans),
        etc: input.allergyList.slice(0, 2).map((text) => ({ text, detail: "알레르기 / 주의" }))
      },
      hourly: buildHourlyTimeline(date, dayVital, eventNotes),
      io: input.observationSummary.ioByDate[date] || { input: "-", totalOutput: "-" },
      activity: findActivity(dailyCarePlans.length ? dailyCarePlans : input.carePlans, input.latestEncounter),
      orders: {
        inj: dailyMedicationOrders.inj,
        po: dailyMedicationOrders.po
      },
      labs: dailyLabs,
      specials: buildSpecialsForDate(dailyReports, dailyProcedures, dailyDocuments),
      docOrders: dailyDoctorOrders,
      medSchedule: buildMedicationSchedule(dailyMedicationOrders),
      todoList: buildTodoList(
        dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
        dailyServiceRequests,
        dailyCarePlans,
        date,
        input.dates[input.dates.length - 1]
      ),
      nursingTasks: dailyNursingTasks,
      plan: dailyPlanItems,
      consults: buildConsults(dailyServiceRequests, dailyCarePlans),
      tMax: Number(dayVital.bt),
      vital: dayVital,
      handoffMeta: buildHandoffMeta({
        date,
        diagnosisList: dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
        isolation: input.isolation || findIsolation(input.serviceRequests || [], input.conditions || [], input.documents || []),
        activity: findActivity(dailyCarePlans.length ? dailyCarePlans : input.carePlans, input.latestEncounter),
        cautionList: input.allergyList.slice(0, 3),
        lineTube: dailyLineTube,
        doctorOrders: dailyDoctorOrders,
        medicationOrders: dailyMedicationOrders,
        vital: dayVital,
        labs: dailyLabs,
        nursingTasks: dailyNursingTasks,
        planItems: dailyPlanItems,
        serviceRequests: dailyServiceRequests,
        carePlans: dailyCarePlans,
        documents: dailyDocuments,
        reports: dailyReports,
        procedures: dailyProcedures
      })
    };
  });

  propagateLabs(dayMap, input.dates);
  return dayMap;
}

function buildHandoffMeta(input) {
  const activeOrders = unique([
    ...(input.doctorOrders?.routine || []),
    ...(input.doctorOrders?.prn || [])
  ]);

  return {
    clinicalStatus: {
      diagnoses: (input.diagnosisList || []).slice(0, 4),
      isolation: input.isolation || "-",
      activity: input.activity || "-",
      caution: (input.cautionList || []).slice(0, 3),
      lines: dedupeTextItems(input.lineTube?.lines || []),
      tubes: dedupeTextItems(input.lineTube?.tubes || []),
      drains: dedupeTextItems(input.lineTube?.drains || []),
      vent: dedupeTextItems(input.lineTube?.vent || [])
    },
    orders: {
      active: activeOrders,
      routine: (input.doctorOrders?.routine || []).slice(0, 12),
      prn: (input.doctorOrders?.prn || []).slice(0, 8),
      medications: {
        inj: toTextItems(input.medicationOrders?.inj || []),
        po: toTextItems(input.medicationOrders?.po || []),
        running: toTextItems(input.medicationOrders?.running || [])
      }
    },
    vitals: summarizeVitalsForHandoff(input.vital),
    labs: summarizeLabsForHandoff(input.labs),
    nursingActions: buildNursingActionSnapshot(input),
    sourceRefs: buildHandoffSourceRefs(input)
  };
}

function dedupeTextItems(items) {
  return unique((items || []).map((item) => typeof item === "string" ? item : item.text).filter(Boolean));
}

function toTextItems(items) {
  return (items || []).map((item) => typeof item === "string" ? item : item.text).filter(Boolean);
}

function summarizeVitalsForHandoff(vital) {
  const bp = String(vital?.bp || "120/80").split("/");
  const systolic = toNumber(bp[0], 120);
  const diastolic = toNumber(bp[1], 80);
  const hr = toNumber(vital?.hr, 80);
  const bt = toNumber(vital?.bt, 36.8);
  const rr = toNumber(vital?.rr, 18);
  const spo2 = toNumber(vital?.spo2, 98);
  const abnormalFlags = [];

  if (systolic < 90 || systolic >= 180) abnormalFlags.push("bp");
  if (hr < 50 || hr >= 120) abnormalFlags.push("hr");
  if (bt >= 38 || bt < 36) abnormalFlags.push("bt");
  if (rr >= 24 || rr < 10) abnormalFlags.push("rr");
  if (spo2 < 92) abnormalFlags.push("spo2");

  return {
    latest: {
      bp: vital?.bp || "120/80",
      hr: Math.round(hr),
      bt: Number(bt.toFixed(1)),
      rr: Math.round(rr),
      spo2: Math.round(spo2)
    },
    abnormalFlags
  };
}

function summarizeLabsForHandoff(labs) {
  const flatLabs = flattenLabMap(labs);
  const abnormalLabs = Object.keys(flatLabs).map((key) => {
    const value = flatLabs[key];
    const status = getLabStatus(key, String(value)).status;
    return {
      key,
      value,
      status
    };
  }).filter((item) => item.status !== "normal");

  return {
    latest: flatLabs,
    abnormal: abnormalLabs.slice(0, 12)
  };
}

function flattenLabMap(labs) {
  const result = {};
  Object.values(labs || {}).forEach((category) => {
    Object.assign(result, category || {});
  });
  return result;
}

function buildNursingActionSnapshot(input) {
  const confirmed = unique([
    ...(input.nursingTasks || []).map((task) => task.text),
    ...(input.carePlans || []).map((item) => carePlanTitle(item)),
    ...(input.documents || []).map((item) => documentTitle(item))
  ]).filter(Boolean);

  const followUp = unique([
    ...(input.planItems || []),
    ...(input.serviceRequests || []).map((item) => serviceRequestLabel(item))
  ]).filter(Boolean);
  const pending = followUp.filter((item) => isMeaningfulCarryoverText(item));
  const background = followUp.filter((item) => !pending.includes(item));

  return {
    completed: confirmed.slice(0, 8),
    pending: pending.slice(0, 8),
    followUp: followUp.slice(0, 8),
    background: background.slice(0, 8)
  };
}

function isMeaningfulCarryoverText(text) {
  const source = normalizeClinicalText(text);
  if (!source) return false;
  if (isGenericFollowUpText(source)) return false;

  const directActionPatterns = [
    /재확인/,
    /재평가/,
    /확인/,
    /사정/,
    /모니터/,
    /관찰/,
    /보고/,
    /교육/,
    /드레싱/,
    /채혈/,
    /검체/,
    /투약/,
    /약물/,
    /hold/,
    /보류/,
    /중지/,
    /notify/,
    /check/,
    /monitor/,
    /assess/,
    /recheck/
  ];
  const responsibilityTargets = [
    /라인/,
    /튜브/,
    /드레인/,
    /카테터/,
    /foley/,
    /picc/,
    /central line/,
    /\biv\b/,
    /산소/,
    /oxygen/,
    /혈당/,
    /활력/,
    /통증/,
    /출혈/,
    /상처/,
    /배액/,
    /소변/,
    /\bi\/o\b/,
    /낙상/,
    /욕창/,
    /격리/
  ];
  const timeSensitiveTestPatterns = [
    /검사/,
    /imaging/,
    /\bct\b/,
    /\bmri\b/,
    /x-ray/,
    /ultrasound/
  ];
  const timeSensitiveActionPatterns = [
    /준비/,
    /시행 여부/,
    /결과 확인/,
    /동의/,
    /이송/,
    /금식/,
    /\bnpo\b/,
    /전처치/
  ];

  if (directActionPatterns.some((pattern) => pattern.test(source))) return true;
  if (responsibilityTargets.some((pattern) => pattern.test(source))) return true;
  if (timeSensitiveTestPatterns.some((pattern) => pattern.test(source)) && timeSensitiveActionPatterns.some((pattern) => pattern.test(source))) {
    return true;
  }

  return false;
}

function isGenericFollowUpText(text) {
  const source = normalizeClinicalText(text);
  if (!source) return true;

  if (/경과 관찰/.test(source) && !/(활력|혈압|맥박|호흡|산소|혈당|소변|배액|출혈|의식|통증|상처|드레싱|라인|튜브|드레인|검사 결과|투약|약물)/.test(source)) {
    return true;
  }

  if (/\bct\b|\bmri\b|x-ray|ultrasound|lipid panel|complete blood count|서비스 요청|검사 요청/.test(source) &&
    !/(준비|확인|재확인|결과|시행 여부|동의|이송|금식|전처치)/.test(source)) {
    return true;
  }

  return false;
}

function buildHandoffSourceRefs(input) {
  return {
    serviceRequests: (input.serviceRequests || []).length,
    carePlans: (input.carePlans || []).length,
    documents: (input.documents || []).length,
    reports: (input.reports || []).length,
    procedures: (input.procedures || []).length,
    activeOrders: (input.doctorOrders?.routine || []).length + (input.doctorOrders?.prn || []).length
  };
}

function buildHourlyTimeline(date, dayVital, events) {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    time: `${String(hour).padStart(2, "0")}:00`,
    vital: dayVital,
    event: "",
    notes: []
  }));

  events.slice(0, 40).forEach((event) => {
    const hour = clampHour(event.time);
    const note = event.nurse ? `${event.note} (${event.nurse})` : event.note;
    hourly[hour].notes.push(note);
    if (event.event && !hourly[hour].event) hourly[hour].event = event.event;
  });

  hourly.forEach((slot, index) => {
    if (!slot.notes.length && index % 4 === 0) {
      slot.notes.push("정규 모니터링 및 상태 관찰");
    }
  });

  return hourly;
}

function buildAdministrationEventsByDate(administrations, dateMap = {}) {
  const byDate = {};

  administrations.forEach((item, index) => {
    const date = remapTimelineDate(administrationDate(item), dateMap);
    if (!date) return;

    const time = normalizeTime(
      item.effectiveDateTime ||
      (item.effectivePeriod && item.effectivePeriod.start) ||
      (item.meta && item.meta.lastUpdated)
    ) || `${String((8 + index) % 24).padStart(2, "0")}:00`;

    const nurse = administrationPerformer(item) || fallbackNurseName(index);
    const med = medicationAdministrationLabel(item) || "투약";
    const status = item.status ? `상태 ${item.status}` : "투약 수행";
    const note = `${med} ${status}`;

    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      time,
      nurse,
      note,
      event: /stop|hold|error/i.test(status) ? med : ""
    });
  });

  return byDate;
}

function administrationPerformer(item) {
  const performer = item.performer && item.performer[0];
  if (!performer) return "";
  return referenceText(performer.actor);
}

function fallbackNurseName(index) {
  const names = ["김간호", "이간호", "박간호", "최간호", "정간호", "한간호"];
  return `${names[index % names.length]} RN`;
}

function buildReportEventsByDate(documents, reportList) {
  const byDate = {};

  documents.slice(0, 20).forEach((item, index) => {
    const date = documentDate(item);
    if (!date) return;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      time: `${String((10 + index) % 24).padStart(2, "0")}:20`,
      nurse: fallbackNurseName(index + 2),
      note: `문서 확인: ${documentTitle(item)}`,
      event: ""
    });
  });

  reportList.slice(0, 10).forEach((item, index) => {
    const date = todayIso();
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      time: `${String((11 + index) % 24).padStart(2, "0")}:40`,
      nurse: fallbackNurseName(index + 3),
      note: `판독 확인: ${item}`,
      event: ""
    });
  });

  return byDate;
}

function buildNursingTaskEventsByDate(dates, lineTube, carePlans, serviceRequests) {
  const byDate = {};

  dates.forEach((date, index) => {
    const items = [];

    lineTube.lines.slice(0, 2).forEach((item) => {
      items.push({
        time: "07:30",
        nurse: fallbackNurseName(index),
        note: `${item.text} 라인 부위 사정 및 고정 상태 확인함`,
        event: ""
      });
    });

    lineTube.tubes.slice(0, 2).forEach((item) => {
      items.push({
        time: "10:30",
        nurse: fallbackNurseName(index + 1),
        note: `${item.text} 유지 상태 확인 및 배액/유출 여부 관찰함`,
        event: ""
      });
    });

    carePlans.slice(0, 2).forEach((item, careIndex) => {
      items.push({
        time: careIndex === 0 ? "14:00" : "18:00",
        nurse: fallbackNurseName(index + 2 + careIndex),
        note: `간호계획 수행함: ${carePlanTitle(item)}`,
        event: ""
      });
    });

    serviceRequests.slice(0, 2).forEach((item, requestIndex) => {
      items.push({
        time: requestIndex === 0 ? "11:00" : "16:00",
        nurse: fallbackNurseName(index + 4 + requestIndex),
        note: `검사/처치 준비 및 시행 여부 확인함: ${serviceRequestLabel(item)}`,
        event: ""
      });
    });

    byDate[date] = items;
  });

  return byDate;
}

function buildAdministrationEventsByDate(administrations, dateMap = {}) {
  const byDate = {};

  administrations.forEach((item, index) => {
    const date = remapTimelineDate(administrationDate(item), dateMap);
    if (!date) return;

    const time = normalizeTime(
      item.effectiveDateTime ||
      (item.effectivePeriod && item.effectivePeriod.start) ||
      (item.meta && item.meta.lastUpdated)
    ) || `${String((8 + index) % 24).padStart(2, "0")}:00`;

    const nurse = administrationPerformer(item) || fallbackNurseName(index);
    const med = medicationAdministrationLabel(item) || "투약";
    const status = item.status ? `상태 ${item.status}` : "투약 수행";

    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      time,
      nurse,
      note: `${med} ${status}`,
      event: /stop|hold|error/i.test(status) ? med : ""
    });
  });

  return byDate;
}

function fallbackNurseName(index) {
  const names = ["김간호", "이간호", "박간호", "최간호", "정간호", "조간호"];
  return `${names[index % names.length]} RN`;
}

function buildReportEventsByDate(documents, reports, dateMap = {}) {
  const byDate = {};

  documents.slice(0, 20).forEach((item, index) => {
    const date = remapTimelineDate(documentDate(item), dateMap);
    if (!date) return;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      time: `${String((10 + index) % 24).padStart(2, "0")}:20`,
      nurse: fallbackNurseName(index + 2),
      note: `문서 확인함: ${documentTitle(item)}`,
      event: ""
    });
  });

  reports.slice(0, 20).forEach((item, index) => {
    const date = remapTimelineDate(reportDate(item), dateMap);
    if (!date) return;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      time: `${String((11 + index) % 24).padStart(2, "0")}:40`,
      nurse: fallbackNurseName(index + 3),
      note: `판독 결과 확인함: ${reportLabel(item)}`,
      event: ""
    });
  });

  return byDate;
}

function buildNursingTaskEventsByDate(dates, lineTube, carePlans, serviceRequests, dateMap = {}) {
  const byDate = {};

  dates.forEach((date, index) => {
    const items = [];
    const dailyCarePlans = filterResourcesForDate(carePlans || [], carePlanDate, date, dateMap, { mode: "recent", daysBack: 2, limit: 2 });
    const dailyServiceRequests = filterResourcesForDate(serviceRequests || [], serviceRequestDate, date, dateMap, { mode: "recent", daysBack: 2, limit: 2 });

    lineTube.lines.slice(0, 2).forEach((item) => {
      items.push({
        time: "07:30",
        nurse: fallbackNurseName(index),
        note: `${item.text} 라인 부위 사정 및 고정 상태 확인함`,
        event: ""
      });
    });

    lineTube.tubes.slice(0, 2).forEach((item) => {
      items.push({
        time: "10:30",
        nurse: fallbackNurseName(index + 1),
        note: `${item.text} 유지 상태 확인 및 배액 여부 관찰함`,
        event: ""
      });
    });

    dailyCarePlans.forEach((item, careIndex) => {
      items.push({
        time: careIndex === 0 ? "14:00" : "18:00",
        nurse: fallbackNurseName(index + 2 + careIndex),
        note: `간호계획 수행함: ${carePlanTitle(item)}`,
        event: ""
      });
    });

    dailyServiceRequests.forEach((item, requestIndex) => {
      items.push({
        time: requestIndex === 0 ? "11:00" : "16:00",
        nurse: fallbackNurseName(index + 4 + requestIndex),
        note: `검사 및 처치 준비, 시행 여부 확인함: ${serviceRequestLabel(item)}`,
        event: ""
      });
    });

    byDate[date] = items;
  });

  return byDate;
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
