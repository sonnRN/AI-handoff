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
    if (item.type === "lab_change" && /(critical|high|low|이상 전환)/i.test(text)) return true;
    if (item.type === "vital_abnormal" && /(bp|hr|spo2|rr)/i.test(text)) return true;
    return /(report|notify|보고)/i.test(text);
  }

  function classifyPriorityTier(item) {
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

    return {
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
    };
  }

  function buildPriorityReasons(item, tierInfo) {
    const reasons = [];
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

  function enrichPrioritizedItem(item, index) {
    const tierInfo = classifyPriorityTier(item);
    const priorityReasons = buildPriorityReasons(item, tierInfo);
    const verification = buildVerificationForItem(item, tierInfo);
    return {
      ...item,
      rank: index + 1,
      priorityTier: tierInfo.tier,
      priorityTierLabel: tierInfo.label,
      priorityTierDescription: tierInfo.description,
      priorityReasons,
      whyRanked: createExplanationLine(priorityReasons),
      actionRelevance: buildActionRelevance(item, tierInfo),
      verification,
      flags: {
        immediateRisk: tierInfo.flags.immediateRisk,
        timeSensitive: tierInfo.flags.timeSensitive,
        carryover: tierInfo.flags.carryover,
        highRiskMedicationRelated: tierInfo.flags.highRiskMedication,
        reportNeeded: tierInfo.flags.needsReport
      }
    };
  }

  function enrichChangeEvent(item) {
    const tierInfo = classifyPriorityTier(item);
    return {
      ...item,
      category: item.type,
      detectedFact: item.summary,
      handoffRelevance: buildActionRelevance(item, tierInfo),
      actionRelevance: buildActionRelevance(item, tierInfo),
      evidence: safeEvidenceList(item),
      priorityTier: tierInfo.tier,
      priorityTierLabel: tierInfo.label
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

  function enrichSbarItems(items, prioritizedItems, fallbackTier) {
    return (items || []).map((item, index) => {
      const matched = matchPrioritizedItem(prioritizedItems, item);
      if (matched) return matched;
      const tierInfo = classifyPriorityTier({
        ...item,
        type: item.type || "background"
      });
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

  function buildCanonicalSbarPayload(patient, legacyAnalysis, prioritizedItems, current, previous) {
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
      situation: enrichSbarItems(basePayload.situation || [], prioritizedItems, 1),
      background: enrichSbarItems(basePayload.background || [], prioritizedItems, 3),
      assessment: enrichSbarItems(basePayload.assessment || [], prioritizedItems, 2),
      recommendation: enrichSbarItems(basePayload.recommendation || [], prioritizedItems, 1)
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

    const longitudinalSummary = legacyAnalysis?.longitudinalSummary?.sections
      ? canonicalizeLongitudinalSummary(legacyAnalysis.longitudinalSummary, patient)
      : canonicalBuildLongitudinalPatientSummary(patient, normalizedDailyTimeline, policy);

    const rawChangeEvents = Array.isArray(legacyAnalysis?.changeEvents)
      ? legacyAnalysis.changeEvents
      : (legacy.detectHandoffChanges && current
        ? legacy.detectHandoffChanges(previous, current, normalizedDailyTimeline[0] || null)
        : []);

    const scoredItems = Array.isArray(legacyAnalysis?.prioritizedHandoffItems)
      ? legacyAnalysis.prioritizedHandoffItems
      : (legacy.scoreHandoffEvents
        ? legacy.scoreHandoffEvents(rawChangeEvents, { current, previous })
        : rawChangeEvents);

    const prioritizedHandoffItems = sortPrioritizedItems(
      normalizeItemsForOutput(scoredItems.map((item, index) => enrichPrioritizedItem(item, index)))
    );

    const changeEvents = rawChangeEvents.map((item) => enrichChangeEvent(item));
    const verificationResult = buildVerificationResult(prioritizedHandoffItems);
    const actionNeededItems = prioritizedHandoffItems.filter((item) => item.priorityTier <= 2);
    const carryoverItems = prioritizedHandoffItems.filter((item) => item.flags?.carryover);
    const groupedLowerPrioritySummary = groupLowerPrioritySummary(prioritizedHandoffItems);
    const sbarPayload = buildCanonicalSbarPayload(patient, legacyAnalysis, prioritizedHandoffItems, current, previous);

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
      groupedLowerPrioritySummary,
      explanationIndex: buildExplanationIndex(longitudinalSummary, prioritizedHandoffItems),
      verificationResult,
      sbarPayload,
      runtimePolicy: {
        sourceAgnostic: true,
        verificationRequiredForTopTier: true
      }
    };

    analysisCache.set(cacheKey, result);
    return result;
  }

  function rankHandoffItems(events, context) {
    const scoredItems = legacy.scoreHandoffEvents
      ? legacy.scoreHandoffEvents(events || [], context || {})
      : (events || []);

    return sortPrioritizedItems(
      normalizeItemsForOutput(scoredItems.map((item, index) => enrichPrioritizedItem(item, index)))
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

  function renderExplainabilityPanel(analysis) {
    const items = analysis?.prioritizedHandoffItems || [];
    const tier0 = items.filter((item) => item.priorityTier === 0).slice(0, 3);
    const tier1 = items.filter((item) => item.priorityTier === 1).slice(0, 4);
    const tier2 = items.filter((item) => item.priorityTier === 2).slice(0, 4);
    const background = items.filter((item) => item.priorityTier === 3).slice(0, 4);
    const verification = analysis?.verificationResult || {};

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

    return `${baseHtml}${renderExplainabilityPanel(analysis)}`;
  }

  function getHandoffEngineMetadata() {
    return {
      ...ENGINE_METADATA,
      bands: LONGITUDINAL_BAND_LABELS,
      priorityTiers: PRIORITY_TIER_LABELS
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
