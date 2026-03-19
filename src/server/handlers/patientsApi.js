const {
  getPublicSafeFhirBaseUrl,
  buildPublicDataPolicyMetadata
} = require("../../mcp/runtime/publicDataPolicy");

const FHIR_BASE_URL = getPublicSafeFhirBaseUrl();
const DEFAULT_PATIENT_COUNT = 60;
const TIMELINE_DAYS = 10;
const FHIR_FETCH_TIMEOUT_MS = Math.max(1000, Number.parseInt(String(process.env.FHIR_FETCH_TIMEOUT_MS || "8000"), 10) || 8000);
const PATIENT_BATCH_FETCH_SIZE = 20;
const LIST_PAGE_FETCH_SIZE = 30;
const MAX_LIST_FETCH_PAGES = 8;
const DEPARTMENT_MIN_PATIENT_COUNT = 5;
const TARGET_PATIENT_LIST_COUNT = 60;
const MAX_PATIENT_COUNT = 80;
const BALANCED_POOL_MIN = 90;
const BALANCED_POOL_PADDING = 30;
const BALANCED_POOL_MAX = 140;
const DEPARTMENT_SEED_SEARCHES = [
  { department: "내과계중환자의학과", term: "sepsis", count: 14 },
  { department: "내과계중환자의학과", term: "septic shock", count: 12 },
  { department: "내과계중환자의학과", term: "respiratory failure", count: 12 },
  { department: "내과계중환자의학과", term: "pneumonia", count: 12 },
  { department: "내과계중환자의학과", term: "acute heart failure", count: 10 },
  { department: "내과계중환자의학과", term: "infection", count: 10 },
  { department: "내과계중환자의학과", term: "acute kidney injury", count: 10 },
  { department: "외과계중환자의학과", term: "postoperative", count: 14 },
  { department: "외과계중환자의학과", term: "trauma", count: 12 },
  { department: "외과계중환자의학과", term: "hemorrhage", count: 12 },
  { department: "외과계중환자의학과", term: "peritonitis", count: 10 },
  { department: "외과계중환자의학과", term: "appendicitis", count: 10 },
  { department: "외과계중환자의학과", term: "surgery", count: 10 },
  { department: "외과계중환자의학과", term: "bowel obstruction", count: 10 },
  { department: "신경과", term: "stroke", count: 14 },
  { department: "신경과", term: "cerebral infarction", count: 12 },
  { department: "신경과", term: "intracranial hemorrhage", count: 10 },
  { department: "신경과", term: "seizure", count: 10 },
  { department: "외과", term: "appendicitis", count: 16 },
  { department: "외과", term: "hernia", count: 14 },
  { department: "외과", term: "wound", count: 12 },
  { department: "외과", term: "cholecystitis", count: 12 },
  { department: "외과", term: "abdominal pain", count: 10 },
  { department: "호흡기내과", term: "pneumonia", count: 14 },
  { department: "호흡기내과", term: "copd", count: 12 },
  { department: "호흡기내과", term: "asthma exacerbation", count: 10 },
  { department: "호흡기내과", term: "pleural effusion", count: 10 }
];
const SYNTHETIC_WARD_LAYOUT = [
  { ward: "내과계중환자실", roomPrefix: "MICU", roomBase: 1, roomDigits: 2, doctorTeam: "Synthetic Medical Critical Care Team" },
  { ward: "외과계중환자실", roomPrefix: "SICU", roomBase: 21, roomDigits: 2, doctorTeam: "Synthetic Surgical Critical Care Team" },
  { ward: "신경과병동", roomPrefix: "N", roomBase: 301, roomDigits: 3, doctorTeam: "Synthetic Neurology Team" },
  { ward: "외과병동", roomPrefix: "S", roomBase: 401, roomDigits: 3, doctorTeam: "Synthetic General Surgery Team" },
  { ward: "호흡기내과병동", roomPrefix: "P", roomBase: 501, roomDigits: 3, doctorTeam: "Synthetic Pulmonology Team" }
];
const WARD_DISPLAY_ORDER = SYNTHETIC_WARD_LAYOUT.map((item) => item.ward);
const DEPARTMENT_PRIORITY_ORDER = [
  "내과계중환자의학과",
  "외과계중환자의학과",
  "신경과",
  "외과",
  "호흡기내과"
];
const MEDICAL_ICU_PATTERN = /shock|sepsis|septic|respiratory failure|ards|ventilator|ecmo|intubation|cardiac arrest|hemodynamic|critical|status epilepticus|unstable|copd exacerbation|asthma exacerbation|pneumonia|heart failure|arrhythmia|aki|dialysis|dka|hhs|gi bleed/i;
const SURGICAL_ICU_PATTERN = /postop|post-op|postoperative|trauma|hemorrhage|bleeding|perforation|peritonitis|bowel obstruction|ischemia|appendicitis|laparotomy|thoracotomy|pancreatectomy|colectomy|anastomotic|wound dehiscence|surgery/i;
const DEPARTMENT_WARD_MAP = new Map([
  ["내과계중환자의학과", "내과계중환자실"],
  ["외과계중환자의학과", "외과계중환자실"],
  ["신경과", "신경과병동"],
  ["외과", "외과병동"],
  ["호흡기내과", "호흡기내과병동"]
]);
const WARD_TARGET_RATIO = {
  내과계중환자실: 0.2,
  외과계중환자실: 0.2,
  신경과병동: 0.2,
  외과병동: 0.2,
  호흡기내과병동: 0.2
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
const KOREAN_FAMILY_NAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"];
const KOREAN_GIVEN_FIRST = ["민", "서", "지", "도", "하", "유", "수", "현", "채", "나", "준", "시", "다", "가", "태", "예", "선", "주"];
const KOREAN_GIVEN_SECOND = ["준", "연", "우", "민", "윤", "현", "린", "호", "율", "아", "은", "진", "원", "서", "별", "영", "혁", "수"];
const LAB_CATEGORY_DISPLAY_ORDER = ["CBC", "화학검사", "전해질", "간기능", "신장기능", "염증검사", "혈액가스", "응고검사", "요검사", "기타"];

exports.handler = async function handler(event) {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    const requestedCount = event.queryStringParameters && event.queryStringParameters.count;
    const requestedCursor = event.queryStringParameters && event.queryStringParameters.cursor;
    const requestedDepartment = event.queryStringParameters && event.queryStringParameters.department;
    const requestedWard = event.queryStringParameters && event.queryStringParameters.ward;
    const patientCount = normalizePatientCount(requestedCount);

    if (id) {
      const detail = await fetchPatientDetail(id, {
        departmentHint: requestedDepartment,
        wardHint: requestedWard
      });
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
  const profiles = await buildPatientListProfiles(candidatePool.resources, candidatePool.seedHints);
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
  return Math.max(1, Math.min(parsed, MAX_PATIENT_COUNT));
}

async function fetchPatientCandidatePool(options = {}) {
  const targetCount = Math.max(1, Number.parseInt(String(options.targetCount || BALANCED_POOL_MIN), 10) || BALANCED_POOL_MIN);
  const seeded = await fetchDepartmentSeedPatientResources(targetCount);
  const seededResources = seeded.resources;
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
    nextPath: finalNextPath,
    seedHints: seeded.seedHints
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
  const seedHints = new Map();
  const selectedIds = [];
  const selectedIdSet = new Set();

  const seedResults = await mapInBatches(DEPARTMENT_SEED_SEARCHES, 6, async (search) => {
    const conditions = await safeFetchResources(
      `/Condition?code:text=${encodeURIComponent(search.term)}&_count=${search.count}&_elements=id,subject,code,recordedDate,onsetDateTime`
    );
    return { search, conditions };
  });

  seedResults.forEach(({ search, conditions }) => {
    const existingIds = seedGroups.get(search.department) || [];
    const nextIds = [];

    conditions.forEach((condition) => {
      const patientId = extractReferenceId(condition?.subject?.reference);
      if (!patientId) return;
      nextIds.push(patientId);

      const hint = seedHints.get(patientId) || {
        department: search.department,
        diagnosisList: []
      };

      const label = conditionLabel(condition);
      if (label) {
        hint.diagnosisList = unique([...hint.diagnosisList, label]).slice(0, 6);
      }

      if (getDepartmentSortIndex(search.department) < getDepartmentSortIndex(hint.department)) {
        hint.department = search.department;
      }

      seedHints.set(patientId, hint);
    });

    seedGroups.set(search.department, unique([...existingIds, ...nextIds]));
  });

  const baseQuota = Math.min(
    DEPARTMENT_MIN_PATIENT_COUNT,
    Math.max(1, Math.floor(targetCount / Math.max(1, DEPARTMENT_PRIORITY_ORDER.length)))
  );

  DEPARTMENT_PRIORITY_ORDER.forEach((department) => {
    const group = (seedGroups.get(department) || []).slice();
    let selectedForDepartment = 0;

    while (group.length && selectedIds.length < targetCount && selectedForDepartment < baseQuota) {
      const nextId = String(group.shift() || "").trim();
      if (!nextId || selectedIdSet.has(nextId)) continue;
      selectedIds.push(nextId);
      selectedIdSet.add(nextId);
      selectedForDepartment += 1;
    }

    seedGroups.set(department, group);
  });

  while (selectedIds.length < targetCount) {
    let addedInRound = 0;

    DEPARTMENT_PRIORITY_ORDER.forEach((department) => {
      if (selectedIds.length >= targetCount) return;
      const group = seedGroups.get(department) || [];
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

  return {
    resources: await fetchPatientResourcesByIds(selectedIds),
    seedHints
  };
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

async function buildPatientListProfiles(resources, seedHints = new Map()) {
  return mapInBatches(resources || [], 12, async (resource, index) => {
    const summary = normalizePatientSummary(resource, index);
    if (!summary) return null;

    const seedHint = seedHints.get(String(resource.id)) || null;
    const diagnosisList = unique(seedHint?.diagnosisList || []).slice(0, 4);
    const department = seedHint?.department || inferClinicalDepartment(diagnosisList);
    const wardAssignment = buildSyntheticWardAssignment(resource.id, index + 1, {
      department,
      diagnosisList
    });
    const assignedDepartment = wardAssignment.department || department;

    return {
      ...summary,
      room: wardAssignment.room,
      ward: wardAssignment.ward,
      department: assignedDepartment,
      diagnosis: diagnosisList[0] || `${assignedDepartment} synthetic case`,
      doctor: buildSyntheticDoctorTeam(assignedDepartment, wardAssignment.ward),
      sourceDiagnosisCount: diagnosisList.length,
      clinicalQualityScore: buildClinicalQualityScore({
        diagnosisList,
        department: assignedDepartment
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
  const selected = [];
  const selectedIds = new Set();
  const departmentGroups = new Map();

  DEPARTMENT_PRIORITY_ORDER.forEach((department) => departmentGroups.set(department, []));
  candidates
    .slice()
    .sort(compareClinicalProfiles)
    .forEach((profile) => {
      const department = String(profile?.department || "호흡기내과").trim() || "호흡기내과";
      if (!departmentGroups.has(department)) {
        departmentGroups.set(department, []);
      }
      departmentGroups.get(department).push(profile);
    });

  const guaranteedPerDepartment = count >= TARGET_PATIENT_LIST_COUNT
    ? DEPARTMENT_MIN_PATIENT_COUNT
    : Math.max(1, Math.floor(count / Math.max(1, DEPARTMENT_PRIORITY_ORDER.length)));

  DEPARTMENT_PRIORITY_ORDER.forEach((department) => {
    const group = departmentGroups.get(department) || [];
    let picked = 0;

    while (group.length && selected.length < count && picked < guaranteedPerDepartment) {
      const profile = group.shift();
      if (!profile || selectedIds.has(String(profile.id))) continue;
      selected.push(profile);
      selectedIds.add(String(profile.id));
      picked += 1;
    }
  });

  const leftovers = [];
  departmentGroups.forEach((group) => {
    leftovers.push(...group);
  });

  leftovers
    .sort(compareClinicalProfiles)
    .forEach((profile) => {
      if (!profile || selected.length >= count || selectedIds.has(String(profile.id))) return;
      selected.push(profile);
      selectedIds.add(String(profile.id));
    });

  return selected.slice(0, count);
}

function buildStablePatientSortKey(id) {
  return buildSyntheticCode(id);
}

function buildClinicalQualityScore(input = {}) {
  const diagnosisList = input.diagnosisList || [];
  const department = String(input.department || "").trim();
  let score = Math.min(4, diagnosisList.length) * 10;
  if (department && department !== "호흡기내과") score += 8;
  if (department === "외과계중환자의학과" || department === "내과계중환자의학과") score += 4;
  if (diagnosisList.some((item) => MEDICAL_ICU_PATTERN.test(String(item || "")) || SURGICAL_ICU_PATTERN.test(String(item || "")))) {
    score += 12;
  }
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
    const ward = String(profile?.ward || "호흡기내과병동").trim() || "호흡기내과병동";
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
    const department = String(profile?.department || "호흡기내과").trim() || "호흡기내과";
    if (!groups.has(department)) groups.set(department, 0);
    groups.set(department, groups.get(department) + 1);
  });

  const distinctDepartmentCount = Math.max(1, groups.size);
  const baseCap = Math.max(3, Math.ceil(count / Math.min(8, distinctDepartmentCount)) + 1);
  const caps = new Map();

  groups.forEach((availableCount, department) => {
    let cap = Math.min(availableCount, baseCap);
    if (department === "내과계중환자의학과" || department === "외과계중환자의학과") {
      cap = Math.max(cap, Math.ceil(count / 5));
    }
    caps.set(department, cap);
  });

  return caps;
}

function takeNextSelectableProfile(group, selectedDepartmentCounts, departmentCaps, allowOverflow) {
  if (!Array.isArray(group) || !group.length) return null;

  for (let index = 0; index < group.length; index += 1) {
    const profile = group[index];
    const department = String(profile?.department || "호흡기내과").trim() || "호흡기내과";
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

  const ward = String(profile.ward || "호흡기내과병동").trim() || "호흡기내과병동";
  const department = String(profile.department || "호흡기내과").trim() || "호흡기내과";
  selectedWardCounts.set(ward, (selectedWardCounts.get(ward) || 0) + 1);
  selectedDepartmentCounts.set(department, (selectedDepartmentCounts.get(department) || 0) + 1);
}

async function fetchPatientDetail(id, options = {}) {
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
    devices,
    departmentHint: options.departmentHint,
    wardHint: options.wardHint
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
    department: wardAssignment.department || "호흡기내과",
    diagnosis: `${wardAssignment.department || "호흡기내과"} 외부 FHIR 환자`,
    admitDate: "-",
    bloodType: "-",
    bodyInfo: "-",
    doctor: buildSyntheticDoctorTeam(wardAssignment.department || "호흡기내과", wardAssignment.ward),
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
  const inferredDepartment = inferClinicalDepartment(diagnosisList);
  const departmentHint = String(data.departmentHint || "").trim();
  const wardHint = String(data.wardHint || "").trim();
  const departmentSeed = departmentHint || wardDepartmentFromName(wardHint) || inferredDepartment;
  const wardAssignment = buildSyntheticWardAssignment(data.patient.id, 0, {
    department: departmentSeed,
    diagnosisList
  });
  const department = departmentHint || wardAssignment.department || inferredDepartment;
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
    patientId: data.patient.id,
    dates: timelineDates,
    dateMap,
    ward: wardAssignment.ward,
    department,
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
    room: wardHint ? buildSyntheticWardAssignment(data.patient.id, 0, { department, diagnosisList }).room : wardAssignment.room,
    ward: wardHint || wardAssignment.ward,
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
  const labMetaByDate = {};
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
      if (!labMetaByDate[date]) labMetaByDate[date] = {};
      const category = mapLabCategory(label);
      if (!labsByDate[date][category]) labsByDate[date][category] = {};
      labsByDate[date][category][normalizeLabLabel(label)] = formatNumericValue(value);
      if (!labMetaByDate[date][category]) {
        labMetaByDate[date][category] = {
          performedAt: `${date} ${time}`,
          itemCount: 0
        };
      }
      labMetaByDate[date][category].itemCount += 1;
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
    labMetaByDate,
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
  if (!source) return "호흡기내과";

  if (SURGICAL_ICU_PATTERN.test(source) && /postop|post-op|postoperative|trauma|hemorrhage|bleeding|peritonitis|bowel obstruction|laparotomy|thoracotomy/.test(source)) {
    return "외과계중환자의학과";
  }

  if (MEDICAL_ICU_PATTERN.test(source) && /shock|sepsis|septic|respiratory failure|ards|ventilator|ecmo|intubation|unstable|hemodynamic|aki|dialysis|heart failure|status epilepticus/.test(source)) {
    return "내과계중환자의학과";
  }

  if (/stroke|cerebral|concussion|brain|neuro|seizure|hemiplegia|aphasia|parkinson|dementia/.test(source)) {
    return "신경과";
  }

  if (/fracture|sprain|strain|injury|trauma|whiplash|laceration|wound|postop|post-op|surgery|hernia|appendic|arthr|joint|spine|cholecystitis|ileus|obstruction/.test(source)) {
    return "외과";
  }

  if (/sinusitis|pharyngitis|tonsillitis|otitis|rhinitis|laryng|bronchitis|pneumonia|copd|asthma|pleural effusion|resp/.test(source)) {
    return "호흡기내과";
  }

  return "호흡기내과";
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
  return medicationOrders.all.slice(0, 12).map((item) => ({
    time: item.scheduleTime || inferMedicationTime(item.detail),
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

function buildCriticalCareProfile(input = {}) {
  const ward = String(input.ward || "").trim();
  if (!isCriticalCareWard(ward)) return null;

  const diagnosisText = normalizeClinicalText((input.diagnosisList || []).join(" / "));
  const vitalText = `${input.vital?.bp || ""} ${input.vital?.spo2 || ""} ${input.vital?.rr || ""}`;
  const procedureText = normalizeClinicalText((input.procedures || []).map((item) => procedureLabel(item)).join(" / "));
  const respiratoryFailure = /respiratory failure|ards|intubation|ventilator|ecmo|pneumonia/.test(diagnosisText);
  const shockOrInstability = /shock|sepsis|septic|cardiac arrest|unstable|hemodynamic|gi bleed/.test(diagnosisText) || /8\d\/|9\d\//.test(vitalText);
  const postoperative = /postop|post-op|postoperative|laparotomy|thoracotomy|colectomy|appendectomy|trauma|hemorrhage|bleeding/.test(`${diagnosisText} ${procedureText}`);

  const lines = [];
  const tubes = [];
  const vent = [];
  const tasks = [
    { text: "중환자실 집중관찰", detail: "의식, 활력징후, 혈역학 상태를 집중 감시함" },
    { text: "침습적 라인 감시", detail: "라인 고정, 삽입부위, 감염 징후를 사정함" }
  ];
  const events = [
    { time: "06:00", note: "중환자실 회진 전 활력징후 및 혈역학 상태 재평가함", nurseOffset: 0 },
    { time: "12:00", note: "라인·튜브 위치와 고정 상태 재확인하고 감염 징후 관찰함", nurseOffset: 1 },
    { time: "18:00", note: "교대 전 중환자실 집중 감시 항목 재점검함", nurseOffset: 2 }
  ];
  const planItems = [];

  if (ward === "내과계중환자실") {
    lines.push({ text: "중심정맥관", detail: "혈역학 감시 및 고위험 약물 투여" });
    if (shockOrInstability) {
      lines.push({ text: "동맥관", detail: "침습적 혈압 모니터링" });
      tasks.push({ text: "혈압/관류 상태 확인", detail: "저혈압 및 말초관류 저하 여부를 반복 사정함" });
      planItems.push("혈역학 불안정 여부 재평가");
      events.push({ time: "09:00", note: "혈압 추세 확인하며 혈역학적 불안정 소견 여부를 보고함", nurseOffset: 3 });
    }
    if (respiratoryFailure) {
      tubes.push({ text: "기관내삽관 튜브", detail: "기계환기 유지 중" });
      vent.push({ text: "기계환기", detail: "산소화 및 호흡 상태 집중 감시" });
      tasks.push({ text: "호흡기 관리", detail: "기도 분비물, 산소화, 환기 상태를 지속 관찰함" });
      planItems.push("산소화·환기 지표 추적");
      events.push({ time: "15:00", note: "호흡기 설정과 산소화 반응을 확인하고 흡인 필요 여부를 사정함", nurseOffset: 4 });
    }
  }

  if (ward === "외과계중환자실") {
    lines.push({ text: "동맥관", detail: "수술 후 침습적 혈압 모니터링" });
    lines.push({ text: "중심정맥관", detail: "수액/고위험 약물 및 중심정맥 접근 유지" });
    tasks.push({ text: "수술부위 확인", detail: "출혈, 배액 양상, 드레싱 상태를 사정함" });
    planItems.push("수술 후 출혈 및 배액 변화 추적");
    events.push({ time: "08:00", note: "수술부위 드레싱과 배액 양상을 확인하고 출혈 여부 사정함", nurseOffset: 3 });

    if (postoperative) {
      tubes.push({ text: "배액관", detail: "수술 후 배액량 및 색 변화 관찰" });
      events.push({ time: "14:00", note: "배액량 및 복부/상처 통증 변화를 확인함", nurseOffset: 4 });
    }

    if (respiratoryFailure) {
      vent.push({ text: "기계환기", detail: "수술 후 호흡 보조 유지" });
      tasks.push({ text: "호흡기 관리", detail: "기도 확보 및 산소화 상태를 지속 관찰함" });
    }
  }

  return {
    lines,
    tubes,
    vent,
    tasks,
    events,
    planItems
  };
}

function isCriticalCareWard(ward) {
  return ward === "내과계중환자실" || ward === "외과계중환자실";
}

function mergeCriticalCareLineTube(lineTube, profile) {
  if (!lineTube || !profile) return;
  lineTube.lines = dedupeItems([...(lineTube.lines || []), ...(profile.lines || [])]);
  lineTube.tubes = dedupeItems([...(lineTube.tubes || []), ...(profile.tubes || [])]);
  lineTube.vent = dedupeItems([...(lineTube.vent || []), ...(profile.vent || [])]);
}

function mergeCriticalCareTasks(tasks, profile) {
  if (!Array.isArray(tasks) || !profile) return;
  const merged = [...(profile.tasks || []), ...tasks];
  const seen = new Set();
  tasks.length = 0;
  merged.forEach((item) => {
    const key = `${item?.text || ""}|${item?.detail || ""}`;
    if (!item?.text || seen.has(key)) return;
    seen.add(key);
    tasks.push(item);
  });
}

function mergeCriticalCareEvents(events, profile) {
  if (!Array.isArray(events) || !profile) return;
  const additions = (profile.events || []).map((item, index) => ({
    time: item.time,
    nurse: fallbackNurseName(index + 6),
    note: item.note,
    event: ""
  }));
  events.push(...additions);
  events.sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));
}

function mergeCriticalCarePlanItems(items, profile) {
  if (!Array.isArray(items) || !profile) return;
  const merged = unique([...(profile.planItems || []), ...items]);
  items.length = 0;
  items.push(...merged);
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
  return buildSpecialStudyDetails(reports, procedures, documents).map((item) => item.summary);
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
  const numericCode = Number.parseInt(buildSyntheticCode(id, fallbackIndex), 10) || Math.max(1, fallbackIndex || 1);
  const family = KOREAN_FAMILY_NAMES[numericCode % KOREAN_FAMILY_NAMES.length];
  const first = KOREAN_GIVEN_FIRST[Math.floor(numericCode / 7) % KOREAN_GIVEN_FIRST.length];
  const second = KOREAN_GIVEN_SECOND[Math.floor(numericCode / 13) % KOREAN_GIVEN_SECOND.length];
  return `${family}${first}${second}`;
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
    doctorTeam: wardSpec.doctorTeam,
    department: department || wardDepartmentFromName(wardSpec.ward)
  };
}

function inferWardFromClinicalContext(department, diagnosisText, numericCode) {
  const safeDepartment = String(department || "").trim();
  const diagnosisSource = String(diagnosisText || "");
  const isSurgicalDepartment = safeDepartment === "외과" || safeDepartment === "외과계중환자의학과";
  const mappedWard = DEPARTMENT_WARD_MAP.get(safeDepartment);

  if (mappedWard) {
    return mappedWard;
  }

  if (safeDepartment === "외과계중환자의학과") {
    return "외과계중환자실";
  }

  if (safeDepartment === "내과계중환자의학과") {
    return "내과계중환자실";
  }

  if (SURGICAL_ICU_PATTERN.test(diagnosisSource) && (isSurgicalDepartment || /trauma|hemorrhage|bleeding|postop|post-op|postoperative/.test(diagnosisSource))) {
    return "외과계중환자실";
  }

  if (MEDICAL_ICU_PATTERN.test(diagnosisSource)) {
    return isSurgicalDepartment && !/sepsis|shock|respiratory failure|pneumonia|heart failure|arrhythmia|aki|dialysis/.test(diagnosisSource)
      ? "외과계중환자실"
      : "내과계중환자실";
  }

  if (numericCode % 5 === 0) return "내과계중환자실";
  return "호흡기내과병동";
}

function resolveWardSpec(ward) {
  return SYNTHETIC_WARD_LAYOUT.find((item) => item.ward === ward) || null;
}

function wardDepartmentFromName(ward) {
  if (ward === "내과계중환자실") return "내과계중환자의학과";
  if (ward === "외과계중환자실") return "외과계중환자의학과";
  if (ward === "신경과병동") return "신경과";
  if (ward === "외과병동") return "외과";
  if (ward === "호흡기내과병동") return "호흡기내과";
  return "";
}

function buildSyntheticDoctorTeam(department, ward) {
  const safeDepartment = String(department || "").trim();
  const safeWard = String(ward || "").trim();
  const displayDepartment = safeDepartment || wardDepartmentFromName(safeWard);
  if (displayDepartment) return `${displayDepartment} 주치의팀`;
  if (safeWard) return `${safeWard} 진료팀`;
  return "주치의팀";
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

function sortLabCategoriesServer(categories) {
  return [...new Set((categories || []).filter(Boolean))].sort((left, right) => {
    const leftIndex = LAB_CATEGORY_DISPLAY_ORDER.indexOf(left);
    const rightIndex = LAB_CATEGORY_DISPLAY_ORDER.indexOf(right);
    return (leftIndex === -1 ? LAB_CATEGORY_DISPLAY_ORDER.length : leftIndex) -
      (rightIndex === -1 ? LAB_CATEGORY_DISPLAY_ORDER.length : rightIndex);
  });
}

function dedupeMedicationEntries(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = `${item?.text || ""}|${item?.detail || ""}`;
    if (!item?.text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeMedicationOrders(baseOrders, extraOrders) {
  const all = dedupeMedicationEntries([...(baseOrders?.all || []), ...(extraOrders?.all || [])]);
  const inj = dedupeMedicationEntries([...(baseOrders?.inj || []), ...(extraOrders?.inj || [])]);
  const po = dedupeMedicationEntries([...(baseOrders?.po || []), ...(extraOrders?.po || [])]);
  const running = dedupeMedicationEntries([...(baseOrders?.running || []), ...(extraOrders?.running || [])]);

  return { all, inj, po, running };
}

function buildSyntheticMedicationPlan(input = {}) {
  const ward = String(input.ward || "").trim();
  const diagnosisText = normalizeClinicalText((input.diagnosisList || []).join(" / "));
  const templates = getWardInjectionTemplates(ward, diagnosisText);
  const existingInjectionNames = new Set((input.baseOrders?.inj || []).map((item) => item?.text).filter(Boolean));
  const minimumInjectionCount = isCriticalCareWard(ward) ? 8 : 5;
  const missingCount = Math.max(0, minimumInjectionCount - existingInjectionNames.size);
  const seed = Number.parseInt(buildSyntheticCode(input.patientId, (input.dateIndex || 0) + 1), 10) || (input.dateIndex || 0);
  const scheduledTimes = isCriticalCareWard(ward)
    ? ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]
    : ["06:00", "08:00", "10:00", "14:00", "18:00", "22:00"];
  const extras = [];
  const events = [];
  let offset = 0;

  while (extras.length < missingCount && offset < templates.length * 2) {
    const template = templates[(seed + offset) % templates.length];
    const time = scheduledTimes[extras.length % scheduledTimes.length];
    offset += 1;
    if (!template || existingInjectionNames.has(template.name)) continue;
    existingInjectionNames.add(template.name);
    const detailParts = [template.dose, template.route, template.frequency];
    if (template.note) detailParts.push(template.note);
    const medication = {
      text: template.name,
      detail: detailParts.filter(Boolean).join(" / "),
      prn: Boolean(template.prn),
      scheduleTime: time
    };
    extras.push(medication);
    events.push({
      time,
      nurse: fallbackNurseName((input.dateIndex || 0) + extras.length),
      note: `${template.name} 투약 시행 후 주사부위와 이상반응 여부 확인함`,
      event: template.alert ? template.name : ""
    });
  }

  return {
    orders: {
      all: extras,
      inj: extras,
      po: [],
      running: extras.filter((item) => /infusion|pump|지속주입|continuous/i.test(item.detail))
    },
    events
  };
}

function getWardInjectionTemplates(ward, diagnosisText) {
  if (ward === "내과계중환자실") {
    return [
      { name: "Norepinephrine inj.", dose: "4 mg", route: "IV infusion", frequency: "지속주입", note: "MAP 65 mmHg 이상 목표", alert: true },
      { name: "Vasopressin inj.", dose: "20 U", route: "IV infusion", frequency: "지속주입", note: "혈압 추세에 따라 감량" },
      { name: "Meropenem inj.", dose: "1 g", route: "IV", frequency: "q8h", note: "중증 감염 치료" },
      { name: "Piperacillin/Tazobactam inj.", dose: "4.5 g", route: "IV", frequency: "q6h" },
      { name: "Pantoprazole inj.", dose: "40 mg", route: "IV", frequency: "q24h" },
      { name: "Regular insulin inj.", dose: "sliding scale", route: "SC", frequency: "q6h", note: "혈당 확인 후 투약" },
      { name: "Heparin inj.", dose: "5000 U", route: "SC", frequency: "q12h", note: "DVT 예방" },
      { name: "Furosemide inj.", dose: "20 mg", route: "IV", frequency: "q12h", note: "소변량 추세 확인" },
      { name: "Potassium chloride inj.", dose: "20 mEq", route: "IV", frequency: "보충", note: "전해질 보정" },
      { name: "Acetaminophen inj.", dose: "1 g", route: "IV", frequency: "PRN", note: "발열/통증 시", prn: true }
    ];
  }

  if (ward === "외과계중환자실") {
    return [
      { name: "Propofol inj.", dose: "500 mg", route: "IV infusion", frequency: "지속주입", note: "진정 목표 유지", alert: true },
      { name: "Fentanyl inj.", dose: "1000 mcg", route: "IV infusion", frequency: "지속주입", note: "통증/진정 조절" },
      { name: "Piperacillin/Tazobactam inj.", dose: "4.5 g", route: "IV", frequency: "q6h" },
      { name: "Cefmetazole inj.", dose: "1 g", route: "IV", frequency: "q8h", note: "수술 후 예방적 투약" },
      { name: "Pantoprazole inj.", dose: "40 mg", route: "IV", frequency: "q24h" },
      { name: "Heparin inj.", dose: "5000 U", route: "SC", frequency: "q12h", note: "DVT 예방" },
      { name: "Ondansetron inj.", dose: "4 mg", route: "IV", frequency: "q12h", note: "오심 조절" },
      { name: "Ketorolac inj.", dose: "30 mg", route: "IV", frequency: "q8h", note: "통증 조절" },
      { name: "Albumin inj.", dose: "100 mL", route: "IV", frequency: "보충", note: "수액 반응 평가" },
      { name: "Norepinephrine inj.", dose: "4 mg", route: "IV infusion", frequency: "지속주입", note: "저혈압 시 감량 조절", alert: true }
    ];
  }

  if (ward === "신경과병동") {
    return [
      { name: "Mannitol inj.", dose: "100 mL", route: "IV", frequency: "q8h", note: "신경학적 상태 추적" },
      { name: "Levetiracetam inj.", dose: "500 mg", route: "IV", frequency: "q12h", note: "경련 예방" },
      { name: "Pantoprazole inj.", dose: "40 mg", route: "IV", frequency: "q24h" },
      { name: "Heparin inj.", dose: "5000 U", route: "SC", frequency: "q12h", note: "혈전 예방" },
      { name: "Acetaminophen inj.", dose: "1 g", route: "IV", frequency: "PRN", note: "두통/발열 시", prn: true },
      { name: "Normal saline inj.", dose: "1000 mL", route: "IV infusion", frequency: "continuous", note: "수분 유지" },
      { name: "Ondansetron inj.", dose: "4 mg", route: "IV", frequency: "q12h", note: "오심 조절" }
    ];
  }

  if (ward === "외과병동") {
    return [
      { name: "Cefmetazole inj.", dose: "1 g", route: "IV", frequency: "q8h", note: "수술 후 항생제" },
      { name: "Pantoprazole inj.", dose: "40 mg", route: "IV", frequency: "q24h" },
      { name: "Ketorolac inj.", dose: "30 mg", route: "IV", frequency: "q8h", note: "통증 조절" },
      { name: "Ondansetron inj.", dose: "4 mg", route: "IV", frequency: "q12h" },
      { name: "Heparin inj.", dose: "5000 U", route: "SC", frequency: "q12h" },
      { name: "Normal saline inj.", dose: "1000 mL", route: "IV infusion", frequency: "continuous", note: "수액 유지" },
      { name: "Acetaminophen inj.", dose: "1 g", route: "IV", frequency: "PRN", note: "통증/발열 시", prn: true }
    ];
  }

  return [
    { name: /copd|asthma/.test(diagnosisText) ? "Methylprednisolone inj." : "Ceftriaxone inj.", dose: /copd|asthma/.test(diagnosisText) ? "40 mg" : "2 g", route: "IV", frequency: "q12h" },
    { name: "Azithromycin inj.", dose: "500 mg", route: "IV", frequency: "q24h" },
    { name: "Pantoprazole inj.", dose: "40 mg", route: "IV", frequency: "q24h" },
    { name: "Heparin inj.", dose: "5000 U", route: "SC", frequency: "q12h" },
    { name: "Furosemide inj.", dose: "20 mg", route: "IV", frequency: "q12h", note: "호흡곤란 및 체액 과다 관찰" },
    { name: "Normal saline inj.", dose: "1000 mL", route: "IV infusion", frequency: "continuous", note: "수액 유지" },
    { name: "Acetaminophen inj.", dose: "1 g", route: "IV", frequency: "PRN", note: "발열 시", prn: true }
  ];
}

function findLatestLabCategoryMeta(date, dates, labMetaByDate, category) {
  const candidates = (dates || []).filter((item) => String(item || "").localeCompare(date) <= 0).slice().reverse();
  for (const candidate of candidates) {
    const meta = labMetaByDate?.[candidate]?.[category];
    if (meta) return meta;
  }
  return null;
}

function buildLabSummaryForDate(date, dates, dailyLabs, labMetaByDate = {}) {
  const categories = sortLabCategoriesServer(Object.keys(dailyLabs || {}));
  return categories.map((category) => {
    const meta = findLatestLabCategoryMeta(date, dates, labMetaByDate, category);
    return {
      category,
      performedAt: meta?.performedAt || `${date} 08:00`,
      itemCount: Object.keys((dailyLabs || {})[category] || {}).length || meta?.itemCount || 0,
      referenceOnly: !labMetaByDate?.[date]?.[category]
    };
  });
}

function buildSpecialStudyDetails(reports, procedures, documents) {
  const details = [
    ...(reports || []).map((item, index) => buildDiagnosticReportDetail(item, index)),
    ...(procedures || []).filter(isStudyLikeProcedure).map((item, index) => buildProcedureStudyDetail(item, index)),
    ...(documents || []).filter(isStudyLikeDocument).map((item, index) => buildDocumentStudyDetail(item, index))
  ].filter(Boolean);

  return dedupeSpecialDetailItems(details).slice(0, 8);
}

function dedupeSpecialDetailItems(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = `${item?.kind || ""}|${item?.title || ""}|${item?.performedAt || ""}`;
    if (!item?.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDiagnosticReportDetail(item, index) {
  const title = reportLabel(item);
  if (!title) return null;
  const rawDateTime = item?.effectiveDateTime || item?.issued || item?.meta?.lastUpdated || "";
  const date = reportDate(item) || todayIso();
  const performedAt = `${date} ${normalizeTime(rawDateTime) || "08:00"}`;
  const conclusion = item?.conclusion || codeableText(item?.conclusionCode?.[0]) || `${title} 판독 결과 확인 필요`;
  const kind = /\bct\b|\bmri\b|x-ray|ultrasound|echo|scan|angiography/i.test(title.toLowerCase()) ? "영상검사" : "특수검사";

  return {
    key: `report-${item?.id || index}`,
    kind,
    title,
    performedAt,
    summary: `${title} · ${performedAt} 시행`,
    impression: conclusion,
    body: `${title} 관련 FHIR 판독 결과와 임상 경과를 함께 확인합니다. ${conclusion}`
  };
}

function buildProcedureStudyDetail(item, index) {
  const title = procedureLabel(item);
  if (!title) return null;
  const rawDateTime = item?.performedDateTime || item?.performedPeriod?.start || item?.meta?.lastUpdated || "";
  const date = procedureDate(item) || todayIso();
  const performedAt = `${date} ${normalizeTime(rawDateTime) || "10:00"}`;

  return {
    key: `procedure-${item?.id || index}`,
    kind: /\bct\b|\bmri\b|x-ray|ultrasound|echo|scan/i.test(title.toLowerCase()) ? "영상검사" : "특수검사",
    title,
    performedAt,
    summary: `${title} · ${performedAt} 시행`,
    impression: `${title} 시행 후 결과 확인`,
    body: `${title} 관련 시술/검사가 시행되었습니다. 시술 후 환자 상태와 합병증 여부를 함께 확인합니다.`
  };
}

function buildDocumentStudyDetail(item, index) {
  const title = documentTitle(item);
  if (!title) return null;
  const rawDateTime = item?.date || item?.meta?.lastUpdated || "";
  const date = documentDate(item) || todayIso();
  const performedAt = `${date} ${normalizeTime(rawDateTime) || "11:00"}`;

  return {
    key: `document-${item?.id || index}`,
    kind: /\bct\b|\bmri\b|x-ray|ultrasound|echo|scan|report|영상|판독|특수/i.test(title.toLowerCase()) ? "영상검사" : "특수검사",
    title,
    performedAt,
    summary: `${title} · ${performedAt} 확인`,
    impression: `${title} 관련 문서 확인`,
    body: `${title} 문서를 확인하고 관련 판독/기록 사항을 간호기록과 연계합니다.`
  };
}

function isStudyLikeProcedure(item) {
  return /\bct\b|\bmri\b|x-ray|ultrasound|echo|scan|endoscopy|bronchoscopy|angiography|ercp/i.test(String(procedureLabel(item) || "").toLowerCase());
}

function isStudyLikeDocument(item) {
  return /\bct\b|\bmri\b|x-ray|ultrasound|echo|scan|report|영상|판독|특수/i.test(String(documentTitle(item) || "").toLowerCase());
}

function buildHourlyBaselineEvents(input = {}) {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${String(hour).padStart(2, "0")}:00`,
    nurse: fallbackNurseName((input.dateIndex || 0) + hour),
    note: buildHourlyRoundNote({ ...input, hour }),
    event: hour % 6 === 0 ? "정규 간호" : ""
  }));
}

function buildHourlyRoundNote(input = {}) {
  const hour = Number.parseInt(String(input.hour || 0), 10) || 0;
  const ward = String(input.ward || "").trim();
  const line = input.lineTube?.lines?.[0]?.text || "정맥로";
  const tube = input.lineTube?.tubes?.[0]?.text || input.lineTube?.vent?.[0]?.text || "산소치료";
  const drain = input.lineTube?.drains?.[0]?.text || "배액관";
  const medication = input.medicationOrders?.inj?.[hour % Math.max(1, input.medicationOrders?.inj?.length || 1)]?.text || "정규 주사제";
  const study = input.specialDetails?.[0]?.title || "예정 검사";

  if (ward === "내과계중환자실") {
    const notes = [
      `야간 상태사정 후 혈압, 맥박, 호흡, SpO2 및 의식수준 재평가하고 ${line} 주입상태 확인함`,
      "체위변경 시행하고 피부상태, 욕창위험부위, 말초순환 상태 확인함",
      `${medication} 투약 시행 후 주사부위, 펌프 설정, 약물 반응 여부 확인함`,
      "진정/통증 점수와 pupil 반응, 사지 말초순환 상태 재사정함",
      "활력징후 추세와 urine output 확인하고 이상소견 여부 기록함",
      "아침 채혈 및 검사 오더 준비, 혈당 확인, line flushing 시행함",
      `${tube} 유지상태와 기도 분비물 여부 관찰하고 필요시 흡인 준비함`,
      "교대 인계 후 당일 오더 및 중점 관찰 항목 재확인함",
      "주치의 회진 동행 후 치료 계획과 투약 변경 사항 확인함",
      `${line} 삽입부 드레싱과 고정 상태 확인하고 감염 징후 관찰함`,
      `${study} 준비 상태와 환자 설명 여부 재확인함`,
      "I/O 합산하고 체액 균형, 부종, 말초냉감 여부 평가함",
      `${medication} 정규 시간 투약 후 혈압 및 반응 모니터링 지속함`,
      "체위변경 및 구강간호 시행하고 보호자 문의사항 설명함",
      `${drain} 배액량과 색 변화 확인 후 기록함`,
      "ABP/SpO2/호흡양상 추세 확인 후 필요시 주치의에게 보고함",
      "혈당 및 의식수준 재사정하고 저혈당/섬망 징후 확인함",
      `${medication} 추가 투약 후 약효 및 이상반응 확인함`,
      "저녁 회진 후 오더 변경사항 반영하고 야간 계획 재정리함",
      "야간 초기 상태사정과 체위변경 시행함",
      "피부, 말초순환, 체온 추세 확인하고 보온 상태 점검함",
      `${tube} 유지상태와 알람 여부 확인하고 안전간호 수행함`,
      `${line} 수액 교체 및 펌프 알람 점검 후 기록함`,
      "자정 전 상태 재평가 후 이상소견 없음 확인함"
    ];
    return notes[hour];
  }

  if (ward === "외과계중환자실") {
    const notes = [
      "수술 후 전신상태 사정, 활력징후 및 의식수준 확인함",
      `${drain} 배액량과 색, 창상 드레싱 상태 확인함`,
      `${medication} 투약 시행 후 통증 및 진정 반응 확인함`,
      "복부/수술부위 팽만, 출혈, 삼출 여부 재평가함",
      "활력징후 및 통증 점수 재측정 후 기록함",
      "아침 채혈과 검사 준비, 금식 여부, 수술 후 오더 재확인함",
      `${line} 라인 및 수액 주입 상태 확인함`,
      "교대 인계 후 수술 경과, 배액관, 금식 계획 재확인함",
      "주치의 회진 후 상처관리 및 통증조절 계획 확인함",
      `${drain} 배액량 합산 후 증가 여부 확인함`,
      `${study} 시행 준비 및 이송 전 상태 확인함`,
      "I/O 합산, 복부사정, 장음 및 오심 여부 확인함",
      `${medication} 정규 투약 후 통증 완화 여부 재평가함`,
      "체위변경 및 폐합병증 예방 위한 심호흡 격려함",
      "상처 드레싱 오염 여부와 출혈 징후 확인함",
      "오더 변경사항 확인 후 주사제/수액 스케줄 조정함",
      "저녁 활력징후 측정 및 통증 재사정함",
      `${medication} 추가 투약 후 오심/어지럼 여부 확인함`,
      "저녁 회진 후 야간 중점관찰 항목 정리함",
      "야간 상태사정 및 안전간호 시행함",
      `${drain} 배액 상태와 소변량 확인함`,
      `${line} 주입속도 및 펌프 알람 점검함`,
      "수술부위 통증, 발열, 출혈 여부 재확인함",
      "자정 전 전신상태 재평가 후 기록함"
    ];
    return notes[hour];
  }

  if (ward === "신경과병동") {
    const notes = [
      "의식수준, GCS, 동공크기/반응 및 사지근력 사정함",
      "체위변경 시행하고 흡인 예방 위해 침상머리 상승 유지함",
      `${medication} 투약 시행 후 이상반응 및 주사부위 확인함`,
      "신경학적 변화, 언어상태, 안면비대칭 여부 재확인함",
      "활력징후 측정 후 두통, 어지럼, 오심 여부 확인함",
      "아침 채혈 및 검사 준비 후 금식/이송 여부 확인함",
      `${tube} 유지상태와 연하곤란/흡인 징후 확인함`,
      "교대 인계 후 낙상예방, aspiration precaution 재교육함",
      "주치의 회진 후 재활 및 검사 계획 확인함",
      "사지운동 범위와 체위변경 수행, 피부상태 확인함",
      `${study} 결과 및 판독 내용 확인함`,
      "식이 섭취량, 연하 상태, 수분 섭취량 확인함",
      `${medication} 정규 시간 투약 후 통증/어지럼 여부 재평가함`,
      "신경학적 증상 변화 여부와 보호자 문의사항 확인함",
      "활동 허용 범위 내 보행/이동 보조 시행함",
      "혈압, 맥박, 의식수준 추세 확인 후 기록함",
      "낙상예방 환경 재점검 및 호출벨 사용 교육함",
      `${medication} 추가 투약 후 반응 확인함`,
      "저녁 회진 후 다음 근무조에 인계할 중점사항 정리함",
      "야간 상태사정, 동공반응, 편마비 악화 여부 확인함",
      "체위변경 및 피부간호 시행함",
      `${tube} 유지상태와 기도분비물 여부 관찰함`,
      "밤 시간 활력징후 및 신경학적 변화 재확인함",
      "자정 전 상태 재평가 후 기록함"
    ];
    return notes[hour];
  }

  if (ward === "외과병동") {
    const notes = [
      "야간 상태사정 후 활력징후와 통증 정도 확인함",
      "체위변경 및 피부상태, 낙상위험도 재확인함",
      `${medication} 투약 시행 후 주사부위와 이상반응 확인함`,
      "복부/수술부위 통증, 드레싱 상태, 배변 여부 관찰함",
      "활력징후와 오심/구토 여부 재사정함",
      "아침 채혈 및 검사 준비, 금식 여부 재확인함",
      `${line} 유지상태와 수액 주입속도 점검함`,
      "교대 인계 후 당일 수술/처치 계획 확인함",
      "회진 후 상처관리 및 식이 진행 계획 확인함",
      `${drain} 배액량과 창상 상태 확인함`,
      `${study} 시행 준비 및 결과 확인 여부 점검함`,
      "I/O 합산 후 복부팽만, 배변, 배뇨 상태 확인함",
      `${medication} 정규 투약 후 통증 완화 여부 재평가함`,
      "보행 가능 범위 확인 후 조기이상 보조 시행함",
      "창상 드레싱과 출혈 징후 확인함",
      "활력징후 추세 및 통증 조절 상태 기록함",
      "식이 진행, 오심 여부, 장음 상태 확인함",
      `${medication} 추가 투약 후 반응 확인함`,
      "저녁 회진 후 오더 변경사항 확인함",
      "야간 상태사정과 안전간호 시행함",
      "체위변경 및 피부간호 시행함",
      `${line} 주입상태와 알람 여부 확인함`,
      "통증/발열/출혈 여부 재확인함",
      "자정 전 상태 재평가 후 기록함"
    ];
    return notes[hour];
  }

  const notes = [
    "야간 상태사정 후 활력징후, 호흡양상, SpO2 확인함",
    "체위변경 시행하고 피부상태 및 객담 배출 상태 확인함",
    `${medication} 투약 시행 후 이상반응과 주사부위 상태 확인함`,
    "호흡곤란, 기침, 객담 양상 및 흉부 불편감 여부 재확인함",
    "활력징후와 산소포화도 재측정 후 기록함",
    "아침 채혈 및 검사 준비, 흡입치료 스케줄 확인함",
    `${tube} 유지상태와 산소 공급량 점검함`,
    "교대 인계 후 당일 검사/투약 계획 확인함",
    "회진 후 항생제, 산소치료, 재활 계획 확인함",
    "호흡운동, 기침 격려, 객담 배출 교육 시행함",
    `${study} 결과 및 판독 내용 확인함`,
    "식사량, 수분섭취, I/O 상태 확인함",
    `${medication} 정규 투약 후 호흡곤란 완화 여부 재평가함`,
    "호흡음, 객담 색/양, 흉부불편감 여부 확인함",
    "조기 이상 및 낙상예방 교육 시행함",
    "활력징후와 산소 요구량 추세 확인 후 기록함",
    "저녁 식이 후 기침/호흡곤란 악화 여부 확인함",
    `${medication} 추가 투약 후 반응 확인함`,
    "저녁 회진 후 야간 중점관찰 항목 정리함",
    "야간 상태사정과 안전간호 시행함",
    "체위변경 및 구강간호, 객담 배출 격려함",
    `${tube} 유지상태와 알람 여부 확인함`,
    "호흡곤란, 발열, 흉부불편감 여부 재확인함",
    "자정 전 상태 재평가 후 기록함"
  ];
  return notes[hour];
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
    const baseMedicationOrders = buildMedicationOrders(dailyMedicationSet.medications, dailyMedicationSet.administrations);
    const dailyDiagnosisList = unique(dailyConditions.map(conditionLabel)).slice(0, 6);
    const dailyLabs = input.observationSummary.labsByDate[date] || input.observationSummary.latestLabs || {};
    const dailyLineTube = buildDailyLineTubeSummary({
      baseLineTube: input.lineTube,
      procedures: dailyProcedures,
      serviceRequests: dailyServiceRequests,
      observations: dailyObservations,
      medicationOrders: baseMedicationOrders,
      carePlans: dailyCarePlans,
      useBaseFallback: date === input.dates[input.dates.length - 1]
    });
    const syntheticMedicationPlan = buildSyntheticMedicationPlan({
      patientId: input.patientId,
      dateIndex: index,
      ward: input.ward,
      diagnosisList: dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
      baseOrders: baseMedicationOrders
    });
    const dailyMedicationOrders = mergeMedicationOrders(baseMedicationOrders, syntheticMedicationPlan.orders);
    const dailyDoctorOrders = buildDoctorOrders(dailyMedicationOrders, dailyServiceRequests, dailyCarePlans);
    const dailyNursingTasks = buildNursingTasks(dailyLineTube, dailyCarePlans, dailyDocuments);
    const dailyPlanItems = buildPlanItems(dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList, dailyCarePlans, dailyServiceRequests);
    const specialDetails = buildSpecialStudyDetails(dailyReports, dailyProcedures, dailyDocuments);
    const baselineHourlyEvents = buildHourlyBaselineEvents({
      dateIndex: index,
      ward: input.ward,
      lineTube: dailyLineTube,
      medicationOrders: dailyMedicationOrders,
      specialDetails
    });
    const eventNotes = [
      ...baselineHourlyEvents,
      ...(input.observationSummary.eventsByDate[date] || []),
      ...(administrationEvents[date] || []),
      ...(reportEvents[date] || []),
      ...(nursingTaskEvents[date] || []),
      ...(orderEvents[date] || []),
      ...(syntheticMedicationPlan.events || [])
    ].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

    const criticalCareProfile = buildCriticalCareProfile({
      ward: input.ward,
      department: input.department,
      diagnosisList: dailyDiagnosisList.length ? dailyDiagnosisList : input.diagnosisList,
      procedures: dailyProcedures,
      vital: dayVital
    });

    mergeCriticalCareLineTube(dailyLineTube, criticalCareProfile);
    mergeCriticalCareTasks(dailyNursingTasks, criticalCareProfile);
    mergeCriticalCareEvents(eventNotes, criticalCareProfile, date);
    mergeCriticalCarePlanItems(dailyPlanItems, criticalCareProfile);

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
      hourly: buildHourlyTimeline(date, dayVital, eventNotes),
      io: input.observationSummary.ioByDate[date] || { input: "-", totalOutput: "-" },
      activity: findActivity(dailyCarePlans.length ? dailyCarePlans : input.carePlans, input.latestEncounter),
      orders: {
        inj: dailyMedicationOrders.inj,
        po: dailyMedicationOrders.po
      },
      labs: dailyLabs,
      labSummary: buildLabSummaryForDate(date, input.dates, dailyLabs, input.observationSummary.labMetaByDate || {}),
      specials: buildSpecialsForDate(dailyReports, dailyProcedures, dailyDocuments),
      specialDetails,
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

  (events || []).slice(0, 160).forEach((event) => {
    const hour = clampHour(event.time);
    const note = event.nurse ? `${event.note} (${event.nurse})` : event.note;
    hourly[hour].notes.push(note);
    if (event.event && !hourly[hour].event) hourly[hour].event = event.event;
  });

  hourly.forEach((slot) => {
    if (!slot.notes.length) {
      slot.notes.push("정규 모니터링 및 환자 상태 재사정 시행함");
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

const ACTIVE_DEPARTMENT_SEED_SEARCHES = [
  { department: "내과계중환자의학과", term: "sepsis", count: 14 },
  { department: "내과계중환자의학과", term: "septic shock", count: 12 },
  { department: "내과계중환자의학과", term: "respiratory failure", count: 12 },
  { department: "내과계중환자의학과", term: "acute heart failure", count: 10 },
  { department: "내과계중환자의학과", term: "critical illness", count: 10 },
  { department: "외과계중환자의학과", term: "postoperative", count: 14 },
  { department: "외과계중환자의학과", term: "trauma", count: 12 },
  { department: "외과계중환자의학과", term: "hemorrhage", count: 12 },
  { department: "외과계중환자의학과", term: "peritonitis", count: 10 },
  { department: "외과계중환자의학과", term: "bowel obstruction", count: 10 },
  { department: "신경과", term: "stroke", count: 14 },
  { department: "신경과", term: "cerebral infarction", count: 12 },
  { department: "신경과", term: "intracranial hemorrhage", count: 12 },
  { department: "신경과", term: "seizure", count: 10 },
  { department: "외과", term: "appendicitis", count: 14 },
  { department: "외과", term: "hernia", count: 12 },
  { department: "외과", term: "wound", count: 12 },
  { department: "외과", term: "cholecystitis", count: 10 },
  { department: "외과", term: "abdominal pain", count: 10 },
  { department: "호흡기내과", term: "pneumonia", count: 14 },
  { department: "호흡기내과", term: "copd", count: 12 },
  { department: "호흡기내과", term: "asthma exacerbation", count: 10 },
  { department: "호흡기내과", term: "pleural effusion", count: 10 },
  { department: "소화기내과", term: "liver cirrhosis", count: 12 },
  { department: "소화기내과", term: "gastrointestinal bleeding", count: 12 },
  { department: "소화기내과", term: "pancreatitis", count: 10 },
  { department: "소화기내과", term: "colitis", count: 10 },
  { department: "신장내과", term: "chronic kidney disease", count: 12 },
  { department: "신장내과", term: "acute kidney injury", count: 12 },
  { department: "신장내과", term: "end stage renal disease", count: 10 },
  { department: "신장내과", term: "glomerulonephritis", count: 10 }
];

const ACTIVE_SYNTHETIC_WARD_LAYOUT = [
  { ward: "내과계중환자실", roomPrefix: "MICU", roomBase: 1, roomDigits: 2, doctorTeam: "내과계중환자 진료팀" },
  { ward: "외과계중환자실", roomPrefix: "SICU", roomBase: 21, roomDigits: 2, doctorTeam: "외과계중환자 진료팀" },
  { ward: "신경과병동", roomPrefix: "N", roomBase: 301, roomDigits: 3, doctorTeam: "신경과 진료팀" },
  { ward: "외과병동", roomPrefix: "S", roomBase: 401, roomDigits: 3, doctorTeam: "외과 진료팀" },
  { ward: "호흡기내과병동", roomPrefix: "P", roomBase: 501, roomDigits: 3, doctorTeam: "호흡기내과 진료팀" },
  { ward: "소화기내과병동", roomPrefix: "GI", roomBase: 601, roomDigits: 3, doctorTeam: "소화기내과 진료팀" },
  { ward: "신장내과병동", roomPrefix: "R", roomBase: 701, roomDigits: 3, doctorTeam: "신장내과 진료팀" }
];

const ACTIVE_WARD_DISPLAY_ORDER = ACTIVE_SYNTHETIC_WARD_LAYOUT.map((item) => item.ward);
const ACTIVE_DEPARTMENT_PRIORITY_ORDER = [
  "내과계중환자의학과",
  "외과계중환자의학과",
  "신경과",
  "외과",
  "호흡기내과",
  "소화기내과",
  "신장내과"
];

const ACTIVE_DEPARTMENT_WARD_MAP = new Map([
  ["내과계중환자의학과", "내과계중환자실"],
  ["외과계중환자의학과", "외과계중환자실"],
  ["신경과", "신경과병동"],
  ["외과", "외과병동"],
  ["호흡기내과", "호흡기내과병동"],
  ["소화기내과", "소화기내과병동"],
  ["신장내과", "신장내과병동"]
]);

const ACTIVE_WARD_TARGET_COUNTS_60 = new Map([
  ["내과계중환자실", 10],
  ["외과계중환자실", 10],
  ["신경과병동", 10],
  ["외과병동", 10],
  ["호흡기내과병동", 10],
  ["소화기내과병동", 5],
  ["신장내과병동", 5]
]);

const ACTIVE_WARD_TARGET_RATIO = {
  내과계중환자실: 1 / 6,
  외과계중환자실: 1 / 6,
  신경과병동: 1 / 6,
  외과병동: 1 / 6,
  호흡기내과병동: 1 / 6,
  소화기내과병동: 1 / 12,
  신장내과병동: 1 / 12
};

const ACTIVE_KOREAN_FAMILY_NAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"];
const ACTIVE_KOREAN_GIVEN_FIRST = ["민", "서", "지", "하", "도", "예", "유", "주", "채", "현", "준", "시", "다", "가", "태", "수", "재", "은"];
const ACTIVE_KOREAN_GIVEN_SECOND = ["준", "윤", "아", "미", "린", "원", "리", "빈", "율", "호", "솔", "진", "연", "희", "보", "람", "경", "수"];

async function fetchDepartmentSeedPatientResources(targetCount) {
  const seedGroups = new Map();
  const seedHints = new Map();
  const selectedIds = [];
  const selectedIdSet = new Set();

  const seedResults = await mapInBatches(ACTIVE_DEPARTMENT_SEED_SEARCHES, 6, async (search) => {
    const conditions = await safeFetchResources(
      `/Condition?code:text=${encodeURIComponent(search.term)}&_count=${search.count}&_elements=id,subject,code,recordedDate,onsetDateTime`
    );
    return { search, conditions };
  });

  seedResults.forEach(({ search, conditions }) => {
    const existingIds = seedGroups.get(search.department) || [];
    const nextIds = [];

    conditions.forEach((condition) => {
      const patientId = extractReferenceId(condition?.subject?.reference);
      if (!patientId) return;
      nextIds.push(patientId);

      const hint = seedHints.get(patientId) || {
        department: search.department,
        diagnosisList: []
      };

      const label = conditionLabel(condition);
      if (label) {
        hint.diagnosisList = unique([...hint.diagnosisList, label]).slice(0, 6);
      }

      if (getDepartmentSortIndex(search.department) < getDepartmentSortIndex(hint.department)) {
        hint.department = search.department;
      }

      seedHints.set(patientId, hint);
    });

    seedGroups.set(search.department, unique([...existingIds, ...nextIds]));
  });

  const baseQuota = Math.min(
    DEPARTMENT_MIN_PATIENT_COUNT,
    Math.max(1, Math.floor(targetCount / Math.max(1, ACTIVE_DEPARTMENT_PRIORITY_ORDER.length)))
  );

  ACTIVE_DEPARTMENT_PRIORITY_ORDER.forEach((department) => {
    const group = (seedGroups.get(department) || []).slice();
    let selectedForDepartment = 0;

    while (group.length && selectedIds.length < targetCount && selectedForDepartment < baseQuota) {
      const nextId = String(group.shift() || "").trim();
      if (!nextId || selectedIdSet.has(nextId)) continue;
      selectedIds.push(nextId);
      selectedIdSet.add(nextId);
      selectedForDepartment += 1;
    }

    seedGroups.set(department, group);
  });

  while (selectedIds.length < targetCount) {
    let addedInRound = 0;

    ACTIVE_DEPARTMENT_PRIORITY_ORDER.forEach((department) => {
      if (selectedIds.length >= targetCount) return;
      const group = seedGroups.get(department) || [];
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

  return {
    resources: await fetchPatientResourcesByIds(selectedIds),
    seedHints
  };
}

function selectBalancedPatientProfiles(profiles, count) {
  const candidates = (profiles || []).filter(Boolean).sort(compareClinicalProfiles);
  const wardGroups = buildWardProfileGroups(candidates);
  const wardTargets = buildWardSelectionTargets(count);
  const selected = [];
  const selectedIds = new Set();
  const selectedWardCounts = new Map();
  const selectedDepartmentCounts = new Map();

  let addedInRound = true;
  while (selected.length < count && addedInRound) {
    addedInRound = false;

    ACTIVE_WARD_DISPLAY_ORDER.forEach((ward) => {
      if (selected.length >= count) return;
      const target = wardTargets.get(ward) || 0;
      const current = selectedWardCounts.get(ward) || 0;
      if (current >= target) return;

      const group = wardGroups.get(ward) || [];
      while (group.length) {
        const profile = group.shift();
        if (!profile || selectedIds.has(String(profile.id))) continue;
        registerSelectedProfile(profile, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
        addedInRound = true;
        break;
      }
    });
  }

  if (selected.length < count) {
    const leftovers = [];
    wardGroups.forEach((group) => leftovers.push(...group));
    leftovers
      .sort(compareClinicalProfiles)
      .forEach((profile) => {
        if (!profile || selected.length >= count || selectedIds.has(String(profile.id))) return;
        const ward = String(profile.ward || "").trim();
        const target = wardTargets.get(ward) || 0;
        const current = selectedWardCounts.get(ward) || 0;
        if (ward && target > 0 && current >= target) return;
        registerSelectedProfile(profile, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
      });
  }

  if (selected.length < count) {
    const leftovers = [];
    wardGroups.forEach((group) => leftovers.push(...group));
    leftovers
      .sort(compareClinicalProfiles)
      .forEach((profile) => {
        if (!profile || selected.length >= count || selectedIds.has(String(profile.id))) return;
        registerSelectedProfile(profile, selected, selectedIds, selectedWardCounts, selectedDepartmentCounts);
      });
  }

  return selected.slice(0, count);
}

function getDepartmentSortIndex(department) {
  const normalized = String(department || "").trim();
  const fixedIndex = ACTIVE_DEPARTMENT_PRIORITY_ORDER.indexOf(normalized);
  return fixedIndex >= 0 ? fixedIndex : ACTIVE_DEPARTMENT_PRIORITY_ORDER.length + 1;
}

function buildWardProfileGroups(profiles) {
  const groups = new Map();
  ACTIVE_WARD_DISPLAY_ORDER.forEach((ward) => groups.set(ward, []));

  (profiles || []).forEach((profile) => {
    const ward = String(profile?.ward || "호흡기내과병동").trim() || "호흡기내과병동";
    if (!groups.has(ward)) groups.set(ward, []);
    groups.get(ward).push(profile);
  });

  groups.forEach((items, ward) => {
    groups.set(ward, items.slice().sort(compareClinicalProfiles));
  });

  return groups;
}

function buildWardSelectionTargets(count) {
  if (count === 60) {
    return new Map(ACTIVE_WARD_TARGET_COUNTS_60);
  }

  const targets = new Map();
  let allocated = 0;

  ACTIVE_WARD_DISPLAY_ORDER.forEach((ward) => {
    const rawTarget = Math.max(1, Math.round(count * (ACTIVE_WARD_TARGET_RATIO[ward] || 0)));
    targets.set(ward, rawTarget);
    allocated += rawTarget;
  });

  while (allocated > count) {
    const ward = ACTIVE_WARD_DISPLAY_ORDER
      .slice()
      .sort((left, right) => (targets.get(right) || 0) - (targets.get(left) || 0))
      .find((item) => (targets.get(item) || 0) > 1);
    if (!ward) break;
    targets.set(ward, (targets.get(ward) || 0) - 1);
    allocated -= 1;
  }

  while (allocated < count) {
    const ward = ACTIVE_WARD_DISPLAY_ORDER
      .slice()
      .sort((left, right) => (targets.get(left) || 0) - (targets.get(right) || 0))[0];
    targets.set(ward, (targets.get(ward) || 0) + 1);
    allocated += 1;
  }

  return targets;
}

function inferClinicalDepartment(diagnosisList) {
  const source = normalizeClinicalText((diagnosisList || []).join(" / "));
  if (!source) return "호흡기내과";

  if (SURGICAL_ICU_PATTERN.test(source) && /postop|post-op|postoperative|trauma|hemorrhage|bleeding|peritonitis|bowel obstruction|laparotomy|thoracotomy/.test(source)) {
    return "외과계중환자의학과";
  }

  if (MEDICAL_ICU_PATTERN.test(source) && /shock|sepsis|septic|respiratory failure|ards|ventilator|ecmo|intubation|unstable|hemodynamic|heart failure|status epilepticus/.test(source)) {
    return "내과계중환자의학과";
  }

  if (/stroke|cerebral|concussion|brain|neuro|seizure|hemiplegia|aphasia|parkinson|dementia/.test(source)) {
    return "신경과";
  }

  if (/hematemesis|melena|hematochezia|gi bleed|gastrointestinal|cirrhosis|hepatitis|pancreatitis|colitis|hepatic|varix|cholangitis|ascites|liver failure/.test(source)) {
    return "소화기내과";
  }

  if (/ckd|esrd|renal|kidney disease|kidney injury|glomerulonephritis|proteinuria|nephrotic|nephritic|uremia|dialysis/.test(source)) {
    return "신장내과";
  }

  if (/fracture|sprain|strain|injury|trauma|whiplash|laceration|wound|postop|post-op|surgery|hernia|appendic|arthr|joint|spine|cholecystitis|ileus|obstruction/.test(source)) {
    return "외과";
  }

  if (/sinusitis|pharyngitis|tonsillitis|otitis|rhinitis|laryng|bronchitis|pneumonia|copd|asthma|pleural effusion|resp/.test(source)) {
    return "호흡기내과";
  }

  return "호흡기내과";
}

function buildSyntheticPatientLabel(id, fallbackIndex = 0) {
  const numericCode = Number.parseInt(buildSyntheticCode(id, fallbackIndex), 10) || Math.max(1, fallbackIndex || 1);
  const familyIndex = numericCode % ACTIVE_KOREAN_FAMILY_NAMES.length;
  const givenCode = Math.floor(numericCode / ACTIVE_KOREAN_FAMILY_NAMES.length);
  const firstIndex = givenCode % ACTIVE_KOREAN_GIVEN_FIRST.length;
  const secondIndex = Math.floor(givenCode / ACTIVE_KOREAN_GIVEN_FIRST.length) % ACTIVE_KOREAN_GIVEN_SECOND.length;
  return `${ACTIVE_KOREAN_FAMILY_NAMES[familyIndex]}${ACTIVE_KOREAN_GIVEN_FIRST[firstIndex]}${ACTIVE_KOREAN_GIVEN_SECOND[secondIndex]}`;
}

function buildSyntheticWardAssignment(id, fallbackIndex = 0, options = {}) {
  const numericCode = Number.parseInt(buildSyntheticCode(id, fallbackIndex), 10) || Math.max(1, fallbackIndex || 1);
  const absoluteIndex = Math.max(0, numericCode - 1);
  const diagnosisText = normalizeClinicalText((options.diagnosisList || []).join(" / "));
  const department = String(options.department || "").trim();
  const preferredWard = inferWardFromClinicalContext(department, diagnosisText, numericCode);
  const wardSpec = resolveWardSpec(preferredWard) || ACTIVE_SYNTHETIC_WARD_LAYOUT[absoluteIndex % ACTIVE_SYNTHETIC_WARD_LAYOUT.length];
  const slot = Math.floor(absoluteIndex / Math.max(1, ACTIVE_SYNTHETIC_WARD_LAYOUT.length));
  const roomNumber = String(wardSpec.roomBase + slot).padStart(wardSpec.roomDigits, "0");

  return {
    ward: wardSpec.ward,
    room: `${wardSpec.roomPrefix}-${roomNumber}`,
    doctorTeam: wardSpec.doctorTeam,
    department: department || wardDepartmentFromName(wardSpec.ward)
  };
}

function inferWardFromClinicalContext(department, diagnosisText, numericCode) {
  const safeDepartment = String(department || "").trim();
  const diagnosisSource = String(diagnosisText || "");
  const mappedWard = ACTIVE_DEPARTMENT_WARD_MAP.get(safeDepartment);

  if (mappedWard) {
    return mappedWard;
  }

  if (SURGICAL_ICU_PATTERN.test(diagnosisSource)) {
    return "외과계중환자실";
  }

  if (MEDICAL_ICU_PATTERN.test(diagnosisSource) && /shock|sepsis|septic|respiratory failure|ards|ventilator|ecmo|intubation|unstable|hemodynamic/.test(diagnosisSource)) {
    return "내과계중환자실";
  }

  if (/stroke|cerebral|intracranial|seizure|brain|neuro/.test(diagnosisSource)) {
    return "신경과병동";
  }

  if (/hematemesis|melena|hematochezia|gi bleed|gastrointestinal|cirrhosis|hepatitis|pancreatitis|colitis|hepatic|varix|cholangitis|ascites|liver failure/.test(diagnosisSource)) {
    return "소화기내과병동";
  }

  if (/ckd|esrd|renal|kidney disease|kidney injury|glomerulonephritis|proteinuria|nephrotic|nephritic|uremia|dialysis/.test(diagnosisSource)) {
    return "신장내과병동";
  }

  if (/fracture|sprain|strain|injury|trauma|whiplash|laceration|wound|postop|post-op|surgery|hernia|appendic|arthr|joint|spine|cholecystitis|ileus|obstruction/.test(diagnosisSource)) {
    return "외과병동";
  }

  if (numericCode % 7 === 0) return "신장내과병동";
  if (numericCode % 6 === 0) return "소화기내과병동";
  return "호흡기내과병동";
}

function resolveWardSpec(ward) {
  return ACTIVE_SYNTHETIC_WARD_LAYOUT.find((item) => item.ward === ward) || null;
}

function wardDepartmentFromName(ward) {
  const safeWard = String(ward || "").trim();
  if (safeWard === "내과계중환자실") return "내과계중환자의학과";
  if (safeWard === "외과계중환자실") return "외과계중환자의학과";
  if (safeWard === "신경과병동") return "신경과";
  if (safeWard === "외과병동") return "외과";
  if (safeWard === "호흡기내과병동") return "호흡기내과";
  if (safeWard === "소화기내과병동") return "소화기내과";
  if (safeWard === "신장내과병동") return "신장내과";
  return "";
}

function buildSyntheticDoctorTeam(department, ward) {
  const safeDepartment = String(department || "").trim();
  const safeWard = String(ward || "").trim();
  const displayDepartment = safeDepartment || wardDepartmentFromName(safeWard);
  if (displayDepartment) return `${displayDepartment} 주치의팀`;
  if (safeWard) return `${safeWard} 진료팀`;
  return "주치의팀";
}

function buildWardTargetSequence(count) {
  const targets = buildWardSelectionTargets(count);
  const sequence = [];
  ACTIVE_WARD_DISPLAY_ORDER.forEach((ward) => {
    for (let index = 0; index < (targets.get(ward) || 0); index += 1) {
      sequence.push(ward);
    }
  });
  return sequence.slice(0, count);
}

function scoreProfileForWard(profile, ward) {
  const department = String(profile?.department || "").trim();
  const diagnosis = normalizeClinicalText(profile?.diagnosis || "");
  const targetDepartment = wardDepartmentFromName(ward);
  let score = Number(profile?.clinicalQualityScore || 0);

  if (String(profile?.ward || "").trim() === ward) score += 100;
  if (department === targetDepartment) score += 60;

  if (ward === "내과계중환자실" && /sepsis|shock|respiratory failure|critical|heart failure|ventilator|ecmo/.test(diagnosis)) score += 40;
  if (ward === "외과계중환자실" && /postop|post-op|postoperative|trauma|hemorrhage|peritonitis|bowel obstruction/.test(diagnosis)) score += 40;
  if (ward === "신경과병동" && /stroke|cerebral|intracranial|seizure|neuro/.test(diagnosis)) score += 40;
  if (ward === "외과병동" && /appendic|hernia|wound|surgery|cholecystitis|obstruction/.test(diagnosis)) score += 40;
  if (ward === "호흡기내과병동" && /pneumonia|copd|asthma|pleural effusion|resp/.test(diagnosis)) score += 40;
  if (ward === "소화기내과병동" && /cirrhosis|hepatitis|pancreatitis|colitis|gi bleed|hematemesis|melena|ascites|varix/.test(diagnosis)) score += 40;
  if (ward === "신장내과병동" && /kidney|renal|ckd|esrd|dialysis|glomerulonephritis|uremia/.test(diagnosis)) score += 40;

  return score;
}

function buildDepartmentDiagnosisFallback(department, currentDiagnosis, numericCode = 0) {
  const templates = {
    내과계중환자의학과: [
      "Sepsis with septic shock",
      "Acute respiratory failure",
      "Acute decompensated heart failure",
      "Severe pneumonia"
    ],
    외과계중환자의학과: [
      "Postoperative hemorrhage",
      "Traumatic injury with hemorrhagic shock",
      "Peritonitis after bowel perforation",
      "Postoperative respiratory failure"
    ],
    신경과: [
      "Acute ischemic stroke",
      "Intracranial hemorrhage",
      "Seizure disorder exacerbation",
      "Cerebral infarction"
    ],
    외과: [
      "Acute appendicitis",
      "Postoperative wound care",
      "Inguinal hernia",
      "Cholecystitis"
    ],
    호흡기내과: [
      "Pneumonia",
      "COPD exacerbation",
      "Asthma exacerbation",
      "Pleural effusion"
    ],
    소화기내과: [
      "Liver cirrhosis with ascites",
      "Gastrointestinal bleeding",
      "Acute pancreatitis",
      "Infectious colitis"
    ],
    신장내과: [
      "Chronic kidney disease",
      "Acute kidney injury",
      "End stage renal disease",
      "Glomerulonephritis"
    ]
  };

  const source = String(currentDiagnosis || "").trim();
  if (isDiagnosisAlignedToDepartment(department, source)) return source;

  const options = templates[department] || templates["호흡기내과"];
  return options[numericCode % options.length];
}

function isDiagnosisAlignedToDepartment(department, diagnosis) {
  const text = normalizeClinicalText(diagnosis);
  if (!text) return false;
  if (department === "내과계중환자의학과") return /sepsis|shock|respiratory failure|critical|heart failure|ventilator|ecmo/.test(text);
  if (department === "외과계중환자의학과") return /postop|post-op|postoperative|trauma|hemorrhage|peritonitis|bowel obstruction/.test(text);
  if (department === "신경과") return /stroke|cerebral|intracranial|seizure|neuro/.test(text);
  if (department === "외과") return /appendic|hernia|wound|surgery|cholecystitis|obstruction/.test(text);
  if (department === "호흡기내과") return /pneumonia|copd|asthma|pleural effusion|resp/.test(text);
  if (department === "소화기내과") return /cirrhosis|hepatitis|pancreatitis|colitis|gi bleed|hematemesis|melena|ascites|varix/.test(text);
  if (department === "신장내과") return /kidney|renal|ckd|esrd|dialysis|glomerulonephritis|uremia/.test(text);
  return false;
}

function retargetProfileToWard(profile, ward, slotIndex) {
  const department = wardDepartmentFromName(ward);
  const numericCode = Number.parseInt(buildSyntheticCode(profile?.id, slotIndex + 1), 10) || slotIndex + 1;
  const diagnosis = buildDepartmentDiagnosisFallback(department, profile?.diagnosis, numericCode);
  const room = buildSyntheticWardAssignment(profile?.id, slotIndex + 1, {
    department,
    diagnosisList: [diagnosis]
  }).room;

  return {
    ...profile,
    ward,
    department,
    room,
    diagnosis,
    doctor: buildSyntheticDoctorTeam(department, ward)
  };
}

function selectBalancedPatientProfiles(profiles, count) {
  const remaining = (profiles || []).filter(Boolean).slice();
  const selected = [];
  const targetSequence = buildWardTargetSequence(count);

  targetSequence.forEach((ward, slotIndex) => {
    if (!remaining.length) return;
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((profile, profileIndex) => {
      const score = scoreProfileForWard(profile, ward);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = profileIndex;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);
    if (!picked) return;
    selected.push(retargetProfileToWard(picked, ward, slotIndex));
  });

  while (selected.length < count && remaining.length) {
    const slotIndex = selected.length;
    const fallbackWard = targetSequence[slotIndex % Math.max(1, targetSequence.length)] || "호흡기내과병동";
    selected.push(retargetProfileToWard(remaining.shift(), fallbackWard, slotIndex));
  }

  return selected.slice(0, count);
}

const baseNormalizePatientDetail = normalizePatientDetail;
normalizePatientDetail = function normalizePatientDetailPatched(data) {
  const detail = baseNormalizePatientDetail(data);
  const numericCode = Number.parseInt(buildSyntheticCode(detail.id, 1), 10) || 1;
  detail.diagnosis = buildDepartmentDiagnosisFallback(detail.department, detail.diagnosis, numericCode);
  detail.doctor = buildSyntheticDoctorTeam(detail.department, detail.ward);
  return detail;
};

module.exports = {
  handler: exports.handler,
  fetchPatientList,
  fetchPatientListPage,
  normalizePatientCount,
  normalizePatientSummary,
  normalizePatientDetail,
  buildSyntheticWardAssignment,
  buildSyntheticDoctorTeam,
  inferClinicalDepartment
};
