// Stage 2 longitudinal summary overrides

function toNormalizedTextList(items) {
  const sourceItems = Array.isArray(items) ? items : [items];
  return unique(
    sourceItems
      .flatMap((item) => typeof item === 'string' ? item.split(/\n+/) : [item])
      .map((item) => normalizeClinicalPlaceholderText(item))
      .filter((item) => item && item !== '-')
  );
}

function normalizeMedicalTerm(text) {
  return normalizeNarrativeText(text)
    .replace(/\bCerebral Infraction\b/gi, 'Cerebral Infarction')
    .replace(/\bAcute Infraction\b/gi, 'Acute Infarction')
    .replace(/\bInfraction\b/gi, 'Infarction');
}

function splitClinicalSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\s*\/\s*|[\n;]+/)
    .map((item) => normalizeMedicalTerm(item))
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractSentenceSnippet(text, patterns, maxLength = 120) {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  const sentences = splitClinicalSentences(text);
  const matched = sentences.find((sentence) => patternList.some((pattern) => pattern.test(sentence)));
  return matched ? truncateText(matched, maxLength) : '';
}

function extractCoreNursingProblem(text, fallbackDiagnoses) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => normalizeNarrativeText(line))
    .map((line) => normalizeClinicalPlaceholderText(line))
    .filter((line) => line && line !== '-');

  const focusLines = lines
    .filter((line) => !/요청사항|서비스 요청|검사 요청|\bct\b|\bmri\b|x-ray|ultrasound|therapy|counsel|education|teaching/i.test(line))
    .map((line) => line
      .replace(/^[-#\s]*/, '')
      .replace(/^\d+\.\s*/, '')
      .replace(/^(주요 문제|간호 초점|간호계획)\s*:\s*/i, '')
      .trim())
    .filter(Boolean);

  if (focusLines.length) {
    return unique(focusLines).slice(0, 2).join(' / ');
  }

  const diagnoses = normalizeDiagnosisItems(fallbackDiagnoses);
  if (diagnoses.length) {
    return diagnoses.slice(0, 2).join(', ');
  }

  return '-';
}

function estimateRiskKeywordScore(text) {
  const source = String(text || '').toLowerCase();
  let score = 0;
  if (/(산소|spo2|resp|호흡|vent|기도|rr)/i.test(source)) score += 3;
  if (/(혈압|bp|심박|hr|shock|출혈|bleed|arrhythm|부정맥)/i.test(source)) score += 2;
  if (/(감염|격리|sepsis|fever|crp|wbc)/i.test(source)) score += 2;
  if (/(fall|낙상|어지럼|편측|위약감|마비)/i.test(source)) score += 2;
  if (/(insulin|heparin|warfarin|kcl|potassium|morphine|fentanyl|vasopress|norepinephrine|epinephrine|chemo)/i.test(source)) score += 2;
  return clampScore(score, 0, 6);
}

function buildSnapshotContextBundle(current, timeline) {
  const specials = unique((timeline || []).flatMap((snapshot) => snapshot.specials || []).map((item) => normalizeMedicalTerm(item)));
  const consults = unique((timeline || []).flatMap((snapshot) => snapshot.consults || []).map((item) => normalizeMedicalTerm(item)));
  const hourlyNotes = unique(
    (current.hourly || [])
      .flatMap((entry) => entry.notes || [])
      .map((note) => normalizeNarrativeText(String(note).replace(/\s*\([^)]+RN\)$/, '')))
  );
  const combinedText = [
    current.patientContext?.admissionReason,
    current.patientContext?.diagnosis,
    current.nursingProblem,
    current.patientContext?.diet,
    ...specials,
    ...consults,
    ...hourlyNotes,
    ...(current.clinicalStatus?.caution || []),
    current.vitals?.summaryText,
    current.labs?.summaryText
  ].filter(Boolean).join('. ');

  return {
    admissionText: current.patientContext?.admissionReason || '',
    specials,
    consults,
    hourlyNotes,
    combinedText
  };
}

function buildDiagnosisClinicalBasis(diagnosisList, current, timeline) {
  const diagnosisText = normalizeMedicalTerm((diagnosisList || []).join(', '));
  const context = buildSnapshotContextBundle(current, timeline);
  const basis = [];

  if (/cerebral infarction|stroke|infarction|뇌경색/i.test(diagnosisText)) {
    const imagingSnippet = extractSentenceSnippet(
      `${context.admissionText}. ${context.specials.join('. ')}`,
      [/brain mri|brain ct|\bmri\b|\bct\b|mca|infarction|ischemic|diffusion|영상|판독/i]
    );
    const neuroSnippet = extractSentenceSnippet(
      `${context.admissionText}. ${context.hourlyNotes.join('. ')}`,
      [/weakness|hemiparesis|aphasia|dysarthria|facial|altered mental|motor|편측|위약감|구음장애|실어증|의식저하|마비/i]
    );
    const acuteTherapySnippet = extractSentenceSnippet(
      context.combinedText,
      [/tpa|thrombectomy|혈전용해|혈전제거/i]
    );

    if (imagingSnippet) basis.push(`영상/판독 근거: ${imagingSnippet}`);
    if (neuroSnippet) basis.push(`신경학적 근거: ${neuroSnippet}`);
    if (acuteTherapySnippet) basis.push(`급성기 처치 기록: ${acuteTherapySnippet}`);
  } else if (/sepsis|shock|패혈|쇼크/i.test(diagnosisText)) {
    const hemodynamicSnippet = extractSentenceSnippet(
      context.admissionText,
      [/hypotension|bp|hr|tachy|fever|chills|오한|발열|저혈압|빈맥/i]
    );
    if (hemodynamicSnippet) basis.push(`입원 당시 상태: ${hemodynamicSnippet}`);
    if ((current.labs?.abnormal || []).length) {
      basis.push(`현재 추적 검사: ${(current.labs.abnormal || []).slice(0, 3).map((item) => `${item.key} ${formatLabValue(String(item.value))}`).join(', ')}`);
    }
    if ((current.clinicalStatus?.activeDevices || []).length) {
      basis.push(`침습적 관리: ${current.clinicalStatus.activeDevices.slice(0, 3).join(', ')}`);
    }
  } else if (/pneumonia|bronchitis|respiratory|호흡|폐렴|기관지염/i.test(diagnosisText)) {
    const respiratorySnippet = extractSentenceSnippet(
      `${context.admissionText}. ${context.hourlyNotes.join('. ')}`,
      [/spo2|oxygen|resp|shortness of breath|dyspnea|cough|wheeze|호흡곤란|기침|가래/i]
    );
    if (respiratorySnippet) basis.push(`호흡기 증상: ${respiratorySnippet}`);
    if ((current.clinicalStatus?.vent || []).length) {
      basis.push(`현재 호흡 보조: ${(current.clinicalStatus.vent || []).join(', ')}`);
    }
  } else if (/cancer|malignan|암/i.test(diagnosisText)) {
    const cancerSnippet = extractSentenceSnippet(
      `${context.admissionText}. ${context.specials.join('. ')}`,
      [/chemo|cancer|mass|metast|lesion|암|항암|전이/i]
    );
    if (cancerSnippet) basis.push(`질환 배경: ${cancerSnippet}`);
    const highRiskOrder = unique([
      ...(current.orders?.medications?.inj || []),
      ...(current.orders?.medications?.po || [])
    ]).find((item) => /cisplatin|doxorubicin|cyclophosphamide|chemo/i.test(item));
    if (highRiskOrder) basis.push(`현재 고위험 약물 맥락: ${highRiskOrder}`);
  }

  if (!basis.length && context.admissionText && context.admissionText !== '-') {
    basis.push(`입원 기록: ${truncateText(context.admissionText, 120)}`);
  }

  if (context.specials.length) {
    basis.push(`관련 검사/판독: ${context.specials.slice(0, 2).join(', ')}`);
  }

  return unique(basis).slice(0, 4);
}

