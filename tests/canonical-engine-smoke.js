const assert = require("assert");
const { loadHandoffEngineApi } = require("../src/harness/runtime/loadHandoffEngineApi");

function buildPriorityFixturePatient() {
  return {
    id: "canonical-engine-patient",
    name: "Synthetic Priority Patient",
    gender: "F",
    age: "67",
    room: "701-1",
    diagnosis: "Synthetic Stroke",
    admitDate: "2026-03-15",
    admissionNote: "Synthetic stroke admission for neuro monitoring.",
    pastHistory: ["Hypertension"],
    dailyData: {
      "2026-03-15": {
        nursingProblem: "Self-care deficit",
        vital: { bp: "132/78", hr: 92, bt: 36.8, rr: 18, spo2: 97 },
        labs: {
          Chemistry: { K: "4.2", Cr: "0.9" }
        },
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ["Synthetic Stroke"],
            isolation: "-",
            activity: "Absolute bed rest",
            caution: ["Fall risk"],
            lines: ["Peripheral IV"],
            tubes: [],
            drains: [],
            vent: []
          },
          orders: {
            active: ["Aspirin"],
            routine: [],
            prn: [],
            medications: { inj: [], po: ["Aspirin"], running: [] }
          },
          vitals: {
            latest: { bp: "132/78", hr: 92, bt: 36.8, rr: 18, spo2: 97 },
            abnormalFlags: []
          },
          labs: {
            latest: { K: "4.2", Cr: "0.9" },
            abnormal: []
          },
          nursingActions: {
            completed: [],
            pending: [],
            followUp: []
          },
          sourceRefs: {}
        }
      },
      "2026-03-16": {
        nursingProblem: "Self-care deficit",
        vital: { bp: "86/54", hr: 128, bt: 38.2, rr: 24, spo2: 88 },
        labs: {
          Chemistry: { K: "6.1", Cr: "1.5" }
        },
        nursingTasks: [],
        plan: [],
        handoffMeta: {
          clinicalStatus: {
            diagnoses: ["Synthetic Stroke"],
            isolation: "Contact precaution",
            activity: "Bed rest with assist",
            caution: ["Fall risk", "Aspiration risk"],
            lines: ["Peripheral IV"],
            tubes: [],
            drains: [],
            vent: ["Nasal cannula 3L"]
          },
          orders: {
            active: ["Aspirin", "Heparin infusion"],
            routine: [],
            prn: [],
            medications: { inj: ["Heparin infusion"], po: ["Aspirin"], running: ["Heparin infusion"] }
          },
          vitals: {
            latest: { bp: "86/54", hr: 128, bt: 38.2, rr: 24, spo2: 88 },
            abnormalFlags: ["bp", "hr", "bt", "rr", "spo2"]
          },
          labs: {
            latest: { K: "6.1", Cr: "1.5" },
            abnormal: [
              { key: "K", value: "6.1", status: "high" },
              { key: "Cr", value: "1.5", status: "high" }
            ]
          },
          nursingActions: {
            completed: [],
            pending: ["Recheck heparin pump", "Report potassium result"],
            followUp: ["Recheck heparin pump", "Report potassium result"]
          },
          sourceRefs: {}
        }
      }
    }
  };
}

function main() {
  const { api } = loadHandoffEngineApi();
  const patient = buildPriorityFixturePatient();
  const dates = Object.keys(patient.dailyData).sort();

  const metadata = api.getHandoffEngineMetadata();
  assert.strictEqual(metadata.contract, "handoff-engine-v1");
  assert.strictEqual(api.engineContract, "handoff-engine-v1");
  assert.ok(Array.isArray(metadata.departmentProfiles));
  assert.ok(metadata.departmentProfiles.some((profile) => profile.id === "neurology_ward"));
  assert.ok(metadata.departmentProfiles.some((profile) => profile.id === "surgical_icu"));
  assert.ok(Array.isArray(metadata.excludedDepartments));
  assert.ok(metadata.excludedDepartments.includes("emergency"));

  const analysis = api.buildHandoffAnalysis(patient, dates);
  assert.strictEqual(analysis.engineContract, "handoff-engine-v1");
  assert.ok(analysis.verificationResult);
  assert.ok(Array.isArray(analysis.actionNeededItems));
  assert.ok(analysis.groupedLowerPrioritySummary);
  assert.ok(analysis.handoffOutput);
  assert.strictEqual(analysis.handoffOutput.outputContract, "handoff-output-v1");
  assert.ok(analysis.departmentProfileUsed);
  assert.strictEqual(analysis.departmentProfileUsed.id, "neurology_ward");
  assert.ok(analysis.changeEvents.some((item) => item.changeSubtype));
  assert.ok(analysis.changeEvents.some((item) => item.profileSignal === "neurology_risk"));
  assert.ok(Array.isArray(analysis.handoffOutput.topPriorityItems));
  assert.ok(Array.isArray(analysis.handoffOutput.verification.claims));

  const topItem = analysis.prioritizedHandoffItems[0];
  assert.ok(topItem.priorityTierLabel);
  assert.ok(Array.isArray(topItem.priorityReasons));
  assert.ok(topItem.verification);
  assert.ok(topItem.departmentProfile);
  assert.ok(topItem.changeSubtype);

  const heparinItem = analysis.prioritizedHandoffItems.find((item) => /Heparin/i.test(item.summary));
  assert.ok(heparinItem, "High-risk medication change should be prioritized");
  assert.ok(heparinItem.priorityTier <= 1, "High-risk medication should stay in an upper tier");
  assert.strictEqual(heparinItem.flags.reportNeeded, true);

  assert.strictEqual(analysis.verificationResult.topTierEvidenceLinked, true);

  const rankedUnsupported = api.rankHandoffItems([
    {
      type: "vital_abnormal",
      date: "2026-03-16",
      summary: "Critical unsupported vital change: BP 80/50, SpO2 86%",
      detail: "No evidence attached for immediate safety risk",
      evidence: ["evidence 부족"],
      sbarSection: "situation"
    }
  ], {});
  assert.strictEqual(rankedUnsupported.length, 0, "Unsupported top-tier items should be withheld");

  const surgicalIcuRanked = api.rankHandoffItems([
    {
      type: "nursing_action",
      date: "2026-03-16",
      summary: "Post-op Hemovac output recheck",
      detail: "Pending drain output follow-up after surgery",
      evidence: ["Hemovac 120 mL, postoperative day 1"],
      priorityBand: "moderate",
      sbarSection: "recommendation"
    }
  ], {
    departmentProfile: metadata.departmentProfiles.find((profile) => profile.id === "surgical_icu")
  });
  assert.strictEqual(surgicalIcuRanked.length, 1);
  assert.strictEqual(surgicalIcuRanked[0].departmentProfile.id, "surgical_icu");
  assert.ok(surgicalIcuRanked[0].priorityTier <= 1, "Surgical ICU drain follow-up should be promoted");

  const html = api.generateNarrativeSBAR(
    patient,
    patient.dailyData[dates[0]],
    patient.dailyData[dates[dates.length - 1]],
    dates
  );
  assert(/engine-explainability-panel/.test(html));
  assert(/engine-output-panel/.test(html));
  assert(/신경계 병동/.test(html));
  assert(/즉시 보고|다음 근무조/.test(html));

  console.log("Canonical engine smoke test passed.");
}

main();
