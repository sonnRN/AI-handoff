const FHIR_BASE_URL = "https://r4.smarthealthit.org";
const DEFAULT_PATIENT_COUNT = 8;
const TIMELINE_DAYS = 10;

const VITAL_CODES = {
  systolic: ["8480-6"],
  diastolic: ["8462-4"],
  heartRate: ["8867-4"],
  bodyTemp: ["8310-5"],
  spo2: ["59408-5", "2708-6"],
  bodyWeight: ["29463-7"],
  bodyHeight: ["8302-2"]
};

exports.handler = async function handler(event) {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (id) {
      const detail = await fetchPatientDetail(id);
      return jsonResponse(200, detail);
    }

    const list = await fetchPatientList();
    return jsonResponse(200, { patients: list, source: "smart-health-it-sandbox" });
  } catch (error) {
    return jsonResponse(500, {
      error: "Failed to fetch external patients",
      detail: error.message
    });
  }
};

async function fetchPatientList() {
  const bundle = await fetchFHIR(`/Patient?_count=${DEFAULT_PATIENT_COUNT}&_elements=id,name,gender,birthDate`);
  const entries = bundle.entry || [];

  return entries
    .map((entry, index) => normalizePatientSummary(entry.resource, index))
    .filter(Boolean);
}

async function fetchPatientDetail(id) {
  const [
    patient,
    encounters,
    conditions,
    observations,
    medications,
    allergies,
    procedures,
    reports
  ] = await Promise.all([
    fetchFHIR(`/Patient/${encodeURIComponent(id)}`),
    fetchFHIR(`/Encounter?patient=${encodeURIComponent(id)}&_count=10&_sort=-date`),
    fetchFHIR(`/Condition?patient=${encodeURIComponent(id)}&_count=20`),
    fetchFHIR(`/Observation?subject=${encodeURIComponent(id)}&_count=50&_sort=-date`),
    fetchFHIR(`/MedicationRequest?patient=${encodeURIComponent(id)}&_count=20`),
    fetchFHIR(`/AllergyIntolerance?patient=${encodeURIComponent(id)}&_count=10`),
    fetchFHIR(`/Procedure?patient=${encodeURIComponent(id)}&_count=10`),
    fetchFHIR(`/DiagnosticReport?patient=${encodeURIComponent(id)}&_count=10`)
  ]);

  return normalizePatientDetail({
    patient,
    encounters: extractResources(encounters),
    conditions: extractResources(conditions),
    observations: extractResources(observations),
    medications: extractResources(medications),
    allergies: extractResources(allergies),
    procedures: extractResources(procedures),
    reports: extractResources(reports)
  });
}