function buildAdmissionClinicalBasis(current) {
  const basis = [];
  if (current.patientContext?.admissionReason && current.patientContext.admissionReason !== '-') {
    basis.push(`입원 기록: ${truncateText(normalizeMedicalTerm(current.patientContext.admissionReason), 120)}`);
  }
  if (current.patientContext?.diet && current.patientContext.diet !== '-') {
    basis.push(`현재 식이/섭취 방법: ${current.patientContext.diet}`);
  }
  return unique(basis).slice(0, 3);
}

function buildHistoryClinicalBasis(historyItems) {
  if (!historyItems.length) return [];
  return [`중요 과거력: ${historyItems.join(', ')}`];
}

function normalizeNursingDiagnosisLabel(text) {
  return normalizeMedicalTerm(text)
    .replace(/^#\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^NANDA\s*[:：]?\s*/i, '')
    .trim();
}

function getNandaDiagnosisDefinition(label) {
  const source = normalizeNursingDiagnosisLabel(label);
  if (!source || source === '-') return null;

  const definitions = [
    { pattern: /자가간호결핍/i, label: '자가간호결핍', implication: '식사, 위생, 이동, 배설 등 일상생활 지원 범위를 다음 근무조가 이어서 확인해야 합니다.' },
    { pattern: /낙상위험성/i, label: '낙상위험성', implication: '이동 보조, 침상 안전, 낙상 예방 수행이 다음 근무조에서도 계속 유지되어야 합니다.' },
    { pattern: /감염위험성/i, label: '감염위험성', implication: '발열, 염증 수치, 침습적 라인 관련 감염 징후를 계속 추적해야 합니다.' },
    { pattern: /급성통증/i, label: '급성통증', implication: '통증 정도와 중재 반응을 재평가하고 필요 시 처방된 중재를 이어서 수행해야 합니다.' },
    { pattern: /가스교환장애|비효율적 호흡양상/i, label: '가스교환/호흡 문제', implication: '산소화와 호흡 상태를 지속 관찰하고 악화 시 즉시 보고가 필요합니다.' },
    { pattern: /쇼크위험성|조직관류 저하|뇌조직관류장애위험성/i, label: source, implication: '혈압, 맥박, 의식상태, 말초관류 등 순환 상태 악화 여부를 다음 근무조가 이어서 봐야 합니다.' },
    { pattern: /체액부족위험성/i, label: '체액부족위험성', implication: '섭취/배설, 혈압, 맥박, 점막 상태 등 탈수 징후를 지속 확인해야 합니다.' },
    { pattern: /영양불균형/i, label: '영양불균형', implication: '섭취량, 식이 방법, 영양 보충 계획을 다음 근무조가 이어받아 확인해야 합니다.' },
    { pattern: /기도흡인위험성/i, label: '기도흡인위험성', implication: '식이 방식, 기도 보호 상태, 흡인 징후를 지속 관찰해야 합니다.' }
  ];

  return definitions.find((item) => item.pattern.test(source)) || null;
}

function buildVitalJudgementBasis(snapshot, flags) {
  const vital = snapshot.vitals?.latest || {};
  const basis = [];
  if (snapshot.date) {
    basis.push(`${snapshot.date} 관찰값: BP ${vital.bp || '-'}, HR ${vital.hr ?? '-'}, BT ${vital.bt ?? '-'}, RR ${vital.rr ?? '-'}, SpO2 ${vital.spo2 ?? '-'}%`);
  }

  (flags || []).forEach((flag) => {
    if (flag === 'bp') basis.push(`혈압 근거: 수축기 ${vital.systolic ?? '-'} / 이완기 ${vital.diastolic ?? '-'}mmHg`);
    if (flag === 'hr') basis.push(`심박수 근거: HR ${vital.hr ?? '-'}회/분`);
    if (flag === 'bt') basis.push(`체온 근거: BT ${vital.bt ?? '-'}℃`);
    if (flag === 'rr') basis.push(`호흡수 근거: RR ${vital.rr ?? '-'}회/분`);
    if (flag === 'spo2') basis.push(`산소포화도 근거: SpO2 ${vital.spo2 ?? '-'}%`);
  });

  return unique(basis).slice(0, 4);
}

function buildLabJudgementBasis(snapshot, labItems) {
  const targetItems = (labItems || []).filter(Boolean);
  const basis = [];
  if (!targetItems.length) return basis;

  basis.push(`${snapshot.date} 검사값: ${targetItems.map((item) => `${item.key} ${formatLabValue(String(item.value))}`).join(', ')}`);
  targetItems.forEach((item) => {
    const status = item.status || getLabStatus(item.key, String(item.value)).status;
    if (status === 'high') basis.push(`${item.key} ${formatLabValue(String(item.value))}로 참고범위보다 높습니다.`);
    if (status === 'low') basis.push(`${item.key} ${formatLabValue(String(item.value))}로 참고범위보다 낮습니다.`);
  });

  return unique(basis).slice(0, 4);
}

function buildNursingProblemClinicalBasis(label, current, timeline) {
  const normalizedLabel = normalizeNursingDiagnosisLabel(label);
  const context = buildSnapshotContextBundle(current, timeline);
  const basis = [];

  if (/자가간호결핍/i.test(normalizedLabel)) {
    if (current.clinicalStatus?.activity && current.clinicalStatus.activity !== '-') {
      basis.push(`활동 제한/도움 필요: ${current.clinicalStatus.activity}`);
    }
    const dependencySnippet = extractSentenceSnippet(
      context.combinedText,
      [/weakness|hemiparesis|dysarthria|stroke|infarction|편측|위약감|구음장애|마비/i]
    );
    if (dependencySnippet) basis.push(`기능 저하 근거: ${dependencySnippet}`);
    const supportItems = unique([
      ...(current.clinicalStatus?.tubes || []),
      ...(current.clinicalStatus?.lines || []),
      current.patientContext?.diet
    ]).filter((item) => item && item !== '-');
    if (supportItems.length) basis.push(`보조 장치/식이: ${supportItems.slice(0, 3).join(', ')}`);
  } else if (/낙상위험성/i.test(normalizedLabel)) {
    const cautionText = (current.clinicalStatus?.caution || []).join(', ');
    if (cautionText) basis.push(`주의 표기: ${cautionText}`);
    if (current.clinicalStatus?.activity && current.clinicalStatus.activity !== '-') {
      basis.push(`이동/활동 수준: ${current.clinicalStatus.activity}`);
    }
    const fallSnippet = extractSentenceSnippet(
      context.combinedText,
      [/fall|dizzy|weakness|hemiparesis|편측|위약감|어지럼|보행/i]
    );
    if (fallSnippet) basis.push(`낙상 관련 근거: ${fallSnippet}`);
  } else if (/감염위험성/i.test(normalizedLabel)) {
    basis.push(...buildVitalJudgementBasis(current, ['bt']));
    basis.push(...buildLabJudgementBasis(current, (current.labs?.abnormal || []).filter((item) => /WBC|CRP/i.test(item.key)).slice(0, 2)));
    if ((current.clinicalStatus?.activeDevices || []).length) {
      basis.push(`침습적 장치: ${current.clinicalStatus.activeDevices.slice(0, 3).join(', ')}`);
    }
  } else if (/급성통증/i.test(normalizedLabel)) {
    const painSnippet = extractSentenceSnippet(
      `${context.admissionText}. ${context.hourlyNotes.join('. ')}`,
      [/pain|nrs|통증/i]
    );
    if (painSnippet) basis.push(`통증 관찰 기록: ${painSnippet}`);
    const procedureItems = unique([...(current.specials || []), ...(current.clinicalStatus?.drains || [])]).slice(0, 2);
    if (procedureItems.length) basis.push(`통증 관련 처치/배액: ${procedureItems.join(', ')}`);
  } else if (/가스교환장애|비효율적 호흡양상/i.test(normalizedLabel)) {
    basis.push(...buildVitalJudgementBasis(current, ['rr', 'spo2']));
    if ((current.clinicalStatus?.vent || []).length) basis.push(`현재 호흡 보조: ${(current.clinicalStatus.vent || []).join(', ')}`);
  } else if (/쇼크위험성|조직관류 저하|뇌조직관류장애위험성/i.test(normalizedLabel)) {
    basis.push(...buildVitalJudgementBasis(current, ['bp', 'hr']));
    const perfusionSnippet = extractSentenceSnippet(
      context.combinedText,
      [/shock|hypotension|sepsis|stroke|infarction|저혈압|패혈|뇌경색/i]
    );
    if (perfusionSnippet) basis.push(`순환/관류 근거: ${perfusionSnippet}`);
  } else if (/영양불균형/i.test(normalizedLabel)) {
    if (current.patientContext?.diet && current.patientContext.diet !== '-') {
      basis.push(`식이/영양 관리: ${current.patientContext.diet}`);
    }
    const nutritionSnippet = extractSentenceSnippet(
      context.combinedText,
      [/weight loss|cachexia|poor intake|feeding|체중감소|식이|섭취저하/i]
    );
    if (nutritionSnippet) basis.push(`영양 관련 근거: ${nutritionSnippet}`);
  } else if (/기도흡인위험성/i.test(normalizedLabel)) {
    const aspirationSnippet = extractSentenceSnippet(
      context.combinedText,
      [/dysphagia|aspiration|tube feeding|경관|연하|흡인/i]
    );
    if (aspirationSnippet) basis.push(`흡인 관련 근거: ${aspirationSnippet}`);
    if (current.patientContext?.diet && current.patientContext.diet !== '-') {
      basis.push(`현재 식이 방식: ${current.patientContext.diet}`);
    }
  }

  if (!basis.length) {
    if (current.patientContext?.admissionReason && current.patientContext.admissionReason !== '-') {
      basis.push(`입원 기록: ${truncateText(normalizeMedicalTerm(current.patientContext.admissionReason), 120)}`);
    }
    if ((current.labs?.abnormal || []).length) {
      basis.push(`현재 관련 검사: ${(current.labs.abnormal || []).slice(0, 2).map((item) => `${item.key} ${formatLabValue(String(item.value))}`).join(', ')}`);
    }
  }

  return unique(basis).slice(0, 4);
}

function classifyCarryoverItem(item) {
  const source = normalizeNarrativeText(item).toLowerCase();
  if (/(보고|알림|notify|report)/i.test(source)) {
    return { prefix: '즉시 보고/재확인', detail: '보고 여부 또는 전달 여부를 다음 근무조가 바로 확인해야 하는 항목입니다.' };
  }
  if (/(준비|동의|이송|금식|npo|검사|시행 여부|결과 확인)/i.test(source)) {
    return { prefix: '다음 근무조 예정', detail: '다음 근무조 시간대에 이어서 준비하거나 결과를 확인해야 하는 항목입니다.' };
  }
  if (/(확인|재평가|monitor|관찰|check|recheck|assess|모니터)/i.test(source)) {
    return { prefix: '미수행/재확인', detail: '현재 근무 종료 시점까지 완료 확인이 부족해 다음 근무조가 이어서 봐야 하는 항목입니다.' };
  }
  return { prefix: '지속 인계 책임', detail: '다음 근무조가 이어받아야 할 일반 인계 책임 항목입니다.' };
}

function buildCarryoverJudgementBasis(item, current, sourceDates) {
  const basis = [];
  basis.push(`현재 미완료/재확인 목록: ${item}`);
  if ((sourceDates || []).length > 1) {
    basis.push(`이전 날짜부터 이어짐: ${(sourceDates || []).join(', ')}`);
  } else if ((sourceDates || []).length === 1) {
    basis.push(`관찰 날짜: ${sourceDates[0]}`);
  }

  const relatedContexts = [];
  if (/(line|tube|drain|foley|picc|central line|iv|산소|oxygen)/i.test(item)) {
    relatedContexts.push(...unique([
      ...(current.clinicalStatus?.lines || []),
      ...(current.clinicalStatus?.tubes || []),
      ...(current.clinicalStatus?.drains || []),
      ...(current.clinicalStatus?.vent || [])
    ]).slice(0, 3));
  }
  if (/(낙상|fall|활동|이동)/i.test(item) && current.clinicalStatus?.activity && current.clinicalStatus.activity !== '-') {
    relatedContexts.push(`활동 수준: ${current.clinicalStatus.activity}`);
  }
  if (relatedContexts.length) basis.push(`관련 현재 상태: ${relatedContexts.join(', ')}`);

  return unique(basis).slice(0, 4);
}

function createLongitudinalSummaryCandidate(input) {
  const evidence = unique((input.evidence || []).filter(Boolean));
  const clinicalBasis = unique((input.clinicalBasis || []).map((item) => normalizeMedicalTerm(item)).filter(Boolean));
  const linkActions = (input.linkActions || []).filter(Boolean);
  return {
    id: input.id || `${input.category}:${input.summary}`,
    category: input.category,
    summary: normalizeMedicalTerm(input.summary),
    detail: normalizeMedicalTerm(input.detail || ''),
    evidence: evidence.length ? evidence : ['evidence 부족'],
    clinicalBasis,
    linkActions,
    hideEvidence: Boolean(input.hideEvidence),
    showSourceDates: input.showSourceDates !== false,
    sourceDates: unique(input.sourceDates || []),
    scoreInput: {
      categoryBase: input.scoreInput?.categoryBase,
      persistence: input.scoreInput?.persistence || 0,
      actionability: input.scoreInput?.actionability || 0,
      safety: input.scoreInput?.safety || 0,
      nursingDependency: input.scoreInput?.nursingDependency || 0,
      recurrence: input.scoreInput?.recurrence || 0,
      resolvedPenalty: input.scoreInput?.resolvedPenalty || 0
    }
  };
}

function buildPatientIdentitySummaryCandidates(patient, timeline) {
  const current = timeline[timeline.length - 1];
  const candidates = [];
  const diagnosisList = unique(current.clinicalStatus?.diagnoses || [patient.diagnosis].filter(Boolean)).map((item) => normalizeMedicalTerm(item));
  const diagnosisDates = findTimelineDates(timeline, (snapshot) => overlaps(snapshot.clinicalStatus?.diagnoses || [], diagnosisList));

  if (diagnosisList.length) {
    const diagnosisTemporal = deriveTemporalScores(diagnosisDates.length || timeline.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `identity:diagnosis:${diagnosisList.join('|')}`,
      category: 'identity',
      summary: `주진단: ${diagnosisList.slice(0, 3).join(', ')}`,
      detail: '현재 치료와 간호 인계의 기준이 되는 주진단입니다.',
      evidence: diagnosisList.map((item) => `diagnosis:${item}`),
      clinicalBasis: buildDiagnosisClinicalBasis(diagnosisList, current, timeline),
      linkActions: current.specials?.length ? [{ kind: 'special', label: '영상/특수검사 보기' }] : [],
      sourceDates: diagnosisDates.length ? diagnosisDates : timeline.map((snapshot) => snapshot.date),
      scoreInput: {
        persistence: diagnosisTemporal.persistence,
        actionability: 3,
        safety: clampScore(estimateRiskKeywordScore(current.nursingProblem || diagnosisList.join(' ')), 3, 6),
        nursingDependency: 2,
        recurrence: diagnosisTemporal.recurrence
      }
    }));
  }

  const admissionReason = pickFirstNonEmpty(current.patientContext?.admissionReason, patient.admissionNote, patient.admitReason);
  if (admissionReason && admissionReason !== '-') {
    candidates.push(createLongitudinalSummaryCandidate({
      id: `identity:admission:${admissionReason}`,
      category: 'identity',
      summary: `입원 배경: ${truncateText(normalizeMedicalTerm(admissionReason), 72)}`,
      detail: '입원 당시 주호소와 치료 시작 배경입니다.',
      evidence: ['admission_reason'],
      clinicalBasis: buildAdmissionClinicalBasis(current),
      sourceDates: timeline.map((snapshot) => snapshot.date),
      scoreInput: {
        persistence: 2,
        actionability: 1,
        safety: 1,
        nursingDependency: 1,
        recurrence: 1
      }
    }));
  }

  const historyItems = unique(timeline.flatMap((snapshot) => snapshot.patientContext?.pastHistory || [])).slice(0, 4);
  if (historyItems.length) {
    candidates.push(createLongitudinalSummaryCandidate({
      id: `identity:history:${historyItems.join('|')}`,
      category: 'identity',
      summary: `중요 과거력: ${historyItems.join(', ')}`,
      detail: '현재 경과와 간호 주의사항 해석에 필요한 과거력입니다.',
      evidence: historyItems.map((item) => `history:${item}`),
      clinicalBasis: buildHistoryClinicalBasis(historyItems),
      sourceDates: findTimelineDates(timeline, (snapshot) => (snapshot.patientContext?.pastHistory || []).length > 0),
      scoreInput: {
        persistence: 2,
        actionability: 1,
        safety: clampScore(estimateRiskKeywordScore(historyItems.join(' ')), 1, 5),
        nursingDependency: 1,
        recurrence: 1
      }
    }));
  }

  return candidates;
}

