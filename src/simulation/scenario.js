(function initSimulationScenario(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.HANDOFF_SIM_DATA = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildScenarioModule() {
  const SCENARIO_ID = "adult-telemetry-heart-failure";
  const basePatient = {
    id: "SIM-TELE-001",
    name: "Synthetic Patient Rowan",
    age: 72,
    gender: "F",
    room: "4W-Tele-412B",
    mrn: "SIM-240318",
    admittingService: "Hospital Medicine / Telemetry",
    admissionReason: "Acute decompensated heart failure with right lower lobe pneumonia and new atrial fibrillation with rapid ventricular response",
    admissionDate: "2026-03-14",
    hospitalDay: 5,
    codeStatus: "Full Code",
    allergies: ["Penicillin (rash)", "Morphine (nausea)"],
    problemList: [
      "Acute decompensated HFpEF",
      "Right lower lobe pneumonia",
      "Atrial fibrillation with controlled ventricular response",
      "Acute kidney injury during diuresis",
      "Hypokalemia / hypomagnesemia after diuresis",
      "Type 2 diabetes with steroid-related hyperglycemia",
      "High fall risk with orthostatic symptoms",
      "Sacral erythema from limited mobility"
    ],
    baselineHistory: [
      "HFpEF with prior admissions for volume overload",
      "Hypertension",
      "Type 2 diabetes mellitus",
      "Chronic kidney disease stage 3a",
      "Obesity",
      "Former smoker"
    ],
    learningGoals: [
      "Synthesize several days of change rather than reading the chart verbatim.",
      "Prioritize oxygenation, hemodynamics, renal function, and safety risks for the next shift.",
      "Communicate medication changes and unresolved follow-up tasks clearly."
    ]
  };
  const shiftHistory = [
    ["HD1 Night", "Admitted from the ED on high-flow nasal cannula for pulmonary edema and right lower lobe pneumonia. Started ceftriaxone, azithromycin, IV furosemide, and a diltiazem infusion for atrial fibrillation with rates in the 130s."],
    ["HD2 Day", "Respiratory status improved to 6 L nasal cannula. Net negative 1.8 L after IV diuresis. Diltiazem infusion was stopped and metoprolol started. WBC and BNP trended down, but creatinine began to rise."],
    ["HD3 Night", "Transferred from stepdown to telemetry on 4 L nasal cannula. Apixaban was started once rate control stabilized. Blood pressure softened overnight and potassium dropped to 3.2 after repeat diuresis."],
    ["HD4 Day", "Converted from IV to oral furosemide because of rising creatinine and borderline blood pressure. Losartan was held. Sacral erythema noted, and the patient needed one-assist ambulation for fatigue and dizziness."],
    ["Current Night Shift", "Still on 2 L nasal cannula with desaturation to 89% during ambulation. Low-grade temperature to 37.8 C, WBC rose to 13.1, creatinine worsened to 1.7, and potassium remained low despite repletion. Near-fall during bathroom transfer."]
  ].map(function toHistory(entry, index) {
    return {
      id: "shift-" + (index + 1),
      label: entry[0],
      summary: entry[1]
    };
  });

  function hourly(vital, notes) {
    const data = Array.from({ length: 24 }, function buildSlot(_, hour) {
      return {
        time: String(hour).padStart(2, "0") + ":00",
        vital: { bp: vital.bp, hr: vital.hr, rr: vital.rr, bt: vital.bt, spo2: vital.spo2 },
        notes: [],
        event: ""
      };
    });
    (notes || []).forEach(function applyNote(item) {
      const hourNumber = Number.parseInt(String(item.time || "00").slice(0, 2), 10);
      if (!Number.isFinite(hourNumber) || !data[hourNumber]) return;
      data[hourNumber].notes.push(item.note);
      if (item.event) data[hourNumber].event = item.event;
    });
    data.forEach(function ensureFiller(slot, index) {
      if (!slot.notes.length && index % 6 === 0) {
        slot.notes.push("Routine assessment completed; no new distress reported at that hour.");
      }
    });
    return data;
  }

  function flattenLabs(labs) {
    const output = {};
    Object.keys(labs || {}).forEach(function eachSection(sectionKey) {
      Object.assign(output, labs[sectionKey] || {});
    });
    return output;
  }

  function metaFor(day) {
    const activeOrders = [].concat(day.docOrders.routine || [], day.docOrders.prn || []);
    return {
      clinicalStatus: {
        diagnoses: [basePatient.admissionReason].concat(basePatient.problemList.slice(0, 3)),
        isolation: "Standard precautions",
        activity: day.activity,
        caution: day.safetyRisks.slice(0, 4),
        lines: (day.handover.lines || []).map(function pickText(item) { return item.text; }),
        tubes: (day.handover.tubes || []).map(function pickText(item) { return item.text; }),
        drains: (day.handover.drains || []).map(function pickText(item) { return item.text; }),
        vent: (day.handover.vent || []).map(function pickText(item) { return item.text; })
      },
      orders: {
        active: activeOrders,
        routine: day.docOrders.routine || [],
        prn: day.docOrders.prn || [],
        medications: {
          inj: (day.orders.inj || []).slice(),
          po: (day.orders.po || []).slice(),
          running: (day.handover.drugs || []).map(function pickText(item) { return item.text; })
        }
      },
      vitals: { latest: day.vital, abnormalFlags: day.abnormalFlags || [] },
      labs: { latest: flattenLabs(day.labs), abnormal: day.abnormalLabs || [] },
      nursingActions: {
        completed: day.completedTasks || [],
        pending: day.pendingTasks || [],
        followUp: day.pendingTasks || [],
        background: day.shiftSummary ? [day.shiftSummary] : []
      },
      sourceRefs: {
        nursingNotes: (day.nursingNotes || []).length,
        pendingTasks: (day.pendingTasks || []).length,
        medicationChanges: (day.medicationChanges || []).length,
        activeOrders: activeOrders.length
      }
    };
  }

  function day(config) {
    const result = Object.assign({}, config, {
      todoList: (config.pendingTasks || []).slice(),
      pastHistory: basePatient.baselineHistory.slice()
    });
    result.hourly = hourly(config.vital, config.hourlyEvents);
    result.handoffMeta = metaFor(result);
    return result;
  }

  const dailyData = {
    "2026-03-14": day({
      date: "2026-03-14",
      hospitalDay: 1,
      shiftSummary: shiftHistory[0].summary,
      weightKg: 89.4,
      nursingProblem: "Acute volume overload with hypoxemia and uncontrolled atrial fibrillation",
      io: { input: "2300 mL", totalOutput: "1400 mL", net: "+900 mL" },
      activity: "Bedrest except bedside commode",
      vital: { bp: "156/92", hr: 132, rr: 28, bt: "38.4", spo2: 86 },
      abnormalFlags: ["bp", "hr", "rr", "bt", "spo2"],
      abnormalLabs: [{ key: "WBC", value: "17.6", status: "high" }, { key: "BNP", value: "1480", status: "high" }],
      orders: { inj: ["Ceftriaxone 1 g IV q24h", "Azithromycin 500 mg IV daily", "Furosemide 40 mg IV BID", "Diltiazem infusion titration"], po: ["Sliding-scale insulin AC/HS", "Acetaminophen 650 mg q6h PRN fever"] },
      medSchedule: ["06:00 Furosemide 40 mg IV", "09:00 Ceftriaxone 1 g IV", "10:00 Azithromycin 500 mg IV", "AC/HS Sliding-scale insulin"],
      medicationChanges: ["New IV antibiotics started for pneumonia coverage.", "Diltiazem infusion started for atrial fibrillation with RVR.", "Aggressive IV diuresis initiated for pulmonary edema."],
      labs: { CBC: { WBC: "17.6", Hgb: "11.2", Plt: "285" }, BMP: { Na: "132", K: "4.1", BUN: "28", Cr: "1.0", Mg: "1.9", Glucose: "246" }, Other: { BNP: "1480", Lactate: "2.6", Procalcitonin: "1.8" } },
      docOrders: { routine: ["Strict I/O and daily standing weights", "Telemetry monitoring", "Maintain SpO2 >= 92%", "Low sodium diet with 1.5 L fluid restriction"], prn: ["Notify provider for HR > 120, SBP < 100, or SpO2 < 90%", "Repeat BMP if urine output falls below 30 mL/hr for 2 hours"] },
      nursingTasks: [{ text: "Wean high-flow oxygen only if saturation stays above target", detail: "Currently not ready" }, { text: "Reinforce bedside commode only", detail: "Short of breath with exertion" }],
      pendingTasks: ["Repeat BMP and magnesium at 16:00 after second IV diuretic dose", "Follow blood cultures and sputum culture", "Reassess rhythm control after diltiazem titration"],
      completedTasks: ["ED admission assessment completed", "Initial antibiotic doses administered", "Heart failure education deferred because patient too dyspneic"],
      safetyRisks: ["High fall risk from hypoxemia and tachycardia", "Skin risk from edema and immobility"],
      nursingNotes: ["Arrived from ED dyspneic, speaking in short phrases, coarse crackles at bases.", "Needed two-person assist to transfer to commode because of fatigue.", "Productive cough with thick yellow sputum; sputum specimen sent."],
      providerUpdate: "Initial plan is IV diuresis plus community-acquired pneumonia treatment, then reassess rhythm control once volume status improves.",
      overnightEvents: ["Required high-flow nasal cannula at 35 L / 45% overnight", "Atrial fibrillation remained 120 to 140 bpm before diltiazem reached goal rate"],
      specials: ["Portable chest x-ray: diffuse pulmonary vascular congestion with right lower lobe infiltrate", "Echo ordered but not yet completed"],
      plan: ["Continue IV diuresis overnight", "Trend renal function daily", "Advance mobility only with staff assist"],
      consults: ["Heart failure education", "Respiratory therapy"],
      handover: { lines: [{ text: "Peripheral IV x2", detail: "18G left forearm, 20G right forearm" }], tubes: [], drains: [], drugs: [{ text: "Diltiazem infusion", detail: "10 mg/hr" }], vent: [{ text: "High-flow nasal cannula", detail: "35 L / 45%" }], neuro: [{ text: "Alert and oriented", detail: "Anxious but follows commands" }] },
      hourlyEvents: [{ time: "01:00", note: "Still tachypneic with crackles and frequent productive cough.", event: "Persistent respiratory distress" }, { time: "04:00", note: "Heart rate sustained in 130s until diltiazem titration reached goal.", event: "Atrial fibrillation with RVR" }, { time: "06:00", note: "Urine output improved after second IV Lasix dose.", event: "Diuresis response" }]
    }),
    "2026-03-15": day({
      date: "2026-03-15",
      hospitalDay: 2,
      shiftSummary: shiftHistory[1].summary,
      weightKg: 87.3,
      nursingProblem: "Improving oxygenation with ongoing diuresis and early renal strain",
      io: { input: "1750 mL", totalOutput: "3550 mL", net: "-1800 mL" },
      activity: "One-assist to chair, short walks only with telemetry and oxygen",
      vital: { bp: "142/86", hr: 118, rr: 24, bt: "37.7", spo2: 93 },
      abnormalFlags: ["hr", "rr", "spo2"],
      abnormalLabs: [{ key: "WBC", value: "14.2", status: "high" }, { key: "BNP", value: "1200", status: "high" }, { key: "Cr", value: "1.2", status: "high" }],
      orders: { inj: ["Ceftriaxone 1 g IV q24h", "Azithromycin 500 mg IV daily", "Furosemide 40 mg IV BID"], po: ["Metoprolol tartrate 25 mg PO q6h", "Sliding-scale insulin AC/HS"] },
      medSchedule: ["06:00 Furosemide 40 mg IV", "09:00 Ceftriaxone 1 g IV", "10:00 Azithromycin 500 mg IV", "12:00 Metoprolol 25 mg PO"],
      medicationChanges: ["Diltiazem infusion discontinued this morning.", "Metoprolol tartrate started for rate control.", "Continued IV furosemide after good net negative balance."],
      labs: { CBC: { WBC: "14.2", Hgb: "10.7", Plt: "276" }, BMP: { Na: "133", K: "3.6", BUN: "31", Cr: "1.2", Mg: "1.8", Glucose: "228" }, Other: { BNP: "1200", Lactate: "1.4", Procalcitonin: "1.2" } },
      docOrders: { routine: ["Continue telemetry monitoring", "Strict I/O and daily standing weight", "Wean oxygen as tolerated to keep SpO2 >= 92%", "Encourage chair for meals with staff assist"], prn: ["Notify provider for symptomatic hypotension or HR > 120", "Replete potassium if below 3.5"] },
      nursingTasks: [{ text: "Monitor for dizziness during first ambulation", detail: "Still deconditioned" }, { text: "Reinforce low sodium diet and fluid limit", detail: "Patient asks for extra water frequently" }],
      pendingTasks: ["Repeat BMP after evening diuresis", "Echo still pending", "Assess whether azithromycin can stop after day 3"],
      completedTasks: ["Transitioned from high-flow to 6 L nasal cannula", "Transferred from stepdown to telemetry"],
      safetyRisks: ["Fall risk with new ambulation", "Hyperglycemia related to illness and steroids"],
      nursingNotes: ["Tolerated chair for breakfast but became winded walking back to bed.", "Crackles improved after diuresis; cough remains productive.", "Patient more engaged and able to answer questions appropriately."],
      providerUpdate: "Continue pneumonia treatment, keep negative fluid balance, and monitor renal function closely while converting rate control from infusion to oral therapy.",
      overnightEvents: ["Oxygen weaned from high-flow to 6 L nasal cannula", "No chest pain; rhythm remained atrial fibrillation 100 to 120s"],
      specials: ["BNP improving but still elevated", "Creatinine up from baseline to 1.2"],
      plan: ["Consider starting anticoagulation once hemoglobin remains stable", "Keep aggressive pulmonary hygiene"],
      consults: ["Respiratory therapy", "Heart failure education"],
      handover: { lines: [{ text: "Peripheral IV", detail: "20G right forearm" }], tubes: [], drains: [], drugs: [{ text: "Telemetry", detail: "Atrial fibrillation 100 to 118 bpm" }], vent: [{ text: "Nasal cannula", detail: "6 L/min" }], neuro: [{ text: "Alert and oriented", detail: "Less anxious today" }] },
      hourlyEvents: [{ time: "03:00", note: "Net negative balance reached almost 2 liters for the day.", event: "Diuresis milestone" }, { time: "09:00", note: "Diltiazem infusion stopped and first metoprolol dose tolerated.", event: "Rate-control transition" }, { time: "16:00", note: "Creatinine rose slightly; team plans closer renal monitoring.", event: "Renal trend concern" }]
    }),
    "2026-03-16": day({
      date: "2026-03-16",
      hospitalDay: 3,
      shiftSummary: shiftHistory[2].summary,
      weightKg: 85.8,
      nursingProblem: "Respiratory improvement with new anticoagulation and electrolyte losses from diuresis",
      io: { input: "1600 mL", totalOutput: "3100 mL", net: "-1500 mL" },
      activity: "One-assist ambulation 20 feet with walker and oxygen",
      vital: { bp: "126/74", hr: 104, rr: 22, bt: "37.2", spo2: 95 },
      abnormalFlags: ["hr"],
      abnormalLabs: [{ key: "K", value: "3.2", status: "low" }, { key: "Cr", value: "1.4", status: "high" }, { key: "Glucose", value: "212", status: "high" }],
      orders: { inj: ["Ceftriaxone 1 g IV q24h", "Furosemide 40 mg IV BID", "Potassium chloride 40 mEq replacement"], po: ["Metoprolol tartrate 37.5 mg PO BID", "Apixaban 5 mg PO BID", "Sliding-scale insulin AC/HS"] },
      medSchedule: ["06:00 Furosemide 40 mg IV", "08:00 Apixaban 5 mg PO", "09:00 Ceftriaxone 1 g IV", "12:00 Potassium chloride 40 mEq PO"],
      medicationChanges: ["Apixaban started for new atrial fibrillation after hemoglobin stayed stable.", "Metoprolol increased to 37.5 mg BID for better rate control.", "Potassium replacement ordered for K 3.2."],
      labs: { CBC: { WBC: "11.8", Hgb: "10.4", Plt: "270" }, BMP: { Na: "134", K: "3.2", BUN: "36", Cr: "1.4", Mg: "1.7", Glucose: "212" }, Other: { BNP: "910", Procalcitonin: "0.8" } },
      docOrders: { routine: ["Continue telemetry and daily weights", "Replete potassium and magnesium as needed", "Ambulate only with staff assist", "Aspiration precautions with meals due dyspnea and fatigue"], prn: ["Notify provider for bleeding, gross hematuria, or melena on apixaban", "Repeat EKG if HR sustains above 120"] },
      nursingTasks: [{ text: "Monitor for bleeding after apixaban start", detail: "Education completed" }, { text: "Use walker and gait belt for ambulation", detail: "Still weak and slightly dizzy" }],
      pendingTasks: ["Repeat potassium after replacement tonight", "Finish final IV azithromycin dose if still ordered", "Echo still not resulted"],
      completedTasks: ["Started anticoagulation teaching", "Electrolyte replacement given"],
      safetyRisks: ["Fall risk with weakness and oxygen tubing", "Bleeding risk after apixaban initiation"],
      nursingNotes: ["Walked to doorway with walker but needed seated rest for dyspnea.", "No overt bleeding after first apixaban doses.", "Mild dizziness when standing quickly; orthostatic precautions reinforced."],
      providerUpdate: "Rate is better controlled and oxygen is improving, but renal function and potassium need close follow-up while deciding when to switch off IV diuresis.",
      overnightEvents: ["Potassium dropped to 3.2 after repeated IV Lasix", "Atrial fibrillation mostly 90s to low 100s overnight"],
      specials: ["Azithromycin course completed after today", "Creatinine continued rising to 1.4"],
      plan: ["Evaluate conversion from IV to PO furosemide tomorrow", "Continue oxygen wean if ambulation tolerance improves"],
      consults: ["Physical therapy", "Heart failure education"],
      handover: { lines: [{ text: "Peripheral IV", detail: "20G right forearm, saline locked between meds" }], tubes: [], drains: [], drugs: [{ text: "Telemetry", detail: "Atrial fibrillation 88 to 104 bpm" }], vent: [{ text: "Nasal cannula", detail: "4 L/min" }], neuro: [{ text: "Alert and oriented", detail: "Fatigued but appropriate" }] },
      hourlyEvents: [{ time: "02:00", note: "Potassium result returned at 3.2 and replacement protocol was activated.", event: "Electrolyte replacement" }, { time: "11:00", note: "First apixaban dose given without bleeding complications.", event: "Anticoagulation start" }, { time: "18:00", note: "Dyspnea improved at rest but persisted with ambulation.", event: "Mobility-limited oxygen demand" }]
    }),
    "2026-03-17": day({
      date: "2026-03-17",
      hospitalDay: 4,
      shiftSummary: shiftHistory[3].summary,
      weightKg: 84.9,
      nursingProblem: "Borderline blood pressure and worsening AKI while transitioning to oral diuresis",
      io: { input: "1500 mL", totalOutput: "2400 mL", net: "-900 mL" },
      activity: "One-assist to bathroom and chair; avoid independent ambulation",
      vital: { bp: "108/66", hr: 96, rr: 20, bt: "37.0", spo2: 94 },
      abnormalFlags: ["bp", "spo2"],
      abnormalLabs: [{ key: "Cr", value: "1.6", status: "high" }, { key: "K", value: "3.0", status: "low" }, { key: "Mg", value: "1.6", status: "low" }],
      orders: { inj: ["Ceftriaxone 1 g IV q24h", "Magnesium sulfate 2 g IV once"], po: ["Metoprolol tartrate 50 mg PO BID", "Apixaban 5 mg PO BID", "Furosemide 40 mg PO daily", "Potassium chloride 40 mEq PO BID"] },
      medSchedule: ["08:00 Metoprolol 50 mg PO", "08:00 Apixaban 5 mg PO", "09:00 Ceftriaxone 1 g IV", "10:00 Magnesium sulfate 2 g IV", "14:00 Potassium chloride 40 mEq PO"],
      medicationChanges: ["IV furosemide converted to PO furosemide 40 mg daily.", "Losartan held because of creatinine rise and soft blood pressure.", "Metoprolol increased to 50 mg BID.", "Additional magnesium replacement ordered."],
      labs: { CBC: { WBC: "10.9", Hgb: "10.1", Plt: "263" }, BMP: { Na: "134", K: "3.0", BUN: "42", Cr: "1.6", Mg: "1.6", Glucose: "198" }, Other: { BNP: "760", Procalcitonin: "0.5" } },
      docOrders: { routine: ["Hold losartan until renal function stabilizes", "Strict I/O and daily weights continue", "Keep oxygen at 2 to 4 L for SpO2 >= 92%", "Wound care consult for sacral erythema"], prn: ["Notify provider for SBP < 100 or symptomatic dizziness", "Repeat BMP and magnesium after replacement"] },
      nursingTasks: [{ text: "Turn every two hours and offload sacrum", detail: "Blanchable erythema noted" }, { text: "One-assist only with bathroom transfers", detail: "Orthostatic dizziness" }],
      pendingTasks: ["Follow wound care recommendation", "Check repeat BMP and magnesium overnight", "Continue discharge planning if renal function stabilizes"],
      completedTasks: ["Converted IV Lasix to oral dosing", "Held losartan per provider"],
      safetyRisks: ["High fall risk from dizziness and soft blood pressure", "Pressure injury risk at sacrum"],
      nursingNotes: ["Needed help returning from bathroom after reporting lightheadedness.", "Sacrum pink and blanchable; foam dressing applied.", "Breath sounds improved, though still diminished at right base."],
      providerUpdate: "Overall volume status is much better, but kidney function is now the rate-limiting issue for discharge. Team reduced diuresis and held ARB today.",
      overnightEvents: ["Blood pressure briefly 98/58 after evening bathroom trip", "Repeat potassium remained low despite oral replacement"],
      specials: ["Wound care consult placed", "Echo result: preserved EF with elevated filling pressures"],
      plan: ["Reassess diuretic plan daily", "Monitor orthostasis before any discharge teaching"],
      consults: ["Wound care", "Physical therapy", "Case management"],
      handover: { lines: [{ text: "Peripheral IV", detail: "20G right forearm" }], tubes: [], drains: [], drugs: [{ text: "Telemetry", detail: "Atrial fibrillation 80s to 90s" }], vent: [{ text: "Nasal cannula", detail: "2 L/min" }], neuro: [{ text: "Alert and oriented", detail: "Tires easily, dizzy with standing" }] },
      hourlyEvents: [{ time: "04:00", note: "Blood pressure dropped to 98/58 after bathroom transfer; symptoms improved once back in bed.", event: "Orthostatic episode" }, { time: "09:00", note: "Provider changed IV Lasix to oral dosing and held losartan.", event: "Medication de-escalation" }, { time: "15:00", note: "Sacral erythema documented and wound care consult placed.", event: "Skin integrity risk" }]
    }),
    "2026-03-18": day({
      date: "2026-03-18",
      hospitalDay: 5,
      shiftSummary: shiftHistory[4].summary,
      weightKg: 84.6,
      nursingProblem: "Readying for next-step care but still unstable because of renal function, electrolytes, oxygen need, and fall risk",
      io: { input: "1420 mL", totalOutput: "1770 mL", net: "-350 mL" },
      activity: "One-assist, walker, bedside commode overnight; no independent bathroom trips",
      vital: { bp: "102/60", hr: 90, rr: 20, bt: "37.8", spo2: 93 },
      abnormalFlags: ["bp", "bt", "spo2"],
      abnormalLabs: [{ key: "Cr", value: "1.7", status: "high" }, { key: "K", value: "3.3", status: "low" }, { key: "Mg", value: "1.6", status: "low" }, { key: "WBC", value: "13.1", status: "high" }],
      orders: { inj: ["Ceftriaxone 1 g IV q24h", "Magnesium sulfate 2 g IV once overnight", "Potassium chloride 10 mEq IV x2"], po: ["Metoprolol tartrate 50 mg PO BID", "Apixaban 5 mg PO BID", "Furosemide 20 mg PO daily", "Potassium chloride 40 mEq PO BID", "Sliding-scale insulin AC/HS"] },
      medSchedule: ["05:00 Magnesium sulfate 2 g IV", "06:00 Potassium chloride 10 mEq IV", "08:00 Metoprolol 50 mg PO", "08:00 Apixaban 5 mg PO", "09:00 Ceftriaxone 1 g IV", "10:00 Furosemide 20 mg PO (extra dose held pending provider review)"],
      medicationChanges: ["Oral furosemide reduced from 40 mg to 20 mg because of worsening creatinine and soft blood pressure.", "Extra morning diuretic dose was held pending provider review after overnight hypotension.", "Azithromycin course completed; ceftriaxone continues while low-grade fever and WBC bump are reassessed.", "Overnight potassium and magnesium repletion given."],
      labs: { CBC: { WBC: "13.1", Hgb: "10.0", Plt: "258" }, BMP: { Na: "133", K: "3.3", BUN: "46", Cr: "1.7", Mg: "1.6", Glucose: "186" }, Other: { BNP: "690", Procalcitonin: "0.7", Lactate: "1.1" } },
      docOrders: { routine: ["Telemetry monitoring continues", "Maintain oxygen at 2 L and wean only if resting and ambulatory saturations stay >= 92%", "Strict I/O, daily weight, and repeat BMP/Mg at 14:00", "Wound care and PT to reassess today"], prn: ["Notify provider for SBP < 95, worsening dyspnea, or urine output < 30 mL/hr", "If temperature reaches 38.0 C or WBC rises further, obtain repeat cultures per provider"] },
      nursingTasks: [{ text: "Use gait belt and one-assist for every transfer", detail: "Near-fall overnight" }, { text: "Offload sacrum and document skin every shift", detail: "Foam dressing intact" }, { text: "Monitor urine output after reduced diuresis", detail: "Output slowed overnight" }],
      pendingTasks: ["Repeat BMP and magnesium at 14:00", "Portable chest x-ray pending to reassess infiltrate and congestion", "Sputum culture pending final sensitivities", "PT mobility reassessment before discharge planning", "Wound care recommendations for sacral erythema"],
      completedTasks: ["Overnight potassium and magnesium replacement administered", "Extra bathroom trip redirected to bedside commode after near-fall"],
      safetyRisks: ["High fall risk from dizziness, oxygen tubing, and borderline blood pressure", "Pressure injury risk with sacral erythema", "Bleeding risk on apixaban if she falls"],
      nursingNotes: ["At 03:20 patient stood to go to the bathroom, became dizzy, and had to be lowered back to bed with staff assist. No injury.", "Desaturated to 89% on 2 L during transfer; recovered to 93% after rest.", "Cough continues with thicker yellow sputum than yesterday. Temperature reached 37.8 C overnight.", "Sacral foam dressing remains intact; erythema still blanchable."],
      providerUpdate: "Discharge is on hold. Team is watching whether renal function and electrolytes recover after reducing diuresis, and whether the mild fever/WBC bump means pneumonia treatment needs to continue longer.",
      overnightEvents: ["Near-fall during bathroom transfer at 03:20", "Low-grade temperature 37.8 C with WBC increase from 10.9 to 13.1", "Urine output slower overnight after diuretic reduction"],
      specials: ["Portable chest x-ray ordered for today", "Low-grade fever prompted review of antibiotic duration", "Discharge planning deferred until renal function and mobility improve"],
      plan: ["Trend renal function and electrolytes this afternoon", "Watch for worsening oxygen requirement with ambulation", "Clarify antibiotic plan once chest x-ray and sputum culture finalize"],
      consults: ["Physical therapy", "Wound care", "Case management"],
      handover: { lines: [{ text: "Peripheral IV", detail: "20G right forearm, used for electrolyte replacement" }], tubes: [], drains: [], drugs: [{ text: "Telemetry", detail: "Atrial fibrillation 80s to low 90s" }], vent: [{ text: "Nasal cannula", detail: "2 L/min, desats with exertion" }], neuro: [{ text: "Alert and oriented", detail: "Gets dizzy with standing, no focal deficits" }] },
      hourlyEvents: [{ time: "03:00", note: "Near-fall while trying to ambulate to bathroom; redirected to bedside commode and gait belt precautions reinforced.", event: "Fall-risk event" }, { time: "05:00", note: "Potassium and magnesium repletion finished; repeat labs due this afternoon.", event: "Electrolyte replacement" }, { time: "08:00", note: "Provider reviewing whether to continue ceftriaxone longer because of WBC rise and low-grade fever.", event: "Infection reassessment" }]
    })
  };

  const coverageTargets = [
    { id: "clinical-context", label: "State the core admission context: heart failure exacerbation, pneumonia, and atrial fibrillation.", weight: 12, critical: true, minGroups: 2, groups: [["heart failure", "hf exacerbation", "volume overload", "pulmonary edema", "chf"], ["pneumonia", "right lower lobe pneumonia", "rll pneumonia", "infiltrate"], ["atrial fibrillation", "afib", "a fib", "rapid ventricular response", "rvr"]], followUpCategory: "context", betterPhrase: "She is a hospital day 5 telemetry patient admitted for decompensated heart failure with right lower lobe pneumonia and new atrial fibrillation." },
    { id: "current-support", label: "Describe the patient's current support and setting: hospital day 5, telemetry, full code, and 2 L nasal cannula.", weight: 10, critical: true, minGroups: 2, groups: [["hospital day 5", "day 5", "hd5"], ["telemetry", "tele"], ["full code"], ["2 liters", "2 l", "2l", "nasal cannula", "oxygen"]], followUpCategory: "current-status", betterPhrase: "She is full code on telemetry and currently needs 2 L nasal cannula, with desaturation when she gets up." },
    { id: "respiratory-priority", label: "Call out the current respiratory priority: desaturation with ambulation and the need to watch oxygen weaning closely.", weight: 11, critical: true, minGroups: 2, groups: [["desat", "desaturation", "drops to 89", "89%", "ambulation", "with exertion"], ["oxygen", "2 l", "nasal cannula", "wean", "monitor sats"]], followUpCategory: "respiratory", betterPhrase: "Her lungs are better than admission, but she still drops to 89% with transfers, so the next nurse needs to watch exertional desaturation and avoid aggressive weaning." },
    { id: "renal-hemodynamic-priority", label: "Prioritize the renal and hemodynamic issue: soft blood pressure, creatinine up to 1.7, and reduced diuresis.", weight: 13, critical: true, minGroups: 2, groups: [["creatinine", "cr 1.7", "aki", "kidney", "renal function"], ["soft blood pressure", "102/60", "98/58", "hypotension", "borderline blood pressure", "orthostatic"], ["lasix reduced", "diuretic reduced", "furosemide reduced", "hold extra dose"]], followUpCategory: "renal", betterPhrase: "Her main unresolved issue is AKI during diuresis: creatinine is up to 1.7, blood pressure has been soft, and the team reduced Lasix and held extra dosing." },
    { id: "electrolytes", label: "Mention the low potassium and magnesium and that they were repleted overnight with repeat labs pending.", weight: 10, critical: true, minGroups: 2, groups: [["potassium", "k 3.3", "hypokalemia"], ["magnesium", "mg 1.6", "hypomagnesemia"], ["repleted", "replacement", "given overnight", "repeat bmp", "repeat labs"]], followUpCategory: "electrolytes", betterPhrase: "She is still potassium 3.3 and magnesium 1.6 after overnight replacement, so afternoon BMP and magnesium are important follow-up labs." },
    { id: "infection-reassessment", label: "Note the low-grade fever and WBC rise with ongoing ceftriaxone, chest x-ray pending, and sputum culture still pending.", weight: 10, critical: false, minGroups: 2, groups: [["37.8", "low-grade fever", "temperature", "wbc 13.1", "white count up"], ["ceftriaxone", "antibiotic", "azithromycin"], ["chest x-ray", "cxr", "sputum culture", "culture pending"]], followUpCategory: "infection", betterPhrase: "Even though she overall looks better, the team is reassessing infection because she hit 37.8 overnight, WBC climbed back up, and today's chest x-ray plus sputum culture are pending." },
    { id: "rate-control-and-anticoagulation", label: "Explain the recent rhythm management: atrial fibrillation is rate controlled on metoprolol and she is anticoagulated with apixaban.", weight: 8, critical: false, minGroups: 2, groups: [["metoprolol", "rate controlled", "hr 80", "hr 90", "af controlled"], ["apixaban", "anticoagulation", "bleeding risk"]], followUpCategory: "cardiac", betterPhrase: "Her rhythm is now controlled in the 80s to low 90s on metoprolol, and apixaban started yesterday, so bleeding risk matters if she falls." },
    { id: "safety-risks", label: "Highlight the nursing safety risks: near-fall overnight, one-assist mobility, sacral erythema, and bleeding risk if she falls on apixaban.", weight: 12, critical: true, minGroups: 2, groups: [["near-fall", "almost fell", "fall risk", "dizzy", "one assist", "gait belt"], ["sacral", "skin", "pressure", "erythema", "foam dressing"], ["apixaban", "bleeding risk"]], followUpCategory: "safety", betterPhrase: "The major nursing safety issue is mobility: she nearly fell overnight, needs one-assist with a gait belt, and she also has sacral erythema plus bleeding risk because of apixaban." },
    { id: "pending-work", label: "Name the concrete pending work for the next shift: 14:00 BMP/Mg, chest x-ray, sputum culture finalization, PT, and wound care.", weight: 12, critical: true, minGroups: 2, groups: [["14:00 bmp", "repeat bmp", "repeat magnesium", "afternoon labs"], ["chest x-ray", "portable chest x-ray", "cxr"], ["sputum culture", "culture final"], ["physical therapy", "pt", "wound care"]], followUpCategory: "pending-tasks", betterPhrase: "Please follow today's BMP/Mg, the portable chest x-ray, final sputum culture, and the PT and wound-care reassessments." }
  ];

  const followUpQuestionBank = [
    { id: "followup-priorities", category: "priorities", targetIds: ["respiratory-priority", "renal-hemodynamic-priority"], question: "What are your top priorities over the next shift given her oxygen requirement, soft blood pressure, and worsening renal function?" },
    { id: "followup-medication-changes", category: "medication-changes", targetIds: ["renal-hemodynamic-priority", "electrolytes", "rate-control-and-anticoagulation"], question: "What medications changed over the last two days, and why do those changes matter to the next nurse?" },
    { id: "followup-pending", category: "pending-work", targetIds: ["pending-work", "infection-reassessment"], question: "What labs, tests, or consult follow-up still need to happen today before discharge can even be reconsidered?" },
    { id: "followup-safety", category: "safety", targetIds: ["safety-risks"], question: "What are the biggest safety issues for this patient, and what should the next nurse do differently after the near-fall overnight?" }
  ];

  const scenario = {
    id: SCENARIO_ID,
    title: "Telemetry Handoff Simulation",
    subtitle: "Hospital day 5 handoff for a patient recovering from heart failure decompensation, pneumonia, and new atrial fibrillation",
    receiverName: "Charge RN Morgan",
    receiverRole: "Oncoming day-shift telemetry nurse",
    briefing: {
      scenarioType: "Adult inpatient telemetry handoff",
      timebox: "Start of day shift after a clinically busy night",
      objective: "Review the chart, synthesize the most handoff-relevant evolution across several days, then deliver a concise but safe nursing handoff."
    },
    patient: Object.assign({}, basePatient, { currentShift: "Night to day handoff", currentDate: "2026-03-18", dailyData: dailyData }),
    shiftHistory: shiftHistory,
    expectedCoverageTargets: coverageTargets,
    followUpQuestionBank: followUpQuestionBank,
    currentFocusChecklist: ["Can you explain why discharge is on hold?", "Can you connect renal trends to recent medication changes?", "Did you name what the next nurse has to do, not just what already happened?"],
    transcriptionHints: ["heart failure", "right lower lobe pneumonia", "atrial fibrillation", "telemetry", "ceftriaxone", "azithromycin", "metoprolol", "apixaban", "furosemide", "creatinine", "potassium", "magnesium", "sacral erythema", "gait belt", "portable chest x-ray"],
    exemplarHandoff: "This is Synthetic Patient Rowan, a 72-year-old telemetry patient on hospital day 5, full code, admitted for acute decompensated heart failure with a right lower lobe pneumonia and new atrial fibrillation. She is much better than admission, but she is still on 2 liters nasal cannula and desats to 89 percent with transfers, so I would keep oxygen on and watch her exertional saturation closely. Her biggest unresolved problem is AKI during diuresis: creatinine is up to 1.7, blood pressure has been running soft around 102 over 60 with an overnight 98 over 58, and the team reduced Lasix to 20 by mouth and held any extra dose this morning. She also remains potassium 3.3 and magnesium 1.6 after overnight replacement, so the repeat BMP and magnesium today matter. A fib is now rate controlled in the 80s to low 90s on metoprolol, and she is on apixaban, so falls are a real bleeding risk. She nearly fell overnight, needs one-assist with a gait belt for all transfers, and still has blanchable sacral erythema with foam dressing in place. For infection follow-up, she stayed on ceftriaxone after finishing azithromycin because she had a low-grade temp to 37.8 and WBC bumped back up, so today's chest x-ray and sputum culture will help guide the plan. Pending items are the afternoon BMP and magnesium, chest x-ray, PT reassessment, and wound-care follow-up, and discharge is on hold until renal function, mobility, and oxygen needs are more stable.",
    demo: {
      initialTranscript: "This is Rowan in 4 West telemetry, hospital day five. She came in with heart failure and pneumonia and had new A fib with RVR earlier in the stay. Tonight she stayed on two liters nasal cannula and is okay at rest, but she drops with activity and needed help after getting dizzy going to the bathroom. Her blood pressure has been soft and creatinine is up, so the team cut back the Lasix. She is also still low on potassium and magnesium even after replacement. She is rate controlled on metoprolol and on Eliquis now. She had a low fever overnight and a higher white count, so she is still on ceftriaxone and has a chest x-ray pending. She needs one assist with a gait belt, watch the sacral redness, and please follow the repeat BMP this afternoon plus PT and wound care.",
      followUpAnswers: {
        "followup-priorities": "My top priorities are watching her oxygen with any ambulation, preventing another fall, and seeing whether her pressure and urine output tolerate the lower diuretic dose.",
        "followup-medication-changes": "The IV Lasix was transitioned to oral and then reduced again because of AKI and soft blood pressure. Losartan is being held. Metoprolol was increased for rate control and apixaban was started, so bleeding risk matters. She also got potassium and magnesium replacement overnight.",
        "followup-pending": "The main pending work is the repeat BMP and magnesium, the portable chest x-ray, final sputum culture, PT mobility reassessment, and wound-care recommendations."
      }
    }
  };

  return {
    SCENARIO_ID: SCENARIO_ID,
    createScenario: function createScenario() {
      return JSON.parse(JSON.stringify(scenario));
    },
    getScenario: function getScenario() {
      return JSON.parse(JSON.stringify(scenario));
    },
    getTimelineDates: function getTimelineDates() {
      return Object.keys(dailyData).sort();
    },
    buildTranscriptionPrompt: function buildTranscriptionPrompt() {
      return [
        "This is a nursing shift handoff for a synthetic telemetry inpatient.",
        "Preserve medication names, punctuation, oxygen liter flow, lab values, and abbreviations if spoken.",
        "Likely terms include: " + scenario.transcriptionHints.join(", ") + "."
      ].join(" ");
    }
  };
});
