(function attachCanonicalHandoffEngine(root) {
  const appWindow = root.window || root;
  const api = appWindow.handoffAppApi || {};

  const ENGINE_METADATA = {
    version: "canonical-20260317-1",
    contract: "handoff-engine-v1",
    focus: "explainable-prioritized-event-engine",
    stages: [
      "normalize",
      "longitudinal-summary",
      "change-detection",
      "prioritization",
      "handoff-output",
      "verification"
    ]
  };

  const SECTION_LABELS = {
    identity: "환자 정체성",
    careFrame: "현재 관리 틀",
    persistentConcerns: "지속 핵심 문제",
    watchItems: "집중 관찰",
    carryoverItems: "지속 인계 책임"
  };

  const SECTION_DESCRIPTIONS = {
    identity: "입원 배경과 핵심 진단 등 전체 재원기간에서 유지해야 하는 정보",
    careFrame: "선택한 분석기간 안에서 현재 유지 중인 관리 조건",
    persistentConcerns: "선택한 분석기간 안에서 아직 남아 있는 핵심 문제",
    watchItems: "이번 근무조가 더 주의해서 볼 항목",
    carryoverItems: "다음 근무조가 이어받아야 할 책임"
  };

  const LONGITUDINAL_BAND_LABELS = {
    core: "핵심",
    focus: "집중",
    supporting: "보조",
    background: "배경"
  };

  const PRIORITY_TIER_LABELS = {
    0: "즉시 보고",
    1: "다음 근무조",
    2: "추적 관찰",
    3: "배경 묶음"
  };

  const PRIORITY_TIER_DESCRIPTIONS = {
    0: "즉시 안전 위험 또는 즉시 보고가 필요한 항목",
    1: "다음 근무조가 바로 이어받아야 하는 시간 민감 항목",
    2: "지속 관찰 또는 후속 확인이 필요한 항목",
    3: "핵심 흐름은 아니지만 배경으로 유지할 항목"
  };

  const DEPARTMENT_PROFILES = {
    medical_ward: {
      id: "medical_ward",
      label: "내과계 병동",
      description: "만성질환, 감염, 내과계 follow-up과 지속 관찰 중심 프로파일",
      icu: false,
      family: "medical"
    },
    surgical_ward: {
      id: "surgical_ward",
      label: "외과계 병동",
      description: "수술 후 경과, 상처, 배액, 출혈, 금식/식이 전환 중심 프로파일",
      icu: false,
      family: "surgical"
    },
    neurology_ward: {
      id: "neurology_ward",
      label: "신경계 병동",
      description: "의식, 운동/언어, 흡인 위험, 뇌졸중/신경학적 변화 중심 프로파일",
      icu: false,
      family: "neurology"
    },
    oncology_ward: {
      id: "oncology_ward",
      label: "종양계 병동",
      description: "항암치료, 감염 위험, 혈액수치 변화, 통증·오심 관리 중심 프로파일",
      icu: false,
      family: "oncology"
    },
    medical_icu: {
      id: "medical_icu",
      label: "내과계 중환자실",
      description: "호흡·순환 support, high-risk infusion, critical lab 중심 ICU 프로파일",
      icu: true,
      family: "medical"
    },
    surgical_icu: {
      id: "surgical_icu",
      label: "외과계 중환자실",
      description: "수술 후 불안정 상태, drain/bleeding, ventilator, 집중 모니터링 중심 ICU 프로파일",
      icu: true,
      family: "surgical"
    }
  };

  const legacy = {
    buildNormalizedDailyTimeline:
      typeof root.buildNormalizedDailyTimeline === "function" ? root.buildNormalizedDailyTimeline : null,
    buildLongitudinalPatientSummary:
      typeof root.buildLongitudinalPatientSummary === "function" ? root.buildLongitudinalPatientSummary : null,
    buildHandoffAnalysis:
      typeof root.buildHandoffAnalysis === "function" ? root.buildHandoffAnalysis : null,
    generateNarrativeSBAR:
      typeof root.generateNarrativeSBAR === "function" ? root.generateNarrativeSBAR : null,
    detectHandoffChanges:
      typeof root.detectHandoffChanges === "function" ? root.detectHandoffChanges : null,
    scoreHandoffEvents:
      typeof root.scoreHandoffEvents === "function" ? root.scoreHandoffEvents : null,
    buildSbarPayload:
      typeof root.buildSbarPayload === "function" ? root.buildSbarPayload : null
  };

  const analysisCache = new Map();

  function unique(items) {
    return Array.from(new Set((items || []).filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compactText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeEvidenceList(item) {
    return unique(
      (item?.evidence || [])
        .map((entry) => compactText(entry))
        .filter((entry) => entry && !/evidence/i.test(entry))
    );
  }

  function safeSnapshotDate(snapshot) {
    return String(snapshot?.date || "");
  }

  function buildAnalysisCacheKey(patient, dates) {
    const id = String(patient?.id || "unknown");
    const safeDates = Array.isArray(dates) ? dates.slice().sort() : [];
    return `${id}::${safeDates.join("|")}`;
  }

  function createExplanationLine(parts) {
    return parts.filter(Boolean).join(" / ");
  }

  function bandLabel(band) {
    return LONGITUDINAL_BAND_LABELS[band] || LONGITUDINAL_BAND_LABELS.background;
  }

  function detectImmediateRisk(item, text) {
    if (item.type === "vital_abnormal" && /(spo2|rr|resp|oxygen|o2|bp|hr|shock)/i.test(text)) return true;
    if (item.type === "lab_change" && /(k|potassium|na|sodium|cr|creatinine|hb|hgb|plt|platelet)/i.test(text)) return true;
    return false;
  }

  function detectTimeSensitiveAction(item, text) {
    if (item.type === "new_order" || item.type === "discontinued_order") return true;
    if (item.type === "nursing_action" && /(recheck|pending|follow|확인|추적|pump|infusion)/i.test(text)) return true;
    if (item.type === "status_change" && /(vent|o2|oxygen|line|tube|drain|isolation)/i.test(text)) return true;
    return false;
  }

  function detectCarryover(item, text) {
    return item.type === "nursing_action" || /(carryover|follow|recheck|확인|인계|pending|추적)/i.test(text);
  }

  function detectHighRiskMedication(text) {
    return /(insulin|heparin|warfarin|enoxaparin|morphine|fentanyl|hydromorphone|potassium|kcl|norepinephrine|epinephrine|vasopressin|dobutamine|cisplatin|doxorubicin|cyclophosphamide|chemo)/i.test(text);
  }

  function detectNeedsReport(item, text) {
    if ((item.type === "new_order" || item.type === "discontinued_order") && detectHighRiskMedication(text)) return true;
    if (item.type === "lab_change" && /(critical|high|low|이상 전환)/i.test(text)) return true;
    if (item.type === "vital_abnormal" && /(bp|hr|spo2|rr)/i.test(text)) return true;
    return /(report|notify|보고)/i.test(text);
  }

  function buildProfileText(patient, current) {
    const meta = current?.handoffMeta || {};
    const clinicalStatus = meta.clinicalStatus || {};
    const orderText = [
      ...(meta.orders?.active || []),
      ...(meta.orders?.routine || []),
      ...(meta.orders?.prn || []),
      ...(meta.orders?.medications?.inj || []),
      ...(meta.orders?.medications?.po || []),
      ...(meta.orders?.medications?.running || [])
    ].join(" ");

    return compactText([
      patient?.diagnosis,
      patient?.admissionNote,
      (patient?.pastHistory || []).join(" "),
      (clinicalStatus.diagnoses || []).join(" "),
      clinicalStatus.activity,
      clinicalStatus.isolation,
      (clinicalStatus.caution || []).join(" "),
      (clinicalStatus.lines || []).join(" "),
      (clinicalStatus.tubes || []).join(" "),
      (clinicalStatus.drains || []).join(" "),
      (clinicalStatus.vent || []).join(" "),
      orderText,
      current?.nursingProblem,
      (current?.specials || []).join(" ")
    ].join(" "));
  }

  function isSurgicalContext(text, current) {
    const drainCount = ((current?.handoffMeta?.clinicalStatus?.drains || []).length);
    return /(surgery|surgical|post[- ]?op|postoperative|laparotomy|colectomy|bowel|wound|drain|hemovac|jp drain|bleeding|anastomosis|npo|금식|배액|수술)/i.test(text) || drainCount > 0;
  }

  function isIcuContext(current, text) {
    const roomText = compactText(`${current?.room || ""} ${current?.bed || ""} ${current?.location || ""} ${current?.unit || ""}`);
    const lineCount = ((current?.handoffMeta?.clinicalStatus?.lines || []).length);
    const tubeCount = ((current?.handoffMeta?.clinicalStatus?.tubes || []).length);
    const drainCount = ((current?.handoffMeta?.clinicalStatus?.drains || []).length);
    const runningCount = ((current?.handoffMeta?.orders?.medications?.running || []).length);
    const supportSignals = /(icu|intensive care|ventilator|mechanical ventilation|arterial line|central line|cvc|vasopressor|ecmo|crrt|high flow|hfnc|bipap|intubation)/i.test(`${roomText} ${text}`);
    const complexSupport = (lineCount + tubeCount + drainCount >= 3 && runningCount > 0) || (runningCount >= 2 && /(oxygen|o2|vent|infusion)/i.test(text));
    return supportSignals || complexSupport;
  }

  function isNeurologyContext(text) {
    return /(stroke|cva|infarction|intracranial|neuro|brain|seizure|aphasia|hemiplegia|aspiration risk|gcs|pupil|mental status|뇌|신경|흡인|의식|동공|편마비)/i.test(text);
  }

  function isOncologyContext(text) {
    return /(cancer|carcinoma|tumor|neoplasm|lymphoma|leukemia|oncology|chemo|chemotherapy|cisplatin|doxorubicin|cyclophosphamide|neutropenia|항암|종양|암)/i.test(text);
  }

  function deriveDepartmentProfile(patient, timeline) {
    const current = (timeline || [])[timeline.length - 1] || {};
    const text = buildProfileText(patient, current);

    if (isIcuContext(current, text)) {
      return isSurgicalContext(text, current)
        ? DEPARTMENT_PROFILES.surgical_icu
        : DEPARTMENT_PROFILES.medical_icu;
    }

    if (isNeurologyContext(text)) return DEPARTMENT_PROFILES.neurology_ward;
    if (isOncologyContext(text)) return DEPARTMENT_PROFILES.oncology_ward;
    if (isSurgicalContext(text, current)) return DEPARTMENT_PROFILES.surgical_ward;
    return DEPARTMENT_PROFILES.medical_ward;
  }

  function applyDepartmentTierAdjustment(item, tierInfo, departmentProfile) {
    if (!departmentProfile) {
      return { ...tierInfo, profileAdjusted: false, profileReasons: [] };
    }

    const text = compactText(`${item.summary || ""} ${item.detail || ""} ${(item.evidence || []).join(" ")}`);
    const profileReasons = [];
    let tier = tierInfo.tier;

    if (departmentProfile.id === "medical_icu") {
      if (item.type === "vital_abnormal" || item.type === "lab_change") {
        tier = Math.min(tier, 1);
        profileReasons.push("내과계 ICU는 활력과 검사 변화를 상위 인계로 승격");
      }
      if ((item.type === "status_change" || item.type === "new_order" || item.type === "discontinued_order") && /(oxygen|o2|vent|infusion|vasopressor|line|tube)/i.test(text)) {
        tier = Math.min(tier, 1);
        profileReasons.push("내과계 ICU support 변화는 즉시 follow-up이 필요");
      }
    } else if (departmentProfile.id === "surgical_icu") {
      if ((item.type === "status_change" || item.type === "lab_change" || item.type === "vital_abnormal") && /(drain|bleeding|wound|post[- ]?op|hemovac|jp drain|수술|배액|출혈)/i.test(text)) {
        tier = Math.min(tier, 1);
        profileReasons.push("외과계 ICU는 수술 후 불안정 신호를 상위 인계로 승격");
      }
      if (item.type === "nursing_action" && /(drain|bleeding|wound|dressing|배액|드레싱)/i.test(text)) {
        tier = Math.min(tier, 1);
        profileReasons.push("외과계 ICU의 미완료 처치 확인은 다음 근무조 우선 업무");
      }
    } else if (departmentProfile.id === "neurology_ward") {
      if ((item.type === "status_change" || item.type === "vital_abnormal" || item.type === "nursing_action") && /(stroke|cva|infarction|neuro|mental|gcs|pupil|motor|aphasia|aspiration|뇌|신경|의식|동공|운동|흡인)/i.test(text)) {
        tier = Math.min(tier, 1);
        profileReasons.push("신경계 병동은 신경학적 변화와 흡인 위험을 우선 인계");
      }
    } else if (departmentProfile.id === "oncology_ward") {
      if ((item.type === "lab_change" || item.type === "new_order" || item.type === "discontinued_order" || item.type === "nursing_action") && /(chemo|chemotherapy|neutropenia|platelet|plt|wbc|fever|항암|호중구|혈소판|발열)/i.test(text)) {
        tier = Math.min(tier, 1);
        profileReasons.push("종양계 병동은 항암 및 감염/혈액수치 관련 변화를 우선 인계");
      }
    } else if (departmentProfile.id === "surgical_ward") {
      if ((item.type === "status_change" || item.type === "nursing_action" || item.type === "lab_change") && /(post[- ]?op|drain|bleeding|wound|npo|pain|수술|배액|출혈|통증|금식)/i.test(text)) {
        tier = Math.min(tier, 1);
        profileReasons.push("외과계 병동은 수술 후 경과와 배액/상처 관찰을 우선 인계");
      }
    } else if (departmentProfile.id === "medical_ward") {
      if ((item.type === "lab_change" || item.type === "nursing_action") && /(infection|sepsis|electrolyte|glucose|dialysis|감염|패혈|전해질|혈당)/i.test(text)) {
        tier = Math.min(tier, 2);
        profileReasons.push("내과계 병동은 감염·전해질·지속 follow-up 이슈를 추적 인계");
      }
    }

    return {
      ...tierInfo,
      tier,
      label: PRIORITY_TIER_LABELS[tier],
      description: PRIORITY_TIER_DESCRIPTIONS[tier],
      profileAdjusted: tier !== tierInfo.tier || profileReasons.length > 0,
      profileReasons,
      departmentProfile
    };
  }

  function classifyPriorityTier(item, departmentProfile) {
    const text = compactText(`${item.summary || ""} ${item.detail || ""} ${(item.evidence || []).join(" ")}`);
    const immediateRisk = detectImmediateRisk(item, text);
    const timeSensitive = detectTimeSensitiveAction(item, text);
    const carryover = detectCarryover(item, text);
    const highRiskMedication = detectHighRiskMedication(text);
    const needsReport = detectNeedsReport(item, text);

    let tier = 3;
    if (immediateRisk || (needsReport && highRiskMedication)) {
      tier = 0;
    } else if (timeSensitive || highRiskMedication || item.priorityBand === "urgent" || item.priorityBand === "high") {
      tier = 1;
    } else if (carryover || item.priorityBand === "moderate" || item.type === "lab_change" || item.type === "vital_abnormal") {
      tier = 2;
    }

    return applyDepartmentTierAdjustment(item, {
      tier,
      label: PRIORITY_TIER_LABELS[tier],
      description: PRIORITY_TIER_DESCRIPTIONS[tier],
      flags: {
        immediateRisk,
        timeSensitive,
        carryover,
        highRiskMedication,
        needsReport
      }
    }, departmentProfile);
  }

  function buildPriorityReasons(item, tierInfo) {
    const reasons = [];
    if (tierInfo.departmentProfile?.label) reasons.push(`${tierInfo.departmentProfile.label} 기준 반영`);
    if (Array.isArray(tierInfo.profileReasons) && tierInfo.profileReasons.length) reasons.push(tierInfo.profileReasons[0]);
    if (tierInfo.flags.immediateRisk) reasons.push("즉시 안전 위험");
    if (tierInfo.flags.timeSensitive) reasons.push("다음 근무조 시간 민감 행동");
    if (tierInfo.flags.carryover) reasons.push("지속 인계 책임");
    if (tierInfo.flags.highRiskMedication) reasons.push("고위험 약물 또는 처치 맥락");
    if (tierInfo.flags.needsReport) reasons.push("보고 또는 재확인 필요");
    if ((item.evidence || []).length > 1) reasons.push("근거 다중 연결");
    if (!reasons.length && tierInfo.tier === 3) reasons.push("배경 맥락 유지");
    return reasons;
  }

  function buildActionRelevance(item, tierInfo) {
    const profilePrefix = tierInfo.departmentProfile?.label
      ? `${tierInfo.departmentProfile.label} 기준으로 `
      : "";
    if (tierInfo.flags.immediateRisk) return `${profilePrefix}즉시 상태 확인과 보고 판단이 필요합니다.`;
    if (tierInfo.flags.timeSensitive) return `${profilePrefix}다음 근무조가 바로 이어받아야 하는 항목입니다.`;
    if (tierInfo.flags.carryover) return `${profilePrefix}후속 확인이나 미완료 업무 인계가 필요합니다.`;
    return `${profilePrefix}배경 정보로 유지하되 상황 변화 시 다시 확인합니다.`;
    if (tierInfo.flags.immediateRisk) return "즉시 상태 확인과 보고 판단이 필요합니다.";
    if (tierInfo.flags.timeSensitive) return "다음 근무조가 바로 이어받아야 할 항목입니다.";
    if (tierInfo.flags.carryover) return "후속 확인이나 미완료 업무 인계가 필요합니다.";
    return "배경 정보로 유지하되 상황 변화 시 다시 확인합니다.";
  }

  function buildVerificationForItem(item, tierInfo) {
    const evidence = safeEvidenceList(item);
    if (tierInfo.tier <= 1 && !evidence.length) {
      return {
        status: "abstained",
        label: "출력 보류",
        reason: "상위 우선순위인데 근거 연결이 부족합니다.",
        evidenceCount: 0
      };
    }

    if (!evidence.length) {
      return {
        status: "needs-review",
        label: "검토 필요",
        reason: "근거가 약해 사람이 다시 확인해야 합니다.",
        evidenceCount: 0
      };
    }

    return {
      status: "verified",
      label: "근거 연결",
      reason: `${evidence.length}개 근거가 연결되었습니다.`,
      evidenceCount: evidence.length
    };
  }

  function enrichSummaryItem(item, sectionKey) {
    const band = item.importanceBand || "background";
    const basis = Array.isArray(item.clinicalBasis) ? item.clinicalBasis.slice(0, 4) : [];
    return {
      ...item,
      sectionKey,
      sectionTitle: SECTION_LABELS[sectionKey] || sectionKey,
      sectionDescription: SECTION_DESCRIPTIONS[sectionKey] || "",
      importanceLabel: bandLabel(band),
      whyIncluded: createExplanationLine([
        item.detail || "",
        basis[0] ? `대표 근거: ${basis[0]}` : "",
        Array.isArray(item.reasoning) && item.reasoning.length ? `선정 이유: ${item.reasoning.slice(0, 2).join(", ")}` : ""
      ]),
      explainability: {
        band,
        bandLabel: bandLabel(band),
        sourceDateCount: Array.isArray(item.sourceDates) ? item.sourceDates.length : 0,
        clinicalBasisCount: basis.length,
        linkCount: Array.isArray(item.linkActions) ? item.linkActions.length : 0
      }
    };
  }

  function buildConciseLines(summary) {
    if (Array.isArray(summary?.conciseLines) && summary.conciseLines.length) {
      return summary.conciseLines.slice();
    }

    return String(summary?.conciseSummary || "")
      .split(/\s*\|\s*/)
      .map((entry) => compactText(entry))
      .filter(Boolean);
  }

  function canonicalBuildNormalizedDailyTimeline(patient, dates) {
    const timeline = legacy.buildNormalizedDailyTimeline
      ? legacy.buildNormalizedDailyTimeline(patient, dates)
      : [];

    return (timeline || []).map((snapshot) => ({
      ...snapshot,
      snapshotType: "normalized-daily-snapshot",
      snapshotVersion: 1,
      sourceAgnostic: true,
      evidenceRefs: snapshot?.sourceRefs || {}
    }));
  }

  function canonicalizeLongitudinalSummary(summary, patient) {
    if (!summary || !summary.sections) {
      return {
        patientId: patient?.id || "",
        sections: {
          identity: [],
          careFrame: [],
          persistentConcerns: [],
          watchItems: [],
          carryoverItems: []
        },
        conciseLines: [],
        conciseSummary: "요약 정보가 부족합니다.",
        engineVersion: ENGINE_METADATA.version
      };
    }

    const sections = {
      identity: (summary.sections.identity || []).map((item) => enrichSummaryItem(item, "identity")),
      careFrame: (summary.sections.careFrame || []).map((item) => enrichSummaryItem(item, "careFrame")),
      persistentConcerns: (summary.sections.persistentConcerns || []).map((item) => enrichSummaryItem(item, "persistentConcerns")),
      watchItems: (summary.sections.watchItems || []).map((item) => enrichSummaryItem(item, "watchItems")),
      carryoverItems: (summary.sections.carryoverItems || []).map((item) => enrichSummaryItem(item, "carryoverItems"))
    };

    return {
      ...summary,
      sections,
      conciseLines: buildConciseLines(summary),
      engineVersion: ENGINE_METADATA.version,
      summaryContract: "longitudinal-summary-v1",
      sectionMeta: {
        identity: { title: SECTION_LABELS.identity, description: SECTION_DESCRIPTIONS.identity },
        careFrame: { title: SECTION_LABELS.careFrame, description: SECTION_DESCRIPTIONS.careFrame },
        persistentConcerns: { title: SECTION_LABELS.persistentConcerns, description: SECTION_DESCRIPTIONS.persistentConcerns },
        watchItems: { title: SECTION_LABELS.watchItems, description: SECTION_DESCRIPTIONS.watchItems },
        carryoverItems: { title: SECTION_LABELS.carryoverItems, description: SECTION_DESCRIPTIONS.carryoverItems }
      }
    };
  }

  function canonicalBuildLongitudinalPatientSummary(patient, timeline, policy) {
    const summary = legacy.buildLongitudinalPatientSummary
      ? legacy.buildLongitudinalPatientSummary(patient, timeline, policy)
      : null;
    return canonicalizeLongitudinalSummary(summary, patient);
  }

  function createSupplementalEvent(type, date, summary, detail, evidence, sbarSection, extra) {
    return {
      id: compactText(`${type}-${date}-${summary}`),
      type,
      date,
      summary,
      detail,
      evidence: safeEvidenceList({ evidence }),
      sbarSection,
      source: "canonical-profile-detector",
      ...extra
    };
  }

  function eventText(item) {
    return compactText(`${item?.summary || ""} ${item?.detail || ""} ${(item?.evidence || []).join(" ")}`);
  }

  function hasEvent(events, matcher) {
    return (events || []).some((item) => matcher(item, eventText(item)));
  }

  function summaryContextTexts(longitudinalSummary) {
    const sections = longitudinalSummary?.sections || {};
    return Object.keys(sections)
      .flatMap((key) => sections[key] || [])
      .map((item) => compactText(`${item.summary || ""} ${item.detail || ""}`))
      .filter(Boolean);
  }

  function getPendingActionTexts(current) {
    const meta = current?.handoffMeta?.nursingActions || current?.nursingActions || {};
    return unique([
      ...(meta.pending || []),
      ...(meta.followUp || [])
    ]).map((item) => compactText(item));
  }

  function getNewItems(previousItems, currentItems) {
    const before = new Set((previousItems || []).map((item) => compactText(item)));
    return (currentItems || [])
      .map((item) => compactText(item))
      .filter(Boolean)
      .filter((item) => !before.has(item));
  }

  function getAbnormalLabKeys(current) {
    const abnormalEntries = current?.handoffMeta?.labs?.abnormal || current?.labs?.abnormal || [];
    return abnormalEntries
      .map((item) => compactText(item?.key || item?.label || ""))
      .filter(Boolean);
  }

  function buildProfileSpecificChangeEvents(previous, current, longitudinalSummary, departmentProfile, existingEvents) {
    if (!current || !departmentProfile) return [];

    const events = [];
    const pendingTexts = getPendingActionTexts(current);
    const summaryTexts = summaryContextTexts(longitudinalSummary).join(" ");
    const currentText = buildProfileText({ diagnosis: summaryTexts }, current);
    const newRunningMeds = getNewItems(
      previous?.handoffMeta?.orders?.medications?.running || previous?.orders?.medications?.running || [],
      current?.handoffMeta?.orders?.medications?.running || current?.orders?.medications?.running || []
    );
    const newActiveOrders = getNewItems(
      previous?.handoffMeta?.orders?.active || previous?.orders?.active || [],
      current?.handoffMeta?.orders?.active || current?.orders?.active || []
    );
    const abnormalLabKeys = getAbnormalLabKeys(current);
    const currentDate = safeSnapshotDate(current) || String(current?.date || "");

    if (departmentProfile.id === "medical_icu") {
      newRunningMeds
        .filter((item) => detectHighRiskMedication(item))
        .forEach((item) => {
          if (!hasEvent(existingEvents, (event, text) => event.type === "new_order" && text.includes(item.toLowerCase()))) {
            events.push(createSupplementalEvent(
              "new_order",
              currentDate,
              `ICU 고위험 infusion 시작: ${item}`,
              "내과계 ICU에서 바로 확인이 필요한 약물 support 변화입니다.",
              [`order:${item}`],
              "situation",
              { profileSignal: "medical_icu_support" }
            ));
          }
        });
    }

    if (departmentProfile.id === "surgical_ward" || departmentProfile.id === "surgical_icu") {
      pendingTexts
        .filter((item) => /(drain|bleeding|wound|dressing|hemovac|jp drain|배액|출혈|드레싱)/i.test(item))
        .slice(0, 2)
        .forEach((item) => {
          if (!hasEvent(existingEvents, (_, text) => text.includes(item.toLowerCase()))) {
            events.push(createSupplementalEvent(
              "nursing_action",
              currentDate,
              `수술계 추적 필요: ${item}`,
              "배액, 출혈, 상처 관련 후속 확인이 필요한 항목입니다.",
              [`pending:${item}`],
              "recommendation",
              { profileSignal: "surgical_followup" }
            ));
          }
        });
    }

    if (departmentProfile.id === "neurology_ward") {
      const aspirationCaution = (current?.handoffMeta?.clinicalStatus?.caution || current?.clinicalStatus?.caution || [])
        .map((item) => compactText(item))
        .find((item) => /(aspiration|흡인)/i.test(item));
      if (aspirationCaution && !hasEvent(existingEvents, (_, text) => /(aspiration|흡인)/i.test(text))) {
        events.push(createSupplementalEvent(
          "status_change",
          currentDate,
          `신경계 주의 강화: ${aspirationCaution}`,
          "신경계 병동에서 흡인 위험은 다음 근무조가 계속 확인해야 하는 핵심 배경입니다.",
          [`caution:${aspirationCaution}`],
          "assessment",
          { profileSignal: "neurology_risk" }
        ));
      }
    }

    if (departmentProfile.id === "oncology_ward") {
      newActiveOrders
        .filter((item) => /(chemo|chemotherapy|cisplatin|doxorubicin|cyclophosphamide|항암)/i.test(item))
        .forEach((item) => {
          if (!hasEvent(existingEvents, (_, text) => text.includes(item.toLowerCase()))) {
            events.push(createSupplementalEvent(
              "new_order",
              currentDate,
              `항암 관련 신규 오더: ${item}`,
              "종양계 병동에서 항암 관련 변화는 우선 인계 대상입니다.",
              [`order:${item}`],
              "situation",
              { profileSignal: "oncology_order" }
            ));
          }
        });

      if (abnormalLabKeys.some((key) => /(wbc|plt|platelet|hb|hgb)/i.test(key)) &&
        !hasEvent(existingEvents, (event, text) => event.type === "lab_change" && /(wbc|plt|platelet|hb|hgb)/i.test(text))) {
        const key = abnormalLabKeys.find((item) => /(wbc|plt|platelet|hb|hgb)/i.test(item));
        events.push(createSupplementalEvent(
          "lab_change",
          currentDate,
          `종양계 주의 검사 변화: ${key}`,
          "혈액수치 변화는 감염 위험, 출혈 위험, 치료 지속 여부와 연결될 수 있어 후속 확인이 필요합니다.",
          [`lab:${key}`],
          "assessment",
          { profileSignal: "oncology_lab" }
        ));
      }
    }

    if (departmentProfile.id === "medical_ward") {
      pendingTexts
        .filter((item) => /(sepsis|infection|electrolyte|glucose|dialysis|감염|패혈|전해질|혈당)/i.test(item))
        .slice(0, 2)
        .forEach((item) => {
          if (!hasEvent(existingEvents, (_, text) => text.includes(item.toLowerCase()))) {
            events.push(createSupplementalEvent(
              "nursing_action",
              currentDate,
              `내과계 추적 필요: ${item}`,
              "감염, 전해질, 대사 관련 follow-up은 다음 근무조가 이어받아야 합니다.",
              [`pending:${item}`],
              "recommendation",
              { profileSignal: "medical_followup" }
            ));
          }
        });
    }

    return events;
  }

  function deriveChangeSubtype(item) {
    const text = eventText(item);
    if (item.type === "new_order" || item.type === "discontinued_order") {
      if (detectHighRiskMedication(text)) return "high-risk-medication";
      if (/(oxygen|o2|vent|line|tube|drain|infusion|vasopressor)/i.test(text)) return "support-order";
      return "order-change";
    }
    if (item.type === "status_change") {
      if (/(oxygen|o2|vent)/i.test(text)) return "respiratory-support-change";
      if (/(line|tube|drain|foley|peg|l-tube|jp drain|hemovac)/i.test(text)) return "device-change";
      if (/(activity|bed rest|ambulation|absolute bed rest|보행|침상)/i.test(text)) return "activity-change";
      if (/(isolation|contact|reverse|격리)/i.test(text)) return "precaution-change";
      return "status-change";
    }
    if (item.type === "vital_abnormal") {
      if (/(spo2|oxygen|o2|resp|rr)/i.test(text)) return "respiratory-vital";
      if (/(bp|hr|shock|map)/i.test(text)) return "hemodynamic-vital";
      return "vital-change";
    }
    if (item.type === "lab_change") {
      if (/(k|na|electrolyte)/i.test(text)) return "electrolyte-lab";
      if (/(wbc|crp|infection|fever)/i.test(text)) return "infection-lab";
      if (/(hb|hgb|plt|platelet)/i.test(text)) return "hematology-lab";
      if (/(cr|creatinine|bun)/i.test(text)) return "renal-lab";
      return "lab-change";
    }
    if (item.type === "nursing_action") {
      if (/(pending|follow|recheck|확인|추적)/i.test(text)) return "follow-up-action";
      if (/(completed|수행)/i.test(text)) return "completed-action";
      return "nursing-action";
    }
    return item.type || "unknown";
  }

  function buildClinicalContext(item, longitudinalSummary, departmentProfile) {
    const summaryTexts = summaryContextTexts(longitudinalSummary);
    const topContext = summaryTexts.slice(0, 2);
    return {
      departmentProfileId: departmentProfile?.id || "",
      departmentProfileLabel: departmentProfile?.label || "",
      summaryContext: topContext,
      carriesBackground: /(background|배경)/i.test(String(item?.sbarSection || ""))
    };
  }

  function augmentChangeEvents(rawChangeEvents, previous, current, longitudinalSummary, departmentProfile) {
    const existingEvents = Array.isArray(rawChangeEvents) ? rawChangeEvents.slice() : [];
    const supplementalEvents = buildProfileSpecificChangeEvents(previous, current, longitudinalSummary, departmentProfile, existingEvents);
    const merged = [...existingEvents, ...supplementalEvents];
    const seen = new Set();
    return merged.filter((item) => {
      const key = compactText(`${item.type}|${item.date}|${item.summary}|${item.detail}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function enrichPrioritizedItem(item, index, departmentProfile) {
    const tierInfo = classifyPriorityTier(item, departmentProfile);
    const priorityReasons = buildPriorityReasons(item, tierInfo);
    const verification = buildVerificationForItem(item, tierInfo);
    return {
      ...item,
      rank: index + 1,
      changeSubtype: deriveChangeSubtype(item),
      priorityTier: tierInfo.tier,
      priorityTierLabel: tierInfo.label,
      priorityTierDescription: tierInfo.description,
      priorityReasons,
      whyRanked: createExplanationLine(priorityReasons),
      actionRelevance: buildActionRelevance(item, tierInfo),
      verification,
      departmentProfile: departmentProfile || null,
      flags: {
        immediateRisk: tierInfo.flags.immediateRisk,
        timeSensitive: tierInfo.flags.timeSensitive,
        carryover: tierInfo.flags.carryover,
        highRiskMedicationRelated: tierInfo.flags.highRiskMedication,
        reportNeeded: tierInfo.flags.needsReport
      },
      profileReasons: tierInfo.profileReasons || []
    };
  }

  function enrichChangeEvent(item, departmentProfile, longitudinalSummary) {
    const tierInfo = classifyPriorityTier(item, departmentProfile);
    const clinicalContext = buildClinicalContext(item, longitudinalSummary, departmentProfile);
    return {
      ...item,
      category: item.type,
      changeSubtype: deriveChangeSubtype(item),
      detectedFact: item.summary,
      handoffRelevance: buildActionRelevance(item, tierInfo),
      actionRelevance: buildActionRelevance(item, tierInfo),
      evidence: safeEvidenceList(item),
      priorityTier: tierInfo.tier,
      priorityTierLabel: tierInfo.label,
      departmentProfile: departmentProfile || null,
      departmentSensitivity: departmentProfile?.id || "",
      reportNeeded: Boolean(tierInfo.flags.needsReport),
      carryoverRelated: Boolean(tierInfo.flags.carryover),
      highRiskContext: Boolean(tierInfo.flags.highRiskMedication),
      clinicalContext
    };
  }

  function sortPrioritizedItems(items) {
    return items.slice().sort((left, right) => {
      if (left.priorityTier !== right.priorityTier) return left.priorityTier - right.priorityTier;
      if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
      return (left.rank || 0) - (right.rank || 0);
    });
  }

  function buildVerificationResult(prioritizedItems) {
    const items = prioritizedItems || [];
    const abstainedItems = items.filter((item) => item.verification?.status === "abstained");
    const verifiedItems = items.filter((item) => item.verification?.status === "verified");
    const reviewItems = items.filter((item) => item.verification?.status === "needs-review");
    const topTierItems = items.filter((item) => item.priorityTier <= 1);

    return {
      status: abstainedItems.length ? "partial" : "verified",
      verifiedCount: verifiedItems.length,
      reviewCount: reviewItems.length,
      abstainedCount: abstainedItems.length,
      topTierEvidenceLinked: topTierItems.every((item) => (item.verification?.evidenceCount || 0) > 0),
      abstainedItems: abstainedItems.map((item) => ({
        id: item.id || item.summary,
        summary: item.summary,
        reason: item.verification?.reason || ""
      }))
    };
  }

  function buildVerificationClaims(prioritizedItems) {
    return (prioritizedItems || []).slice(0, 12).map((item) => ({
      id: item.id || item.summary,
      claim: item.summary,
      tier: item.priorityTierLabel,
      status: item.verification?.status || "needs-review",
      evidenceCount: item.verification?.evidenceCount || 0,
      subtype: item.changeSubtype || item.type || "",
      evidence: safeEvidenceList(item).slice(0, 2)
    }));
  }

  function buildSbarHintsMap(sbarPayload) {
    return {
      situation: (sbarPayload?.situation || []).map((item) => item.summary).slice(0, 3),
      background: (sbarPayload?.background || []).map((item) => item.summary).slice(0, 3),
      assessment: (sbarPayload?.assessment || []).map((item) => item.summary).slice(0, 3),
      recommendation: (sbarPayload?.recommendation || []).map((item) => item.summary).slice(0, 3)
    };
  }

  function buildStructuredHandoffOutput(longitudinalSummary, prioritizedItems, sbarPayload, verificationResult, departmentProfile) {
    const items = prioritizedItems || [];
    const verifiedItems = items.filter((item) => item.verification?.status === "verified");
    const reviewItems = items.filter((item) => item.verification?.status === "needs-review");
    const actionItems = items.filter((item) => item.flags?.immediateRisk || item.flags?.timeSensitive).slice(0, 5);
    const carryoverItems = items.filter((item) => item.flags?.carryover).slice(0, 5);
    const watchItems = items.filter((item) => item.priorityTier === 2).slice(0, 5);
    const backgroundItems = items.filter((item) => item.priorityTier === 3).slice(0, 5);

    return {
      outputContract: "handoff-output-v1",
      departmentProfile,
      summaryLines: buildConciseLines(longitudinalSummary).slice(0, 5),
      topPriorityItems: items.filter((item) => item.priorityTier <= 1).slice(0, 5),
      actionItems,
      carryoverItems,
      watchItems,
      backgroundItems,
      verification: {
        status: verificationResult?.status || "verified",
        verifiedItems: verifiedItems.slice(0, 6),
        reviewItems: reviewItems.slice(0, 6),
        withheldItems: verificationResult?.abstainedItems || [],
        claims: buildVerificationClaims(items)
      },
      sbarHints: buildSbarHintsMap(sbarPayload)
    };
  }

  function groupLowerPrioritySummary(items) {
    return {
      tier2: items.filter((item) => item.priorityTier === 2).map((item) => item.summary),
      tier3: items.filter((item) => item.priorityTier === 3).map((item) => item.summary)
    };
  }

  function buildExplanationIndex(summary, prioritizedItems) {
    const index = {};
    Object.keys(summary.sections || {}).forEach((key) => {
      (summary.sections[key] || []).forEach((item) => {
        index[item.id] = {
          type: "longitudinal-summary",
          title: item.summary,
          whyIncluded: item.whyIncluded,
          evidence: item.clinicalBasis || [],
          section: item.sectionTitle
        };
      });
    });

    (prioritizedItems || []).forEach((item) => {
      index[item.id || item.summary] = {
        type: "prioritized-event",
        title: item.summary,
        whyIncluded: item.whyRanked,
        evidence: safeEvidenceList(item),
        section: item.priorityTierLabel,
        actionRelevance: item.actionRelevance
      };
    });

    return index;
  }

  function matchPrioritizedItem(prioritizedItems, item) {
    return (prioritizedItems || []).find((candidate) =>
      candidate.summary === item.summary && candidate.detail === item.detail
    ) || null;
  }

  function enrichSbarItems(items, prioritizedItems, fallbackTier, departmentProfile) {
    return (items || []).map((item, index) => {
      const matched = matchPrioritizedItem(prioritizedItems, item);
      if (matched) return matched;
      const tierInfo = classifyPriorityTier({
        ...item,
        type: item.type || "background"
      }, departmentProfile);
      return {
        ...item,
        rank: index + 1,
        priorityTier: typeof fallbackTier === "number" ? fallbackTier : tierInfo.tier,
        priorityTierLabel: PRIORITY_TIER_LABELS[typeof fallbackTier === "number" ? fallbackTier : tierInfo.tier],
        priorityTierDescription: PRIORITY_TIER_DESCRIPTIONS[typeof fallbackTier === "number" ? fallbackTier : tierInfo.tier],
        priorityReasons: buildPriorityReasons(item, tierInfo),
        whyRanked: createExplanationLine(buildPriorityReasons(item, tierInfo)),
        verification: buildVerificationForItem(item, tierInfo),
        actionRelevance: buildActionRelevance(item, tierInfo)
      };
    });
  }

  function buildCanonicalSbarPayload(patient, legacyAnalysis, prioritizedItems, current, previous, departmentProfile) {
    const timelineEvents = legacy.scoreHandoffEvents && Array.isArray(legacyAnalysis?.changeEvents)
      ? legacy.scoreHandoffEvents(legacyAnalysis.changeEvents, { current, previous })
      : [];

    const basePayload = legacyAnalysis?.sbarPayload || (legacy.buildSbarPayload
      ? legacy.buildSbarPayload(patient, {
          current,
          prioritizedHandoffItems: prioritizedItems,
          timelineEvents
        })
      : { situation: [], background: [], assessment: [], recommendation: [] });

    return {
      situation: enrichSbarItems(basePayload.situation || [], prioritizedItems, 1, departmentProfile),
      background: enrichSbarItems(basePayload.background || [], prioritizedItems, 3, departmentProfile),
      assessment: enrichSbarItems(basePayload.assessment || [], prioritizedItems, 2, departmentProfile),
      recommendation: enrichSbarItems(basePayload.recommendation || [], prioritizedItems, 1, departmentProfile)
    };
  }

  function normalizeItemsForOutput(items) {
    return items.filter((item) => item.verification?.status !== "abstained");
  }

  function canonicalBuildHandoffAnalysis(patient, dates, policy) {
    const cacheKey = buildAnalysisCacheKey(patient, dates);
    if (analysisCache.has(cacheKey)) {
      return analysisCache.get(cacheKey);
    }

    const legacyAnalysis = legacy.buildHandoffAnalysis
      ? legacy.buildHandoffAnalysis(patient, dates, policy)
      : null;

    const normalizedDailyTimeline = legacyAnalysis?.normalizedDailyTimeline?.length
      ? legacyAnalysis.normalizedDailyTimeline.map((snapshot) => ({
          ...snapshot,
          snapshotType: "normalized-daily-snapshot",
          snapshotVersion: 1,
          sourceAgnostic: true,
          evidenceRefs: snapshot?.sourceRefs || {}
        }))
      : canonicalBuildNormalizedDailyTimeline(patient, dates);

    const fullTimeline = Array.isArray(legacyAnalysis?.fullTimeline)
      ? legacyAnalysis.fullTimeline.map((snapshot) => ({
          ...snapshot,
          snapshotType: "normalized-daily-snapshot",
          snapshotVersion: 1,
          sourceAgnostic: true,
          evidenceRefs: snapshot?.sourceRefs || {}
        }))
      : normalizedDailyTimeline;

    const current = normalizedDailyTimeline[normalizedDailyTimeline.length - 1] || null;
    const previous = normalizedDailyTimeline.length > 1 ? normalizedDailyTimeline[normalizedDailyTimeline.length - 2] : null;
    const departmentProfile = deriveDepartmentProfile(patient, normalizedDailyTimeline);

    const longitudinalSummary = legacyAnalysis?.longitudinalSummary?.sections
      ? canonicalizeLongitudinalSummary(legacyAnalysis.longitudinalSummary, patient)
      : canonicalBuildLongitudinalPatientSummary(patient, normalizedDailyTimeline, policy);

    const rawChangeEvents = Array.isArray(legacyAnalysis?.changeEvents)
      ? legacyAnalysis.changeEvents
      : (legacy.detectHandoffChanges && current
        ? legacy.detectHandoffChanges(previous, current, normalizedDailyTimeline[0] || null)
        : []);

    const augmentedChangeEvents = augmentChangeEvents(
      rawChangeEvents,
      previous,
      current,
      longitudinalSummary,
      departmentProfile
    );

    const scoredItems = Array.isArray(legacyAnalysis?.prioritizedHandoffItems)
      ? legacyAnalysis.prioritizedHandoffItems
      : (legacy.scoreHandoffEvents
        ? legacy.scoreHandoffEvents(augmentedChangeEvents, { current, previous, departmentProfile, longitudinalSummary })
        : augmentedChangeEvents);

    const prioritizedHandoffItems = sortPrioritizedItems(
      normalizeItemsForOutput(scoredItems.map((item, index) => enrichPrioritizedItem(item, index, departmentProfile)))
    );

    const changeEvents = augmentedChangeEvents.map((item) => enrichChangeEvent(item, departmentProfile, longitudinalSummary));
    const verificationResult = buildVerificationResult(prioritizedHandoffItems);
    const actionNeededItems = prioritizedHandoffItems.filter((item) => item.priorityTier <= 2);
    const carryoverItems = prioritizedHandoffItems.filter((item) => item.flags?.carryover);
    const groupedLowerPrioritySummary = groupLowerPrioritySummary(prioritizedHandoffItems);
    const sbarPayload = buildCanonicalSbarPayload(patient, legacyAnalysis, prioritizedHandoffItems, current, previous, departmentProfile);
    const handoffOutput = buildStructuredHandoffOutput(
      longitudinalSummary,
      prioritizedHandoffItems,
      sbarPayload,
      verificationResult,
      departmentProfile
    );

    const result = {
      ...(legacyAnalysis || {}),
      engineVersion: ENGINE_METADATA.version,
      engineContract: ENGINE_METADATA.contract,
      normalizedDailyTimeline,
      fullTimeline,
      longitudinalSummary,
      changeEvents,
      prioritizedHandoffItems,
      actionNeededItems,
      carryoverItems,
      departmentProfileUsed: departmentProfile,
      groupedLowerPrioritySummary,
      explanationIndex: buildExplanationIndex(longitudinalSummary, prioritizedHandoffItems),
      verificationResult,
      sbarPayload,
      handoffOutput,
      runtimePolicy: {
        sourceAgnostic: true,
        verificationRequiredForTopTier: true,
        excludedDepartments: ["emergency", "operating-room"]
      }
    };

    analysisCache.set(cacheKey, result);
    return result;
  }

  function rankHandoffItems(events, context) {
    const departmentProfile = context?.departmentProfileUsed || context?.departmentProfile || null;
    const scoredItems = legacy.scoreHandoffEvents
      ? legacy.scoreHandoffEvents(events || [], context || {})
      : (events || []);

    return sortPrioritizedItems(
      normalizeItemsForOutput(scoredItems.map((item, index) => enrichPrioritizedItem(item, index, departmentProfile)))
    );
  }

  function renderExplainabilityList(items) {
    if (!items.length) {
      return '<div class="engine-explainability-empty">해당 항목 없음</div>';
    }

    return items.map((item) => `
      <article class="engine-explainability-item">
        <div class="engine-explainability-item-top">
          <div class="engine-explainability-item-title">${escapeHtml(item.summary || "-")}</div>
          <span class="engine-explainability-tier tier-${item.priorityTier}">${escapeHtml(item.priorityTierLabel)}</span>
        </div>
        <div class="engine-explainability-item-why">${escapeHtml(item.whyRanked || item.actionRelevance || "-")}</div>
        <div class="engine-explainability-item-meta">
          <span>검증: ${escapeHtml(item.verification?.label || "-")}</span>
          <span>근거 ${escapeHtml(String(item.verification?.evidenceCount || 0))}개</span>
        </div>
      </article>
    `).join("");
  }

  function renderStructuredList(items, emptyLabel) {
    if (!items || !items.length) {
      return `<div class="engine-output-empty">${escapeHtml(emptyLabel || "항목 없음")}</div>`;
    }

    return items.map((item) => `
      <article class="engine-output-item">
        <div class="engine-output-item-top">
          <div class="engine-output-item-title">${escapeHtml(item.summary || item.claim || "-")}</div>
          ${item.priorityTierLabel ? `<span class="engine-explainability-tier tier-${item.priorityTier}">${escapeHtml(item.priorityTierLabel)}</span>` : ""}
        </div>
        ${item.actionRelevance ? `<div class="engine-output-item-body">${escapeHtml(item.actionRelevance)}</div>` : ""}
        ${item.reason ? `<div class="engine-output-item-body">${escapeHtml(item.reason)}</div>` : ""}
        ${(item.evidenceCount != null) ? `<div class="engine-output-item-meta">근거 ${escapeHtml(String(item.evidenceCount || 0))}개</div>` : ""}
      </article>
    `).join("");
  }

  function renderClaimMatrix(claims) {
    if (!claims || !claims.length) {
      return '<div class="engine-output-empty">검증 claim 없음</div>';
    }

    return claims.map((claim) => `
      <div class="engine-claim-row">
        <div class="engine-claim-text">${escapeHtml(claim.claim || "-")}</div>
        <div class="engine-claim-meta">
          <span>${escapeHtml(claim.tier || "-")}</span>
          <span>${escapeHtml(claim.status || "-")}</span>
          <span>근거 ${escapeHtml(String(claim.evidenceCount || 0))}개</span>
        </div>
      </div>
    `).join("");
  }

  function renderStructuredHandoffOutputPanel(analysis) {
    const output = analysis?.handoffOutput;
    if (!output) return "";

    return `
      <section class="engine-output-panel">
        <div class="engine-output-header">
          <div>
            <div class="engine-output-title">인계 출력 구조</div>
            <div class="engine-output-subtitle">핵심 배경, action, carryover, 검토 필요, 보류 항목을 구조화해 보여줍니다.</div>
          </div>
          <div class="engine-explainability-badges">
            <span class="engine-explainability-badge">${escapeHtml(output.departmentProfile?.label || "공통 프로파일")}</span>
            <span class="engine-explainability-badge">검증 ${escapeHtml(output.verification?.status || "verified")}</span>
          </div>
        </div>
        <div class="engine-output-grid">
          <section class="engine-output-group">
            <h4>즉시/우선 인계</h4>
            ${renderStructuredList(output.topPriorityItems, "우선 인계 항목 없음")}
          </section>
          <section class="engine-output-group">
            <h4>다음 근무조 action</h4>
            ${renderStructuredList(output.actionItems, "즉시 action 항목 없음")}
          </section>
          <section class="engine-output-group">
            <h4>지속 인계 책임</h4>
            ${renderStructuredList(output.carryoverItems, "지속 인계 책임 없음")}
          </section>
          <section class="engine-output-group">
            <h4>검토 필요</h4>
            ${renderStructuredList(output.verification?.reviewItems, "검토 필요 항목 없음")}
          </section>
        </div>
        <div class="engine-output-grid secondary">
          <section class="engine-output-group">
            <h4>출력 보류</h4>
            ${renderStructuredList(output.verification?.withheldItems, "보류 항목 없음")}
          </section>
          <section class="engine-output-group wide">
            <h4>검증 claim 매트릭스</h4>
            ${renderClaimMatrix(output.verification?.claims)}
          </section>
        </div>
      </section>
    `;
  }

  function renderExplainabilityPanel(analysis) {
    const items = analysis?.prioritizedHandoffItems || [];
    const tier0 = items.filter((item) => item.priorityTier === 0).slice(0, 3);
    const tier1 = items.filter((item) => item.priorityTier === 1).slice(0, 4);
    const tier2 = items.filter((item) => item.priorityTier === 2).slice(0, 4);
    const background = items.filter((item) => item.priorityTier === 3).slice(0, 4);
    const verification = analysis?.verificationResult || {};
    const departmentProfile = analysis?.departmentProfileUsed || null;

    return `
      <section class="engine-explainability-panel">
        <div class="engine-explainability-header">
          <div>
            <div class="engine-explainability-title">엔진 판단 요약</div>
            <div class="engine-explainability-subtitle">단일 엔진 계약 기준으로 변화, 우선순위, 검증 결과를 구조화했습니다.</div>
          </div>
          <div class="engine-explainability-badges">
            <span class="engine-explainability-badge">엔진 ${escapeHtml(ENGINE_METADATA.version)}</span>
            <span class="engine-explainability-badge">검증 ${escapeHtml(verification.status || "verified")}</span>
            ${departmentProfile ? `<span class="engine-explainability-badge">${escapeHtml(departmentProfile.label)}</span>` : ""}
          </div>
        </div>
        <div class="engine-explainability-grid">
          <section class="engine-explainability-group">
            <h4>즉시 보고</h4>
            ${renderExplainabilityList(tier0)}
          </section>
          <section class="engine-explainability-group">
            <h4>다음 근무조</h4>
            ${renderExplainabilityList(tier1)}
          </section>
          <section class="engine-explainability-group">
            <h4>추적 관찰</h4>
            ${renderExplainabilityList(tier2)}
          </section>
          <section class="engine-explainability-group">
            <h4>배경 묶음</h4>
            ${renderExplainabilityList(background)}
          </section>
        </div>
      </section>
    `;
  }

  function canonicalGenerateNarrativeSBAR(patient, startData, endData, dates) {
    const analysis = canonicalBuildHandoffAnalysis(patient, dates);
    root.__lastHandoffAnalysis = analysis;

    const baseHtml = legacy.generateNarrativeSBAR
      ? legacy.generateNarrativeSBAR(patient, startData, endData, dates)
      : "";

    return `${baseHtml}${renderExplainabilityPanel(analysis)}${renderStructuredHandoffOutputPanel(analysis)}`;
  }

  function getHandoffEngineMetadata() {
    return {
      ...ENGINE_METADATA,
      bands: LONGITUDINAL_BAND_LABELS,
      priorityTiers: PRIORITY_TIER_LABELS,
      departmentProfiles: Object.values(DEPARTMENT_PROFILES).map((profile) => ({
        id: profile.id,
        label: profile.label,
        description: profile.description,
        icu: profile.icu,
        family: profile.family
      })),
      excludedDepartments: ["emergency", "operating-room"]
    };
  }

  root.buildNormalizedDailyTimeline = canonicalBuildNormalizedDailyTimeline;
  root.buildLongitudinalPatientSummary = canonicalBuildLongitudinalPatientSummary;
  root.buildHandoffAnalysis = canonicalBuildHandoffAnalysis;
  root.generateNarrativeSBAR = canonicalGenerateNarrativeSBAR;

  appWindow.handoffAppApi = Object.assign(api, {
    buildNormalizedDailyTimeline: canonicalBuildNormalizedDailyTimeline,
    buildLongitudinalPatientSummary: canonicalBuildLongitudinalPatientSummary,
    buildHandoffAnalysis: canonicalBuildHandoffAnalysis,
    generateNarrativeSBAR: canonicalGenerateNarrativeSBAR,
    buildVerificationResult,
    rankHandoffItems,
    getHandoffEngineMetadata,
    engineVersion: ENGINE_METADATA.version,
    engineContract: ENGINE_METADATA.contract
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