function buildCareFrameSummaryCandidates(timeline) {
  const current = timeline[timeline.length - 1];
  const candidates = [];

  if (current.clinicalStatus?.isolation && current.clinicalStatus.isolation !== '-') {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.clinicalStatus?.isolation || '-') !== '-');
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `care:isolation:${current.clinicalStatus.isolation}`,
      category: 'care_frame',
      summary: `격리/주의: ${current.clinicalStatus.isolation}`,
      detail: '현재 격리 또는 감염관리 주의가 유지되고 있습니다.',
      evidence: [`isolation:${current.clinicalStatus.isolation}`],
      hideEvidence: true,
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: 5,
        nursingDependency: 3,
        recurrence: temporal.recurrence
      }
    }));
  }

  if (current.clinicalStatus?.activity && current.clinicalStatus.activity !== '-') {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.clinicalStatus?.activity || '-') !== '-');
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `care:activity:${current.clinicalStatus.activity}`,
      category: 'care_frame',
      summary: `활동 수준: ${current.clinicalStatus.activity}`,
      detail: '현재 이동, 체위, 활동 제한 여부를 인계 시 바로 알아야 합니다.',
      evidence: [`activity:${current.clinicalStatus.activity}`],
      hideEvidence: true,
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: clampScore(estimateRiskKeywordScore(current.clinicalStatus.activity), 2, 6),
        nursingDependency: 3,
        recurrence: temporal.recurrence
      }
    }));
  }

  buildDeviceSummaryCandidate(timeline, 'vent', '호흡 보조/산소', 5, 5, 3).forEach((item) => candidates.push(item));
  buildDeviceSummaryCandidate(timeline, 'lines', '유지 중인 line', 4, 4, 3).forEach((item) => candidates.push(item));
  buildDeviceSummaryCandidate(timeline, 'tubes', '유지 중인 tube', 4, 4, 3).forEach((item) => candidates.push(item));
  buildDeviceSummaryCandidate(timeline, 'drains', '유지 중인 drain', 4, 4, 3).forEach((item) => candidates.push(item));

  if ((current.clinicalStatus?.caution || []).length) {
    const cautionItems = unique(current.clinicalStatus.caution).slice(0, 4);
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.clinicalStatus?.caution || []).length > 0);
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `care:caution:${cautionItems.join('|')}`,
      category: 'care_frame',
      summary: `주의사항: ${cautionItems.join(', ')}`,
      detail: '반복 확인이 필요한 위험 표기 또는 주의사항입니다.',
      evidence: cautionItems.map((item) => `caution:${item}`),
      hideEvidence: true,
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 3,
        safety: clampScore(estimateRiskKeywordScore(cautionItems.join(' ')) + (/(fall|낙상)/i.test(cautionItems.join(' ')) ? 2 : 0), 2, 6),
        nursingDependency: 2,
        recurrence: temporal.recurrence
      }
    }));
  }

  return candidates;
}