async function fetchFHIR(path) {
  const response = await fetch(`${FHIR_BASE_URL}${path}`, {
    headers: { accept: "application/fhir+json" }
  });

  if (!response.ok) {
    throw new Error(`FHIR request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function extractResources(bundle) {
  return (bundle.entry || []).map((entry) => entry.resource).filter(Boolean);
}

function normalizePatientSummary(resource, index) {
  if (!resource || !resource.id) return null;

  const name = formatHumanName(resource.name && resource.name[0]) || `Patient ${index + 1}`;
  const gender = (resource.gender || "-").toUpperCase().slice(0, 1) || "-";
  const age = resource.birthDate ? String(calculateAge(resource.birthDate)) : "-";

  return {
    id: resource.id,
    room: `FHIR-${String(index + 1).padStart(2, "0")}`,
    name,
    gender,
    age,
    registrationNo: resource.id,
    diagnosis: "External FHIR patient",
    admitDate: resource.birthDate || "-",
    bloodType: "-",
    bodyInfo: "-",
    doctor: "-",
    isolation: "-",
    external: true
  };
}

function normalizePatientDetail(data) {
  const patient = data.patient;
  const latestEncounter = data.encounters[0];
  const currentConditions = data.conditions.slice(0, 6);
  const observationMap = buildObservationMap(data.observations);
  const vitals = buildVitals(observationMap);
  const bodyInfo = buildBodyInfo(observationMap);
  const admitDate = latestEncounter && latestEncounter.period && latestEncounter.period.start
    ? latestEncounter.period.start.slice(0, 10)
    : (patient.birthDate || todayIso());

  const diagnosisList = currentConditions.map(conditionLabel).filter(Boolean);
  const medicationList = data.medications.map(medicationLabel).filter(Boolean);
  const allergyList = data.allergies.map(allergyLabel).filter(Boolean);
  const procedureList = data.procedures.map(procedureLabel).filter(Boolean);
  const reportList = data.reports.map(reportLabel).filter(Boolean);

  const patientSummary = {
    id: patient.id,
    room: latestEncounter && latestEncounter.id ? latestEncounter.id.slice(0, 8) : "FHIR",
    name: formatHumanName(patient.name && patient.name[0]) || "Unknown",
    registrationNo: patient.id,
    age: patient.birthDate ? String(calculateAge(patient.birthDate)) : "-",
    gender: (patient.gender || "-").toUpperCase().slice(0, 1) || "-",
    doctor: encounterParticipant(latestEncounter),
    diagnosis: diagnosisList[0] || "No active diagnosis",
    admitDate,
    bloodType: "-",
    bodyInfo,
    isolation: "-",
    admitReason: latestEncounter && latestEncounter.reasonCode && latestEncounter.reasonCode.length
      ? codeableText(latestEncounter.reasonCode[0])
      : (diagnosisList[0] || "External FHIR patient"),
    admissionRoute: latestEncounter && latestEncounter.class && latestEncounter.class.code
      ? latestEncounter.class.code
      : "FHIR",
    initialComplaint: diagnosisList[0] || "External FHIR patient",
    admissionNote: buildAdmissionNote(latestEncounter, diagnosisList, allergyList, procedureList),
    pastHistory: diagnosisList.slice(1, 6),
    caution: allergyList[0] || "External data",
    dailyData: buildDailyData({
      admitDate,
      vitals,
      diagnosisList,
      medications: medicationList,
      allergyList,
      procedureList,
      reportList,
      observations: observationMap
    }),
    external: true
  };

  return patientSummary;
}

function buildDailyData(input) {
  const dates = buildDateRange(input.admitDate);
  const labs = buildLabs(input.observations);
  const inj = input.medications
    .filter((name) => /inj|inject|iv|infus|syringe/i.test(name))
    .map((text) => ({ text, detail: "External FHIR order" }));
  const po = input.medications
    .filter((name) => !/inj|inject|iv|infus|syringe/i.test(name))
    .map((text) => ({ text, detail: "External FHIR order" }));
  const combinedMeds = [...inj, ...po];

  return dates.reduce((acc, date, index) => {
    const dailyVitals = varyVitals(input.vitals, index);
    acc[date] = {
      pastHistory: input.diagnosisList.slice(1, 6),
      nursingProblem: input.diagnosisList.slice(0, 3).join(", ") || "Ongoing clinical monitoring",
      handover: {
        lines: [],
        tubes: [],
        drains: [],
        drugs: combinedMeds.slice(0, 3),
        vent: [],
        neuro: [],
        etc: input.allergyList.slice(0, 2).map((text) => ({ text, detail: "Allergy / caution" }))
      },
      hourly: buildHourlyTimeline(dailyVitals, input.diagnosisList, input.reportList, index),
      io: { input: 1200, totalOutput: 900 },
      activity: "Ambulatory / self-care as tolerated",
      orders: { inj, po },
      labs,
      specials: input.reportList.slice(0, 3),
      docOrders: {
        routine: input.medications.slice(0, 6),
        prn: input.allergyList.length ? [`Caution: ${input.allergyList[0]}`] : []
      },
      todoList: buildTodoList(input),
      nursingTasks: buildNursingTasks(input),
      plan: [
        "Review active diagnoses and medication reconciliation",
        "Trend recent observations and reports"
      ],
      consults: input.reportList[0] || "-",
      tMax: Number(dailyVitals.bt),
      vital: dailyVitals
    };
    return acc;
  }, {});
}

function buildHourlyTimeline(vitals, diagnosisList, reportList, index) {
  const notes = [
    diagnosisList[0] ? `Primary problem: ${diagnosisList[0]}` : "External FHIR patient monitoring",
    reportList[0] ? `Recent report: ${reportList[0]}` : "No recent diagnostic report"
  ];

  return Array.from({ length: 24 }, (_, hour) => {
    const time = `${String(hour).padStart(2, "0")}:00`;
    const event = hour === 9 && index === 0 && diagnosisList[0] ? diagnosisList[0] : "";
    const hourNotes = [];
    if (hour === 8) hourNotes.push(notes[0]);
    if (hour === 14) hourNotes.push(notes[1]);
    if (hour === 9 && event) hourNotes.push(`[EVENT] ${event}`);
    if (hour === 10 && event) hourNotes.push("[Action] Review external FHIR record and reassess");
    if (!hourNotes.length && hour % 6 === 0) hourNotes.push("Monitoring continued");

    return {
      time,
      vital: vitals,
      event,
      notes: hourNotes
    };
  });
}

function buildTodoList(input) {
  return [
    { text: "Verify active medication list", detail: "Imported from FHIR MedicationRequest", isToday: true },
    { text: "Review current diagnoses", detail: input.diagnosisList[0] || "No diagnosis found", isToday: true },
    { text: "Review latest reports", detail: input.reportList[0] || "No report found", isToday: false }
  ];
}

function buildNursingTasks(input) {
  return [
    {
      text: "Check external demographics",
      detail: `Source patient ID: ${input.observations.patientId || "FHIR"}`
    },
    {
      text: "Review medication reconciliation",
      detail: input.medications.slice(0, 3).join(", ") || "No medication request"
    }
  ];
}

function buildAdmissionNote(encounter, diagnoses, allergies, procedures) {
  const parts = [];

  if (encounter && encounter.type && encounter.type.length) {
    parts.push(`Encounter type: ${codeableText(encounter.type[0])}`);
  }
  if (encounter && encounter.period && encounter.period.start) {
    parts.push(`Started: ${encounter.period.start.slice(0, 10)}`);
  }
  if (diagnoses.length) {
    parts.push(`Problems: ${diagnoses.slice(0, 3).join(", ")}`);
  }
  if (allergies.length) {
    parts.push(`Allergies: ${allergies.slice(0, 2).join(", ")}`);
  }
  if (procedures.length) {
    parts.push(`Procedures: ${procedures.slice(0, 2).join(", ")}`);
  }

  return parts.join(" | ") || "Imported from external FHIR sandbox";
}

function buildObservationMap(observations) {
  const map = { patientId: observations[0] && observations[0].subject && observations[0].subject.reference };
  observations.forEach((obs) => {
    const codes = codingCodes(obs.code);
    const value = observationValue(obs);
    if (!value) return;

    if (matchesAnyCode(codes, VITAL_CODES.systolic) || matchesAnyCode(codes, VITAL_CODES.diastolic)) {
      if (Array.isArray(obs.component)) {
        obs.component.forEach((component) => {
          const componentCodes = codingCodes(component.code);
          const componentValue = quantityValue(component.valueQuantity);
          if (matchesAnyCode(componentCodes, VITAL_CODES.systolic) && componentValue) map.systolic = componentValue;
          if (matchesAnyCode(componentCodes, VITAL_CODES.diastolic) && componentValue) map.diastolic = componentValue;
        });
      }
    }

    if (matchesAnyCode(codes, VITAL_CODES.heartRate)) map.heartRate = value;
    if (matchesAnyCode(codes, VITAL_CODES.bodyTemp)) map.bodyTemp = value;
    if (matchesAnyCode(codes, VITAL_CODES.spo2)) map.spo2 = value;
    if (matchesAnyCode(codes, VITAL_CODES.bodyWeight)) map.bodyWeight = value;
    if (matchesAnyCode(codes, VITAL_CODES.bodyHeight)) map.bodyHeight = value;

    const label = observationLabel(obs);
    if (label && typeof value === "string" && !map[label]) {
      map[label] = value;
    }
  });

  return map;
}

function buildVitals(map) {
  const systolic = toNumber(map.systolic, 120);
  const diastolic = toNumber(map.diastolic, 80);
  const hr = toNumber(map.heartRate, 78);
  const bt = toNumber(map.bodyTemp, 36.8).toFixed(1);
  const spo2 = toNumber(map.spo2, 98);

  return {
    bp: `${Math.round(systolic)}/${Math.round(diastolic)}`,
    hr: Math.round(hr),
    bt,
    spo2: Math.round(spo2)
  };
}

function buildBodyInfo(map) {
  const height = map.bodyHeight ? `${Math.round(toNumber(map.bodyHeight, 0))}cm` : "-";
  const weight = map.bodyWeight ? `${Math.round(toNumber(map.bodyWeight, 0))}kg` : "-";
  if (height === "-" && weight === "-") return "-";
  return `${height}/${weight}`;
}

function buildLabs(observationMap) {
  const chemistry = {};
  const miscKeys = ["Glucose", "Body weight", "Body height", "Body temperature", "Heart rate"];

  miscKeys.forEach((key) => {
    if (observationMap[key]) chemistry[key] = observationMap[key];
  });

  chemistry.SpO2 = observationMap.spo2 || "-";

  return { Chemistry: chemistry };
}

function varyVitals(vitals, index) {
  const delta = index - (TIMELINE_DAYS - 1);
  const [sys, dia] = vitals.bp.split("/").map((value) => toNumber(value, 0));

  return {
    bp: `${Math.max(80, Math.round(sys + delta))}/${Math.max(50, Math.round(dia + Math.floor(delta / 2)))}`,
    hr: Math.max(50, vitals.hr + delta),
    bt: Math.max(35.5, Number(vitals.bt) + delta * 0.02).toFixed(1),
    spo2: Math.min(100, Math.max(88, vitals.spo2 + Math.floor(delta / 2)))
  };
}

function buildDateRange(admitDate) {
  const endDate = new Date(todayIso());
  const start = isValidDate(admitDate) ? new Date(admitDate) : new Date(endDate);
  const dates = [];

  for (let i = TIMELINE_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  if (start > endDate) {
    return dates;
  }

  return dates;
}

function conditionLabel(condition) {
  return codeableText(condition.code) || referenceText(condition.subject) || "Condition";
}

function medicationLabel(medication) {
  return (
    codeableText(medication.medicationCodeableConcept) ||
    referenceText(medication.medicationReference) ||
    "MedicationRequest"
  );
}

function allergyLabel(allergy) {
  return codeableText(allergy.code) || "Allergy";
}

function procedureLabel(procedure) {
  return codeableText(procedure.code) || "Procedure";
}

function reportLabel(report) {
  return codeableText(report.code) || "DiagnosticReport";
}

function encounterParticipant(encounter) {
  const participant = encounter && encounter.participant && encounter.participant[0];
  if (!participant || !participant.individual) return "-";
  return participant.individual.display || participant.individual.reference || "-";
}

function formatHumanName(name) {
  if (!name) return "";
  if (name.text) return name.text;
  const given = Array.isArray(name.given) ? name.given.join(" ") : "";
  const family = name.family || "";
  return `${given} ${family}`.trim();
}

function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const today = new Date(todayIso());
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function observationValue(observation) {
  if (observation.valueQuantity) return quantityValue(observation.valueQuantity);
  if (observation.valueString) return observation.valueString;
  if (observation.valueCodeableConcept) return codeableText(observation.valueCodeableConcept);
  return "";
}

function quantityValue(quantity) {
  if (!quantity || typeof quantity.value === "undefined" || quantity.value === null) return "";
  const unit = quantity.unit ? ` ${quantity.unit}` : "";
  return `${quantity.value}${unit}`.trim();
}

function observationLabel(observation) {
  return codeableText(observation.code);
}

function codingCodes(codeable) {
  return ((codeable && codeable.coding) || []).map((coding) => coding.code).filter(Boolean);
}

function matchesAnyCode(actualCodes, expectedCodes) {
  return actualCodes.some((code) => expectedCodes.includes(code));
}

function codeableText(codeable) {
  if (!codeable) return "";
  if (codeable.text) return codeable.text;
  const coding = codeable.coding && codeable.coding[0];
  if (!coding) return "";
  return coding.display || coding.code || "";
}

function referenceText(reference) {
  if (!reference) return "";
  return reference.display || reference.reference || "";
}

function toNumber(value, fallback) {
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
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