function buildPersistentConcernCandidates(timeline) {
  const current = timeline[timeline.length - 1];
  const candidates = [];
  const nursingProblemDates = findTimelineDates(timeline, (snapshot) => snapshot.nursingProblem && snapshot.nursingProblem !== '-');
  const normalizedProblem = normalizeNursingDiagnosisLabel(current.nursingProblem);
  const nandaDefinition = getNandaDiagnosisDefinition(normalizedProblem);

  if (normalizedProblem && normalizedProblem !== '-') {
    const temporal = deriveTemporalScores(nursingProblemDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `persistent:nursing_problem:${normalizedProblem}`,
      category: 'persistent_problem',
      summary: nandaDefinition ? `NANDA 간호진단: ${nandaDefinition.label}` : `지속 핵심 문제: ${normalizeMedicalTerm(normalizedProblem)}`,
      detail: nandaDefinition
        ? nandaDefinition.implication
        : `${nursingProblemDates.length || 1}일 범위에서 반복되거나 계속 추적 중인 문제입니다.`,
      evidence: [`nursing_problem:${normalizedProblem}`],
      clinicalBasis: buildNursingProblemClinicalBasis(normalizedProblem, current, timeline),
      sourceDates: nursingProblemDates.length ? nursingProblemDates : [current.date],
      scoreInput: {
        categoryBase: 12,
        persistence: temporal.persistence,
        actionability: 6,
        safety: clampScore(estimateRiskKeywordScore(normalizedProblem), 3, 6),
        nursingDependency: 4,
        recurrence: temporal.recurrence
      }
    }));
  }

  const vitalFlagCounts = {};
  timeline.forEach((snapshot) => unique(snapshot.vitals?.abnormalFlags || []).forEach((flag) => {
    vitalFlagCounts[flag] = (vitalFlagCounts[flag] || 0) + 1;
  }));
  const currentVitalFlags = current.vitals?.abnormalFlags || [];
  const persistentVitalFlags = unique([
    ...currentVitalFlags,
    ...Object.keys(vitalFlagCounts).filter((flag) => vitalFlagCounts[flag] >= 2)
  ]).filter((flag) => (current.vitals?.abnormalFlags || detectVitalAbnormalFlags(current.vitals?.latest || {})).includes(flag));

  if (persistentVitalFlags.length) {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.vitals?.abnormalFlags || []).some((flag) => persistentVitalFlags.includes(flag)));
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `persistent:vitals:${persistentVitalFlags.join('|')}`,
      category: 'persistent_problem',
      summary: `반복 활력 이상: ${persistentVitalFlags.map(vitalFlagLabel).join(', ')}`,
      detail: `${sourceDates.length}일 범위에서 반복 확인되어 현재도 추적이 필요한 활력징후입니다.`,
      evidence: persistentVitalFlags.map((flag) => `vital:${flag}`),
      clinicalBasis: buildVitalJudgementBasis(current, persistentVitalFlags),
      linkActions: [{ kind: 'vital', label: 'V/S 시트 보기', date: current.date }],
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: 5,
        nursingDependency: 3,
        recurrence: temporal.recurrence
      }
    }));
  }

  const labCounts = {};
  timeline.forEach((snapshot) => (snapshot.labs?.abnormal || []).forEach((item) => {
    labCounts[item.key] = (labCounts[item.key] || 0) + 1;
  }));
  const currentAbnormalKeys = (current.labs?.abnormal || []).map((item) => item.key);
  const persistentLabKeys = unique(
    Object.keys(labCounts).filter((key) => {
      const currentStatus = getLabStatus(key, String(current.labs?.latest?.[key] ?? '-')).status;
      return currentStatus !== 'normal' && (currentAbnormalKeys.includes(key) || labCounts[key] >= 2);
    })
  ).slice(0, 4);

  if (persistentLabKeys.length) {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.labs?.abnormal || []).some((item) => persistentLabKeys.includes(item.key)));
    const temporal = deriveTemporalScores(sourceDates.length);
    const targetLabItems = (current.labs?.abnormal || []).filter((item) => persistentLabKeys.includes(item.key));
    const currentValues = persistentLabKeys.map((key) => `${key} ${formatLabValue(String(current.labs?.latest?.[key] ?? '-'))}`);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `persistent:labs:${persistentLabKeys.join('|')}`,
      category: 'persistent_problem',
      summary: `지속 검사 이상: ${currentValues.join(', ')}`,
      detail: `${sourceDates.length}일 이상 반복되었고 현재도 남아 있는 검사 이상입니다.`,
      evidence: persistentLabKeys.map((key) => `lab:${key}`),
      clinicalBasis: buildLabJudgementBasis(current, targetLabItems),
      linkActions: [{ kind: 'lab', label: 'Lab 보기', labKeys: persistentLabKeys }],
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: estimateLabRiskScore(persistentLabKeys),
        nursingDependency: 2,
        recurrence: temporal.recurrence
      }
    }));
  }

  return candidates;
}

function buildWatchSummaryCandidates(timeline, policy) {
  const current = timeline[timeline.length - 1];
  const candidates = [];
  const currentVitalFlags = current.vitals?.abnormalFlags || [];

  if (currentVitalFlags.length) {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.vitals?.abnormalFlags || []).some((flag) => currentVitalFlags.includes(flag)));
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `watch:current_vitals:${currentVitalFlags.join('|')}`,
      category: 'watch_item',
      summary: `주의 활력징후: ${currentVitalFlags.map(vitalFlagLabel).join(', ')}`,
      detail: '현재 근무조에서 다시 확인하거나 보고 기준을 봐야 할 활력 항목입니다.',
      evidence: currentVitalFlags.map((flag) => `vital:${flag}`),
      clinicalBasis: buildVitalJudgementBasis(current, currentVitalFlags),
      linkActions: [{ kind: 'vital', label: 'V/S 시트 보기', date: current.date }],
      sourceDates: [current.date],
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 5,
        safety: 6,
        nursingDependency: 3,
        recurrence: temporal.recurrence
      }
    }));
  }

  if ((current.labs?.abnormal || []).length) {
    const topLabs = current.labs.abnormal.slice(0, 4);
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.labs?.abnormal || []).some((item) => topLabs.some((lab) => lab.key === item.key)));
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `watch:current_labs:${topLabs.map((item) => item.key).join('|')}`,
      category: 'watch_item',
      summary: `주의 검사: ${topLabs.map((item) => `${item.key} ${formatLabValue(String(item.value))}`).join(', ')}`,
      detail: '현재 날짜에 비정상 범위로 확인되어 재확인 또는 추적이 필요한 검사입니다.',
      evidence: topLabs.map((item) => `lab:${item.key}`),
      clinicalBasis: buildLabJudgementBasis(current, topLabs),
      linkActions: [{ kind: 'lab', label: 'Lab 보기', labKeys: topLabs.map((item) => item.key) }],
      sourceDates: [current.date],
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: estimateLabRiskScore(topLabs.map((item) => item.key)),
        nursingDependency: 2,
        recurrence: temporal.recurrence
      }
    }));
  }

  const highRiskOrders = unique([
    ...(current.orders?.active || []),
    ...(current.orders?.medications?.inj || []),
    ...(current.orders?.medications?.po || []),
    ...(current.orders?.medications?.running || [])
  ]).filter((item) => isHighRiskMedication(item, policy)).slice(0, 4);

  if (highRiskOrders.length) {
    const sourceDates = findTimelineDates(timeline, (snapshot) => unique([
      ...(snapshot.orders?.active || []),
      ...(snapshot.orders?.medications?.inj || []),
      ...(snapshot.orders?.medications?.po || []),
      ...(snapshot.orders?.medications?.running || [])
    ]).some((item) => highRiskOrders.includes(item)));
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `watch:high_risk_order:${highRiskOrders.join('|')}`,
      category: 'watch_item',
      summary: `고위험 약물/처치: ${highRiskOrders.join(', ')}`,
      detail: '다음 근무조가 투약 또는 처치 위험도를 염두에 두고 인계받아야 하는 항목입니다.',
      evidence: highRiskOrders.map((item) => `order:${item}`),
      clinicalBasis: [
        `현재 활성 오더: ${highRiskOrders.join(', ')}`,
        '고위험 약물/처치는 투약 전 확인과 이상 반응 관찰이 중요합니다.'
      ],
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: 4,
        nursingDependency: 3,
        recurrence: temporal.recurrence
      }
    }));
  }

  return candidates;
}

function buildCarryoverSummaryCandidates(timeline) {
  const current = timeline[timeline.length - 1];
  const pendingItems = current.carryover?.items || current.nursingActions?.pending || [];
  return pendingItems.slice(0, 6).map((item) => {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.nursingActions?.pending || []).includes(item));
    const temporal = deriveTemporalScores(sourceDates.length);
    const classification = classifyCarryoverItem(item);
    const linkActions = [];
    if (/(v\/s|활력|혈압|심박|호흡|spo2|산소포화도)/i.test(item)) {
      linkActions.push({ kind: 'vital', label: 'V/S 시트 보기', date: current.date });
    }
    if (/\blab\b|검사|혈액|wbc|crp|hb|na|k|bun|cr/i.test(item)) {
      linkActions.push({ kind: 'lab', label: 'Lab 보기', labKeys: (current.labs?.abnormal || []).map((lab) => lab.key).slice(0, 4) });
    }
    return createLongitudinalSummaryCandidate({
      id: `carryover:${item}`,
      category: 'carryover',
      summary: `${classification.prefix}: ${normalizeMedicalTerm(item)}`,
      detail: classification.detail,
      evidence: [`pending:${item}`],
      clinicalBasis: buildCarryoverJudgementBasis(item, current, sourceDates.length ? sourceDates : [current.date]),
      linkActions,
      sourceDates: sourceDates.length ? sourceDates : [current.date],
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 6,
        safety: clampScore(estimateRiskKeywordScore(item), 1, 6),
        nursingDependency: 4,
        recurrence: temporal.recurrence
      }
    });
  });
}

function buildDeviceSummaryCandidate(timeline, key, label, actionability, safety, nursingDependency) {
  const current = timeline[timeline.length - 1];
  const currentItems = (current.clinicalStatus?.[key] || []).filter((item) => isMeaningfulDeviceItem(key, item));
  if (!currentItems.length) return [];
  const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.clinicalStatus?.[key] || []).some((item) => isMeaningfulDeviceItem(key, item)));
  const temporal = deriveTemporalScores(sourceDates.length);
  const itemCount = currentItems.length;
  return [
    createLongitudinalSummaryCandidate({
      id: `care:${key}:${currentItems.join('|')}`,
      category: 'care_frame',
      summary: `${label}: ${currentItems.slice(0, 4).join(', ')}`,
      detail: `현재 ${label} 관리가 유지 중입니다.`,
      evidence: currentItems.map((item) => `${label}:${item}`),
      hideEvidence: true,
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: clampScore(actionability + itemCount - 1, 0, 6),
        safety: clampScore(safety + (itemCount >= 2 ? 1 : 0), 0, 6),
        nursingDependency: clampScore(nursingDependency + (itemCount >= 2 ? 1 : 0), 0, 4),
        recurrence: temporal.recurrence
      }
    })
  ];
}

function buildLongitudinalSummaryNarrative(patient, sections) {
  const lines = [];
  if (sections.identity[0]?.summary) lines.push(sections.identity[0].summary);
  if (sections.careFrame.length) lines.push(`현재 관리: ${sections.careFrame.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.persistentConcerns.length) lines.push(`지속 문제: ${sections.persistentConcerns.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.watchItems.length) lines.push(`집중 관찰: ${sections.watchItems.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.carryoverItems.length) lines.push(`인계 책임: ${sections.carryoverItems.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  return lines.length ? lines.join(' | ') : `${patient.name || '환자'} 요약 정보가 부족합니다.`;
}

window.openHtmlNoteModal = function (title, html) {
  const titleEl = document.getElementById('noteModalTitle');
  const bodyEl = document.getElementById('noteModalBody');
  const modalEl = document.getElementById('noteModal');
  const overlayEl = document.getElementById('modalOverlay');
  if (!titleEl || !bodyEl || !modalEl || !overlayEl) return;
  titleEl.innerText = title;
  bodyEl.innerHTML = html;
  modalEl.classList.add('active');
  overlayEl.classList.add('active');
};

window.openVitalSheetModal = async function (pid, date) {
  const patient = await getPatientData(pid);
  if (!patient || !patient.dailyData) return;
  const allDates = Object.keys(patient.dailyData).sort();
  const targetDate = date && patient.dailyData[date] ? date : allDates[allDates.length - 1];
  const dayData = patient.dailyData[targetDate];
  const hourly = Array.isArray(dayData?.hourly) ? dayData.hourly : [];
  const rows = hourly.map((entry) => `
    <tr>
      <td style="border:1px solid #d6dde6; padding:6px; font-weight:bold;">${escapeHtml(entry.time || '-')}</td>
      <td style="border:1px solid #d6dde6; padding:6px;">${escapeHtml(entry.vital?.bp || '-')}</td>
      <td style="border:1px solid #d6dde6; padding:6px;">${escapeHtml(String(entry.vital?.hr ?? '-'))}</td>
      <td style="border:1px solid #d6dde6; padding:6px;">${escapeHtml(String(entry.vital?.bt ?? '-'))}</td>
      <td style="border:1px solid #d6dde6; padding:6px;">${escapeHtml(String(entry.vital?.rr ?? '-'))}</td>
      <td style="border:1px solid #d6dde6; padding:6px;">${escapeHtml(String(entry.vital?.spo2 ?? '-'))}%</td>
      <td style="border:1px solid #d6dde6; padding:6px;">${escapeHtml((entry.notes || []).join(' / ') || '-')}</td>
    </tr>
  `).join('');

  const html = `
    <div style="margin-bottom:10px; color:#455a64; font-size:12px;">${escapeHtml(targetDate)} 기준 활력징후 시트입니다.</div>
    <div class="modal-table-container" style="overflow-x:auto;">
      <table class="modal-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>BP</th>
            <th>HR</th>
            <th>BT</th>
            <th>RR</th>
            <th>SpO2</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7">활력징후 데이터 없음</td></tr>'}</tbody>
      </table>
    </div>
  `;
  window.openHtmlNoteModal(`${patient.name} V/S 시트 (${targetDate})`, html);
};

window.openSummaryLabModal = async function (pid, encodedLabKeys) {
  const patient = await getPatientData(pid);
  if (!patient || !patient.dailyData) return;
  let labKeys = [];
  try {
    labKeys = JSON.parse(decodeURIComponent(encodedLabKeys || '%5B%5D'));
  } catch (error) {
    labKeys = [];
  }
  const allDates = Object.keys(patient.dailyData).sort().reverse();
  let matchedCategory = '';

  allDates.some((date) => {
    const categories = Object.entries(patient.dailyData[date]?.labs || {});
    const found = categories.find(([, values]) => labKeys.some((key) => Object.prototype.hasOwnProperty.call(values || {}, key)));
    if (found) {
      matchedCategory = found[0];
      return true;
    }
    return false;
  });

  if (matchedCategory) return openLabModal(pid, matchedCategory);
  return openLabModal(pid, '');
};

window.openSpecialSummaryModal = async function (pid) {
  const patient = await getPatientData(pid);
  if (!patient || !patient.dailyData) return;
  const items = unique(Object.keys(patient.dailyData).sort().flatMap((date) => (patient.dailyData[date]?.specials || []).map((text) => `${date}: ${text}`)));
  const html = items.length
    ? `<ul style="padding-left:18px; line-height:1.8;">${items.map((item) => `<li>${escapeHtml(normalizeMedicalTerm(item))}</li>`).join('')}</ul>`
    : '<div>영상/특수검사 정보가 없습니다.</div>';
  window.openHtmlNoteModal(`${patient.name} 영상/특수검사`, html);
};

function renderLongitudinalSummaryPanel(summary, patient) {
  if (!summary || !summary.sections) {
    return `
      <div class="longitudinal-panel">
        <div class="longitudinal-panel-header">
          <div class="longitudinal-panel-title">2단계 핵심 환자 요약</div>
          <div class="longitudinal-panel-subtitle">종단 데이터가 부족해 요약을 만들지 못했습니다.</div>
        </div>
      </div>
    `;
  }

  const chipItems = [
    `${summary.dateRange?.start || '-'} ~ ${summary.dateRange?.end || '-'}`,
    `후보 ${summary.debug?.candidateCount || 0}개 분석`,
    `현재 기준 ${summary.currentDate || '-'}`
  ];
  const patientId = patient?.id || summary.patientId || '';

  return `
    <div class="longitudinal-panel">
      <div class="longitudinal-panel-header">
        <div class="longitudinal-panel-title">2단계 핵심 환자 요약</div>
        <div class="longitudinal-panel-subtitle">n일치 환자 데이터를 압축해 현재 배경, 지속 문제, 다음 근무조 인계 책임을 먼저 보여줍니다.</div>
      </div>
      <div class="longitudinal-panel-body">
        <div class="longitudinal-chip-row">
          ${chipItems.map((item) => `<span class="longitudinal-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="longitudinal-concise">${escapeHtml(summary.conciseSummary || '요약 정보 없음')}</div>
        <div class="longitudinal-groups">
          ${renderLongitudinalSummaryGroup('환자 정체성', '이 환자가 어떤 환자인지 파악하는 영역', summary.sections.identity, '정체성 요약 정보 없음', patientId)}
          ${renderLongitudinalSummaryGroup('현재 관리 틀', '현재 유지 중인 관리 조건과 주의사항', summary.sections.careFrame, '현재 관리 틀 정보 없음', patientId)}
          ${renderLongitudinalSummaryGroup('지속 핵심 문제', '기간 전체에서 남아 있는 핵심 문제', summary.sections.persistentConcerns, '지속 핵심 문제 없음', patientId)}
          ${renderLongitudinalSummaryGroup('집중 관찰', '이번 근무조가 더 주의해서 볼 항목', summary.sections.watchItems, '집중 관찰 항목 없음', patientId)}
          ${renderLongitudinalSummaryGroup('지속 인계 책임', '다음 근무조가 이어받아야 할 책임', summary.sections.carryoverItems, '지속 인계 책임 없음', patientId)}
        </div>
      </div>
    </div>
  `;
}

function renderLongitudinalSummaryGroup(title, description, items, emptyText, patientId) {
  const body = items && items.length
    ? items.map((item) => renderLongitudinalSummaryItem(item, patientId)).join('')
    : `<div class="longitudinal-empty">${escapeHtml(emptyText)}</div>`;

  return `
    <section class="longitudinal-group">
      <div class="longitudinal-group-header">
        <div class="longitudinal-group-title">${escapeHtml(title)}</div>
        <div class="longitudinal-group-description">${escapeHtml(description)}</div>
      </div>
      <div class="longitudinal-group-body">${body}</div>
    </section>
  `;
}

function renderLongitudinalLinkActions(item, patientId) {
  const actions = (item.linkActions || []).filter(Boolean);
  if (!actions.length || !patientId) return '';

  const buttons = actions.map((action) => {
    if (action.kind === 'vital') {
      return `<button type="button" class="longitudinal-link-btn" onclick="openVitalSheetModal('${patientId}', '${action.date || ''}')">${escapeHtml(action.label || 'V/S 시트 보기')}</button>`;
    }
    if (action.kind === 'lab') {
      const encodedKeys = encodeURIComponent(JSON.stringify(action.labKeys || []));
      return `<button type="button" class="longitudinal-link-btn" onclick="openSummaryLabModal('${patientId}', '${encodedKeys}')">${escapeHtml(action.label || 'Lab 보기')}</button>`;
    }
    if (action.kind === 'special') {
      return `<button type="button" class="longitudinal-link-btn" onclick="openSpecialSummaryModal('${patientId}')">${escapeHtml(action.label || '영상/특수검사 보기')}</button>`;
    }
    return '';
  }).filter(Boolean);

  return buttons.length ? `<div class="longitudinal-item-actions">${buttons.join('')}</div>` : '';
}

function renderLongitudinalSummaryItem(item, patientId) {
  const sourceDates = (item.sourceDates || []).join(', ');
  const basis = (item.clinicalBasis || []).slice(0, 4);
  const detailSections = [];

  if (!item.hideEvidence && basis.length) {
    detailSections.push(`
      <div class="longitudinal-item-meta">
        <b>임상 판단 근거</b>
        <ul class="longitudinal-evidence-list">
          ${basis.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
        </ul>
      </div>
    `);
  }

  if (!item.hideEvidence && item.showSourceDates !== false && sourceDates) {
    detailSections.push(`<div class="longitudinal-item-meta"><b>관찰 날짜:</b> ${escapeHtml(sourceDates)}</div>`);
  }

  const linkActionsHtml = renderLongitudinalLinkActions(item, patientId);
  if (!item.hideEvidence && linkActionsHtml) {
    detailSections.push(`<div class="longitudinal-item-meta"><b>관련 보기</b>${linkActionsHtml}</div>`);
  }

  const detailsHtml = detailSections.length
    ? `<details class="longitudinal-item-details"><summary>판단 근거 보기</summary>${detailSections.join('')}</details>`
    : '';

  return `
    <article class="longitudinal-item">
      <div class="longitudinal-item-top">
        <div class="longitudinal-item-summary">${escapeHtml(item.summary || '-')}</div>
        <span class="longitudinal-band ${longitudinalBandClass(item.importanceBand)}">${escapeHtml(longitudinalBandLabel(item.importanceBand))}</span>
      </div>
      ${item.detail ? `<div class="longitudinal-item-detail">${escapeHtml(item.detail)}</div>` : ''}
      ${item.hideEvidence && linkActionsHtml ? `<div class="longitudinal-item-inline-actions">${linkActionsHtml}</div>` : ''}
      ${detailsHtml}
    </article>
  `;
}

function longitudinalBandClass(band) {
  const map = { core: 'core', focus: 'focus', supporting: 'supporting', background: 'background' };
  return map[band] || 'background';
}

function longitudinalBandLabel(band) {
  const map = { core: '핵심', focus: '집중', supporting: '보조', background: '배경' };
  return map[band] || '배경';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateNarrativeSBAR(p, startData, endData, dates) {
  const analysis = buildHandoffAnalysis(p, dates);
  const historyList = (endData.pastHistory || []).join(', ');
  const historyHTML = historyList
    ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>중요 과거력</b> ${escapeHtml(historyList)}</div>`
    : '';
  const longitudinalSummaryHTML = renderLongitudinalSummaryPanel(analysis.longitudinalSummary, p);
  const situationItems = analysis.sbarPayload.situation.length
    ? renderHandoffBulletList(analysis.sbarPayload.situation)
    : `<div style="color:#666;">중대한 상태변화는 확인되지 않았습니다.</div>`;
  const backgroundCards = analysis.sbarPayload.background.length
    ? analysis.sbarPayload.background.map((item) => renderBackgroundCard(item)).join('')
    : `<div style="padding:5px; color:#666;">선택 기간 동안 핵심 배경 변화가 확인되지 않았습니다.</div>`;
  const assessmentItems = analysis.sbarPayload.assessment.length
    ? renderAssessmentList(analysis.sbarPayload.assessment)
    : `<div style="color:#666;">즉시 우선순위로 분류된 문제는 없습니다.</div>`;
  const recommendationItems = analysis.sbarPayload.recommendation.length
    ? renderHandoffBulletList(analysis.sbarPayload.recommendation)
    : `<div style="color:#666;">현재 계획 유지 및 routine monitoring 권장.</div>`;

  const assessmentHTML = `
    ${assessmentItems}
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      <button class="sbar-link-btn" onclick="openLabModal('${p.id}', 'Hematology')">주요 검사 결과 자세히 보기</button>
      <button class="sbar-link-btn" onclick="openSpecialSummaryModal('${p.id}')">영상 / 특수 검사 보기</button>
      <button class="sbar-link-btn" onclick="alert('협진: ${endData.consults ? endData.consults : '정보 없음'}')">협진 요청 현황 보기</button>
    </div>
  `;

  return `
    ${longitudinalSummaryHTML}
    <div class="sbar-section">
      <div class="sbar-header situation">S - Situation</div>
      <div class="sbar-body">
        <div style="margin-bottom:4px;"><b>현재 간호 초점:</b> ${escapeHtml(endData.nursingProblem || '-')}</div>
        <div style="margin-bottom:4px;"><b>입원 배경:</b> ${escapeHtml(normalizeMedicalTerm(p.admissionNote || p.admitReason || '-'))}</div>
        ${historyHTML}
        <div style="margin-bottom:8px;"><b>현재 활력:</b> BP ${escapeHtml(endData.vital.bp)}, HR ${escapeHtml(String(endData.vital.hr))}, BT ${escapeHtml(String(endData.vital.bt))}, SpO2 ${escapeHtml(String(endData.vital.spo2))}%</div>
        ${situationItems}
      </div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header background">B - Background</div>
      <div class="sbar-body">${backgroundCards}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header assessment">A - Assessment</div>
      <div class="sbar-body">${assessmentHTML}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header recommendation">R - Recommendation</div>
      <div class="sbar-body">
        ${recommendationItems}
        ${renderRoutineOrderLink(endData, dates)}
      </div>
    </div>
  `;
}

if (window.handoffAppApi) {
  window.handoffAppApi.buildNormalizedDailyTimeline = buildNormalizedDailyTimeline;
  window.handoffAppApi.buildLongitudinalPatientSummary = buildLongitudinalPatientSummary;
  window.handoffAppApi.buildHandoffAnalysis = buildHandoffAnalysis;
  window.handoffAppApi.generateNarrativeSBAR = generateNarrativeSBAR;
}
