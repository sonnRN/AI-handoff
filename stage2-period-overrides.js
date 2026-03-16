// Stage 2 period-aware and realtime date overrides

const baseSetupUIForPeriodOverride = typeof setupUI === 'function' ? setupUI : null;
const baseBuildNormalizedDailyTimelineForPeriodOverride =
  typeof buildNormalizedDailyTimeline === 'function' ? buildNormalizedDailyTimeline : null;
const baseBuildLongitudinalPatientSummaryForPeriodOverride =
  typeof buildLongitudinalPatientSummary === 'function' ? buildLongitudinalPatientSummary : null;

let currentRealtimeDateContext = null;
let realtimeRefreshTimerStarted = false;

function parseIsoDateParts(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return { year, month, day };
}

function addDaysToIsoDate(dateStr, deltaDays) {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) return dateStr || '-';
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  shifted.setUTCDate(shifted.getUTCDate() + Number(deltaDays || 0));
  return shifted.toISOString().slice(0, 10);
}

function diffIsoDays(laterDate, earlierDate) {
  const later = parseIsoDateParts(laterDate);
  const earlier = parseIsoDateParts(earlierDate);
  if (!later || !earlier) return 0;
  const laterUtc = Date.UTC(later.year, later.month - 1, later.day);
  const earlierUtc = Date.UTC(earlier.year, earlier.month - 1, earlier.day);
  return Math.round((laterUtc - earlierUtc) / (1000 * 60 * 60 * 24));
}

function getPatientRawDates(patient) {
  return Object.keys(patient?.dailyData || {}).sort();
}

function getPatientFromCacheSync(pid) {
  const cacheKey = String(pid || '');
  return patientDetailCache.get(cacheKey)
    || patientStore.find((patient) => String(patient.id) === cacheKey)
    || null;
}

function buildRealtimeDateContext(patient) {
  const rawDates = getPatientRawDates(patient);
  const koreaToday = getKoreanNowParts().date;
  if (!rawDates.length) {
    return {
      patientId: String(patient?.id || ''),
      rawDates: [],
      displayByRaw: {},
      firstRawDate: '',
      lastRawDate: '',
      admitRawDate: '',
      admitDisplayDate: koreaToday,
      currentDisplayDate: koreaToday,
      stayLength: 0
    };
  }

  const firstRawDate = rawDates[0];
  const lastRawDate = rawDates[rawDates.length - 1];
  const admitRawDate = parseIsoDateParts(patient?.admitDate) ? patient.admitDate : firstRawDate;
  const displayByRaw = {};

  rawDates.forEach((rawDate) => {
    const offsetFromCurrent = diffIsoDays(lastRawDate, rawDate);
    displayByRaw[rawDate] = addDaysToIsoDate(koreaToday, -offsetFromCurrent);
  });

  const admitOffset = diffIsoDays(lastRawDate, admitRawDate);
  return {
    patientId: String(patient?.id || ''),
    rawDates,
    displayByRaw,
    firstRawDate,
    lastRawDate,
    admitRawDate,
    admitDisplayDate: addDaysToIsoDate(koreaToday, -admitOffset),
    currentDisplayDate: koreaToday,
    stayLength: Math.max(1, diffIsoDays(lastRawDate, admitRawDate) + 1)
  };
}

function getRealtimeDateContext(patient) {
  const patientId = String(patient?.id || '');
  if (!patientId) {
    return currentRealtimeDateContext || buildRealtimeDateContext(null);
  }

  if (!currentRealtimeDateContext || currentRealtimeDateContext.patientId !== patientId) {
    currentRealtimeDateContext = buildRealtimeDateContext(patient);
  }

  return currentRealtimeDateContext;
}

function mapPatientDate(patient, rawDate) {
  if (!rawDate || rawDate === '-') return rawDate || '-';
  const context = getRealtimeDateContext(patient);
  if (context.displayByRaw[rawDate]) return context.displayByRaw[rawDate];
  if (!context.lastRawDate) return rawDate;
  return addDaysToIsoDate(context.currentDisplayDate, -diffIsoDays(context.lastRawDate, rawDate));
}

function getStayDayForRawDate(patient, rawDate) {
  const context = getRealtimeDateContext(patient);
  if (!rawDate || !context.admitRawDate) return 1;
  return Math.max(1, diffIsoDays(rawDate, context.admitRawDate) + 1);
}

function getSelectedDateRange(patient, startIdx, endIdx) {
  const rawDates = getPatientRawDates(patient);
  const safeStartIdx = clampScore(Number(startIdx || 0), 0, Math.max(0, rawDates.length - 1));
  const safeEndIdx = clampScore(
    Number(endIdx == null ? rawDates.length - 1 : endIdx),
    0,
    Math.max(0, rawDates.length - 1)
  );
  const rangeStartIdx = Math.min(safeStartIdx, safeEndIdx);
  const rangeEndIdx = Math.max(safeStartIdx, safeEndIdx);
  return {
    rawDates,
    rangeStartIdx,
    rangeEndIdx,
    selectedRawDates: rawDates.slice(rangeStartIdx, rangeEndIdx + 1)
  };
}

function getRangeDayCount(rawDates) {
  if (!rawDates.length) return 0;
  return Math.max(1, diffIsoDays(rawDates[rawDates.length - 1], rawDates[0]) + 1);
}

function createOptionElement(value, label) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = label;
  return option;
}

function refreshTimelineDateOptions(patient) {
  const dateSelect = document.getElementById('dateSelect');
  if (!dateSelect || !patient) return;
  const rawDates = getPatientRawDates(patient);
  dateSelect.innerHTML = '';
  rawDates.forEach((rawDate, index) => {
    const label = `${mapPatientDate(patient, rawDate)} (재원 ${getStayDayForRawDate(patient, rawDate)}일차)`;
    dateSelect.appendChild(createOptionElement(index, label));
  });
  dateSelect.value = String(currentDateIndex);
}

function refreshAIRangeSelectors(patient, preserveSelection = false) {
  const startSelect = document.getElementById('aiRangeStart');
  const endSelect = document.getElementById('aiRangeEnd');
  if (!startSelect || !endSelect || !patient) return;

  const previousStart = startSelect.value;
  const previousEnd = endSelect.value;
  const rawDates = getPatientRawDates(patient);
  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  rawDates.forEach((rawDate, index) => {
    const label = `${mapPatientDate(patient, rawDate)} (재원 ${getStayDayForRawDate(patient, rawDate)}일차)`;
    startSelect.appendChild(createOptionElement(index, label));
    endSelect.appendChild(createOptionElement(index, label));
  });

  if (!rawDates.length) {
    updateAIRangeMeta(patient, 0, 0);
    return;
  }

  if (preserveSelection && previousStart !== '' && previousEnd !== '') {
    startSelect.value = String(Math.min(Number(previousStart), rawDates.length - 1));
    endSelect.value = String(Math.min(Number(previousEnd), rawDates.length - 1));
  } else {
    startSelect.value = '0';
    endSelect.value = String(rawDates.length - 1);
  }

  updateAIRangeMeta(patient, Number(startSelect.value), Number(endSelect.value));
}

function updateAIRangeMeta(patient, startIdx, endIdx) {
  const metaEl = document.getElementById('aiRangeMeta');
  if (!metaEl || !patient) return;

  const context = getRealtimeDateContext(patient);
  const range = getSelectedDateRange(patient, startIdx, endIdx);
  const selectedStartRaw = range.selectedRawDates[0] || context.firstRawDate;
  const selectedEndRaw = range.selectedRawDates[range.selectedRawDates.length - 1] || context.lastRawDate;
  const fullStayLabel = `${context.admitDisplayDate} ~ ${context.currentDisplayDate}`;
  const selectedLabel = `${mapPatientDate(patient, selectedStartRaw)} ~ ${mapPatientDate(patient, selectedEndRaw)}`;
  const selectedDayCount = getRangeDayCount(range.selectedRawDates);

  metaEl.innerHTML = `
    <div><b>현재 진단 재원기간</b> ${escapeHtml(fullStayLabel)} <span class="ai-range-meta-days">(재원 ${context.stayLength}일)</span></div>
    <div><b>선택 분석기간</b> ${escapeHtml(selectedLabel)} <span class="ai-range-meta-days">(분석 ${selectedDayCount}일)</span></div>
  `;
}

const LOCALIZED_TERM_RULES = [
  [/\s*\((disorder|finding|situation|procedure|physical object|observable entity|qualifier value|morphologic abnormality)\)/gi, ''],
  [/\bHistory of cardiac arrest\b/gi, '심정지 과거력'],
  [/\bHistory of myocardial infarction\b/gi, '심근경색 과거력'],
  [/\bChronic congestive heart failure\b/gi, '만성 울혈성 심부전'],
  [/\bChronic obstructive bronchitis\b/gi, '만성 폐쇄성 기관지염'],
  [/\bViral sinusitis\b/gi, '바이러스성 부비동염'],
  [/\bAcute bacterial sinusitis\b/gi, '급성 세균성 부비동염'],
  [/\bAcute viral pharyngitis\b/gi, '급성 바이러스성 인두염'],
  [/\bAcute bronchitis\b/gi, '급성 기관지염'],
  [/\bOtitis media\b/gi, '중이염'],
  [/\bHyperlipidemia\b/gi, '고지혈증'],
  [/\bHypertension\b/gi, '고혈압'],
  [/\bCardiac Arrest\b/gi, '심정지'],
  [/\bSprain of ankle\b/gi, '발목 염좌'],
  [/\bDrug overdose\b/gi, '약물 과다복용'],
  [/\bLaceration of hand\b/gi, '손 열상'],
  [/\bChronic pain\b/gi, '만성 통증'],
  [/\bInjury of medial collateral ligament of knee\b/gi, '무릎 내측측부인대 손상'],
  [/\bShellfish allergy\b/gi, '조개류 알레르기'],
  [/\bAllergy to grass pollen\b/gi, '잔디 꽃가루 알레르기'],
  [/\bFirst degree burn\b/gi, '1도 화상'],
  [/\bBurn injury\b/gi, '화상'],
  [/\bOsteoarthritis of knee\b/gi, '무릎 골관절염'],
  [/\bMyocardial infarction\b/gi, '심근경색'],
  [/\bCoronary Heart Disease\b/gi, '관상동맥질환'],
  [/\bFamilial Alzheimer's disease of early onset\b/gi, '조기 발병 가족성 알츠하이머병'],
  [/\bAtrial Fibrillation\b/gi, '심방세동'],
  [/\bWhiplash injury to neck\b/gi, '경추 편타 손상'],
  [/\bNormal pregnancy\b/gi, '정상 임신'],
  [/\bBody mass index 30\+\s*-\s*obesity\b/gi, 'BMI 30 이상 비만'],
  [/\bCerebral Infarction\b/gi, '뇌경색'],
  [/\bCerebral Infraction\b/gi, '뇌경색'],
  [/\bStroke\b/gi, '뇌졸중'],
  [/\bSepsis\b/gi, '패혈증'],
  [/\bSelf-care deficit\b/gi, '자가간호결핍'],
  [/\bFall risk\b/gi, '낙상 위험'],
  [/\bRecommendation to avoid exercise\b/gi, '운동 제한 권고'],
  [/\bRecommendation to rest\b/gi, '안정 권고'],
  [/\bExercise therapy\b/gi, '운동 치료'],
  [/\bphysical exercise\b/gi, '활동 가능'],
  [/\bPhysical activity target light exercise\b/gi, '가벼운 활동 권고'],
  [/\bJoint mobility exercises\b/gi, '관절 운동'],
  [/\bAbsolute bed rest\b/gi, '절대 침상 안정'],
  [/\bBed rest\b/gi, '침상 안정'],
  [/\bAssist ambulation with walker\b/gi, '보행기 보조 보행'],
  [/\bRest, ice, compression and elevation treatment programme\b/gi, 'RICE 처치 중'],
  [/\bPeripheral IV\b/gi, '말초정맥로'],
  [/\bRoom air\b/gi, '실내 공기'],
  [/\bBrain MRI\b/gi, '뇌 MRI'],
  [/\bBrain CT\b/gi, '뇌 CT'],
  [/\bacute infarction\b/gi, '급성 경색'],
  [/\binfarction\b/gi, '경색'],
  [/\bextension\b/gi, '진행'],
  [/\bRt\.\s*/gi, '우측 '],
  [/\bLt\.\s*/gi, '좌측 '],
  [/\bleft\b/gi, '좌측'],
  [/\bright\b/gi, '우측'],
  [/\bMCA\b/g, 'MCA'],
  [/\bmonitoring\b/gi, '관찰'],
  [/\bconfirmed\b/gi, '확인됨'],
  [/\bacute\b/gi, '급성'],
  [/\bneuro\b/gi, '신경학적']
];

function localizeClinicalDisplayText(text) {
  let localized = normalizeMedicalTerm(String(text || ''));
  LOCALIZED_TERM_RULES.forEach(([pattern, replacement]) => {
    localized = localized.replace(pattern, replacement);
  });
  localized = localized
    .replace(/\s+\/\s+/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .trim();
  return localized || '-';
}

function mapDatesInText(patient, text) {
  const context = getRealtimeDateContext(patient);
  let mapped = String(text || '');
  Object.entries(context.displayByRaw || {}).forEach(([rawDate, displayDate]) => {
    mapped = mapped.replace(new RegExp(rawDate.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), displayDate);
  });
  return mapped;
}

function normalizeSummaryHeadline(item) {
  if (String(item?.id || '').startsWith('identity:admission:')) {
    return `입원 배경: ${String(item.id).slice('identity:admission:'.length)}`;
  }
  return item?.summary || '-';
}

function localizeSummaryItem(patient, item) {
  const localizedSummary = localizeClinicalDisplayText(mapDatesInText(patient, normalizeSummaryHeadline(item)));
  const localizedDetail = localizeClinicalDisplayText(mapDatesInText(patient, item.detail || ''));
  const localizedBasis = (item.clinicalBasis || [])
    .slice(0, 4)
    .map((entry) => localizeClinicalDisplayText(mapDatesInText(patient, entry)));

  return {
    ...item,
    summary: localizedSummary,
    detail: localizedDetail,
    clinicalBasis: localizedBasis,
    displaySourceDates: (item.sourceDates || []).map((date) => mapPatientDate(patient, date))
  };
}

function renderLongitudinalConciseSummary(summary) {
  const lines = Array.isArray(summary?.conciseLines) && summary.conciseLines.length
    ? summary.conciseLines
    : String(summary?.conciseSummary || '')
      .split(/\s*\|\s*/)
      .map((item) => item.trim())
      .filter(Boolean);

  if (!lines.length) {
    return '<div class="longitudinal-concise-line">요약 정보 없음</div>';
  }

  return lines
    .map((line) => `<div class="longitudinal-concise-line">${escapeHtml(localizeClinicalDisplayText(line))}</div>`)
    .join('');
}

function bindAIRangeSelectorMetaHandlers() {
  const startSelect = document.getElementById('aiRangeStart');
  const endSelect = document.getElementById('aiRangeEnd');
  const handler = () => {
    const patient = getPatientFromCacheSync(selectedPatientId) || patientStore[0] || null;
    if (!patient) return;
    updateAIRangeMeta(
      patient,
      Number(startSelect?.value || 0),
      Number(endSelect?.value || getPatientRawDates(patient).length - 1)
    );
  };
  if (startSelect) startSelect.onchange = handler;
  if (endSelect) endSelect.onchange = handler;
}

function startRealtimeDateRefreshLoop() {
  if (realtimeRefreshTimerStarted) return;
  realtimeRefreshTimerStarted = true;

  setInterval(() => {
    const patient = getPatientFromCacheSync(selectedPatientId) || patientStore[0] || null;
    if (!patient) return;
    currentRealtimeDateContext = buildRealtimeDateContext(patient);
    refreshTimelineDateOptions(patient);
    refreshAIRangeSelectors(patient, true);
    updateDateDisplay();
  }, 60 * 1000);
}

function annotateSummaryItemDates(patient, item) {
  return localizeSummaryItem(patient, item);
}

function buildScopedLongitudinalSummary(patient, fullTimeline, selectedTimeline) {
  const fullSummary = baseBuildLongitudinalPatientSummaryForPeriodOverride(
    patient,
    fullTimeline,
    LONGITUDINAL_SUMMARY_POLICY
  );
  const selectedSummary = baseBuildLongitudinalPatientSummaryForPeriodOverride(
    patient,
    selectedTimeline,
    LONGITUDINAL_SUMMARY_POLICY
  );
  const context = getRealtimeDateContext(patient);
  const selectedStartRaw = selectedTimeline[0]?.date || context.firstRawDate || '';
  const selectedEndRaw = selectedTimeline[selectedTimeline.length - 1]?.date || context.lastRawDate || '';

  const sections = {
    identity: (fullSummary.sections?.identity || []).map((item) => annotateSummaryItemDates(patient, item)),
    careFrame: (selectedSummary.sections?.careFrame || []).map((item) => annotateSummaryItemDates(patient, item)),
    persistentConcerns: (selectedSummary.sections?.persistentConcerns || []).map((item) => annotateSummaryItemDates(patient, item)),
    watchItems: (selectedSummary.sections?.watchItems || []).map((item) => annotateSummaryItemDates(patient, item)),
    carryoverItems: (selectedSummary.sections?.carryoverItems || []).map((item) => annotateSummaryItemDates(patient, item))
  };

  const narrativeLines = [];
  if (sections.identity[0]?.summary) narrativeLines.push(sections.identity[0].summary);
  if (sections.careFrame.length) narrativeLines.push(`현재 관리: ${sections.careFrame.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.persistentConcerns.length) narrativeLines.push(`지속 문제: ${sections.persistentConcerns.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.watchItems.length) narrativeLines.push(`집중 관찰: ${sections.watchItems.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.carryoverItems.length) narrativeLines.push(`인계 책임: ${sections.carryoverItems.slice(0, 2).map((item) => item.summary).join(' / ')}`);

  return {
    ...selectedSummary,
    patientId: patient.id,
    sections,
    conciseLines: narrativeLines,
    conciseSummary: narrativeLines.join(' | ') || `${patient.name || '환자'} 요약 정보가 부족합니다.`,
    dateRange: {
      start: selectedStartRaw,
      end: selectedEndRaw
    },
    displayDateRange: {
      start: mapPatientDate(patient, selectedStartRaw),
      end: mapPatientDate(patient, selectedEndRaw)
    },
    fullStayRange: {
      start: context.admitDisplayDate,
      end: context.currentDisplayDate
    },
    currentDate: selectedEndRaw,
    displayCurrentDate: mapPatientDate(patient, selectedEndRaw),
    selectedDayCount: getRangeDayCount(selectedTimeline.map((snapshot) => snapshot.date)),
    fullStayDayCount: context.stayLength
  };
}

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

  const patientId = patient?.id || summary.patientId || '';
  const chipItems = [
    `선택 분석기간 ${summary.displayDateRange?.start || '-'} ~ ${summary.displayDateRange?.end || '-'} (${summary.selectedDayCount || 0}일)`,
    `전체 재원기간 ${summary.fullStayRange?.start || '-'} ~ ${summary.fullStayRange?.end || '-'} (${summary.fullStayDayCount || 0}일)`,
    `현재 기준 ${summary.displayCurrentDate || summary.currentDate || '-'}`
  ];

  return `
    <div class="longitudinal-panel">
      <div class="longitudinal-panel-header">
        <div class="longitudinal-panel-title">2단계 핵심 환자 요약</div>
        <div class="longitudinal-panel-subtitle">전체 재원기간 중 환자 정체성은 유지하고, 현재 관리와 지속 문제는 선택한 분석기간 기준으로 다시 압축합니다.</div>
      </div>
      <div class="longitudinal-panel-body">
        <div class="longitudinal-chip-row">
          ${chipItems.map((item) => `<span class="longitudinal-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="longitudinal-concise">${renderLongitudinalConciseSummary(summary)}</div>
        <div class="longitudinal-groups">
          ${renderLongitudinalSummaryGroup('환자 정체성', '입원 배경과 핵심 진단 등 전체 재원기간에서 유지해야 하는 정보', summary.sections.identity, '정체성 요약 정보 없음', patientId)}
          ${renderLongitudinalSummaryGroup('현재 관리 틀', '선택한 분석기간 안에서 현재 유지 중인 관리 조건', summary.sections.careFrame, '현재 관리 틀 정보 없음', patientId)}
          ${renderLongitudinalSummaryGroup('지속 핵심 문제', '선택한 분석기간 안에서 아직 남아 있는 핵심 문제', summary.sections.persistentConcerns, '지속 핵심 문제 없음', patientId)}
          ${renderLongitudinalSummaryGroup('집중 관찰', '이번 근무조가 더 주의해서 볼 항목', summary.sections.watchItems, '집중 관찰 항목 없음', patientId)}
          ${renderLongitudinalSummaryGroup('지속 인계 책임', '다음 근무조가 이어받아야 할 책임', summary.sections.carryoverItems, '지속 인계 책임 없음', patientId)}
        </div>
      </div>
    </div>
  `;
}

function renderLongitudinalSummaryItem(item, patientId) {
  const sourceDates = (item.displaySourceDates || item.sourceDates || []).join(', ');
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

syncDateList = function (patient) {
  if (!patient || !patient.dailyData) return;
  dateList = getPatientRawDates(patient);
  currentDateIndex = Math.min(currentDateIndex, Math.max(0, dateList.length - 1));
  currentRealtimeDateContext = buildRealtimeDateContext(patient);
  refreshTimelineDateOptions(patient);
};

setupUI = function () {
  if (typeof baseSetupUIForPeriodOverride === 'function') {
    baseSetupUIForPeriodOverride();
  }
  const patient = getPatientFromCacheSync(selectedPatientId) || patientStore[0] || null;
  bindAIRangeSelectorMetaHandlers();
  startRealtimeDateRefreshLoop();
  if (patient) {
    refreshTimelineDateOptions(patient);
    refreshAIRangeSelectors(patient, true);
  }
};

setupAIRangeSelectors = function () {
  const patient = getPatientFromCacheSync(selectedPatientId) || patientStore[0] || null;
  if (patient) {
    refreshAIRangeSelectors(patient, false);
  }
};

updateDateDisplay = function () {
  const patient = getPatientFromCacheSync(selectedPatientId) || patientStore[0] || null;
  const rawDate = dateList[currentDateIndex];
  const displayDate = patient ? mapPatientDate(patient, rawDate) : rawDate;
  const displayEl = document.getElementById('currentDateDisplay');
  const dDayEl = document.getElementById('dDayDisplay');
  const dateSel = document.getElementById('dateSelect');
  const prevBtn = document.getElementById('prevDateBtn');
  const nextBtn = document.getElementById('nextDateBtn');

  if (displayEl) displayEl.textContent = displayDate || '-';
  if (dDayEl) {
    const diff = Math.max(0, dateList.length - 1 - currentDateIndex);
    dDayEl.textContent = diff === 0 ? '오늘' : `${diff}일 전`;
  }
  if (dateSel) {
    refreshTimelineDateOptions(patient);
    dateSel.value = String(currentDateIndex);
  }
  if (prevBtn) prevBtn.disabled = currentDateIndex === 0;
  if (nextBtn) nextBtn.disabled = currentDateIndex === dateList.length - 1;
};

updateDashboard = async function (pid) {
  let patient = null;
  try {
    patient = await getPatientData(pid);
  } catch (error) {
    console.error(error);
    return;
  }

  if (!patient) return;
  syncDateList(patient);
  const rawDate = dateList[currentDateIndex];
  const data = patient.dailyData?.[rawDate];
  if (!data) return;

  setText('pName', patient.name);
  setText('pRegNo', patient.registrationNo);
  setText('pAge', `${patient.gender}/${patient.age}`);
  setText('pBlood', patient.bloodType);
  setText('pBody', patient.bodyInfo);
  setHTML('pDiag', localizeClinicalDisplayText(patient.diagnosis));
  setText('pAdmit', mapPatientDate(patient, parseIsoDateParts(patient.admitDate) ? patient.admitDate : getPatientRawDates(patient)[0]));
  setText('pDoc', patient.doctor);
  setText('pIso', patient.isolation);
  setText('pHD', `재원 ${getStayDayForRawDate(patient, rawDate)}일차`);
  setHTML('allergyBadges', renderAllergyBadges(patient));
  setHTML('cautionCard', renderCautionCard(patient, data));

  const historyStr = (data.pastHistory || []).map((item) => `<div>• ${item}</div>`).join('');
  setHTML('pastHistoryList', historyStr || '-');
  setHTML('admitReason', `<div class="admit-reason-full">${formatMultilineText(localizeClinicalDisplayText(patient.admissionNote || patient.admitReason))}</div>`);
  setHTML('nursingProblem', formatMultilineText(data.nursingProblem));

  const handover = data.handover || {};
  const currentLineTube = [...(handover.lines || []), ...(handover.tubes || []), ...(handover.drains || []), ...(handover.vent || [])];
  setHTML('lineTube', renderSimpleList(currentLineTube));

  const hourly = data.hourly || [];
  const vsFlow = hourly
    .filter((entry, index) => index % 4 === 0 || entry.event)
    .map((entry) => {
      const style = entry.event ? 'color:#c62828; font-weight:bold; background-color:#ffebee;' : '';
      return `<div style="font-size:13px; margin-bottom:2px; padding:2px; ${style}">[${entry.time}] BP:${entry.vital.bp} / P:${entry.vital.hr} / T:${entry.vital.bt} / SpO2:${entry.vital.spo2 || '-'}%</div>`;
    })
    .join('');
  setHTML('vitalSign', vsFlow || '데이터 없음');

  setHTML('ioActivity', `
    <div><b>총 I/O:</b> ${data.io?.input || '-'} / ${data.io?.totalOutput || '-'}</div>
    <div style="margin-top:4px;"><b>활동:</b> ${data.activity || '-'}</div>
  `);

  const inj = data.orders?.inj || [];
  const po = data.orders?.po || [];
  setHTML('injList', renderMedList(inj));
  setHTML('poList', renderMedList(po));
  setHTML('medScheduleList', renderMedSchedule(data.medSchedule || [], [...inj, ...po]));

  setHTML('labResult', renderLabSummary(patient.id, data.labs || {}));
  setHTML('labSpecial', (data.specials || []).map((item) => `• ${item}`).join('<br>') || '-');

  const notesHtml = hourly.flatMap((entry) => (entry.notes || []).map((note) => `
    <div style="border-bottom:1px solid #eee; padding:6px 0; font-size:13px; line-height:1.6;">
      <span style="color:#1976d2; font-weight:bold;">[${entry.time}]</span>
      <span>${note}</span>
    </div>
  `)).join('');
  setHTML('nursingNoteDisplay', notesHtml || '기록 없음');

  const doc = data.docOrders || { routine: [], prn: [] };
  let docHtml = '';
  if (doc.routine.length) {
    docHtml += `<div style="margin-bottom:6px;"><div style="color:#2e7d32; font-weight:bold; margin-bottom:2px;">[정기 처방]</div>${doc.routine.map((item) => `<div>• ${item}</div>`).join('')}</div>`;
  }
  if (doc.prn.length) {
    docHtml += `<div><div style="color:#d81b60; font-weight:bold; margin-bottom:2px;">[PRN / Notify]</div>${doc.prn.map((item) => `<div>• ${item}</div>`).join('')}</div>`;
  }
  setHTML('docOrderList', docHtml || '특이 처방 없음');

  const aiPatientEl = document.getElementById('aiPanelPatient');
  if (aiPatientEl) {
    aiPatientEl.textContent = `${patient.name} (${patient.age}/${patient.gender}) - ${localizeClinicalDisplayText(patient.diagnosis)}`;
  }

  refreshAIRangeSelectors(patient, true);
  updateAIRangeMeta(patient, Number(document.getElementById('aiRangeStart')?.value || 0), Number(document.getElementById('aiRangeEnd')?.value || dateList.length - 1));
};

runAIRangeAnalysis = function (pid) {
  const summaryTab = document.getElementById('tab-summary');
  if (summaryTab) {
    summaryTab.innerHTML = '<div class="ai-placeholder" style="padding:20px;">⏳ 분석 중...</div>';
  }

  setTimeout(async () => {
    try {
      const patient = await getPatientData(pid);
      if (!patient) throw new Error('환자 데이터를 찾을 수 없습니다.');
      syncDateList(patient);

      const startIdx = Number(document.getElementById('aiRangeStart')?.value || 0);
      const endIdx = Number(document.getElementById('aiRangeEnd')?.value || dateList.length - 1);
      const range = getSelectedDateRange(patient, startIdx, endIdx);

      if (!range.selectedRawDates.length) {
        throw new Error('분석할 날짜가 없습니다.');
      }

      const startData = patient.dailyData?.[range.selectedRawDates[0]];
      const endData = patient.dailyData?.[range.selectedRawDates[range.selectedRawDates.length - 1]];
      if (!startData || !endData) {
        throw new Error('해당 분석기간의 환자 데이터가 없습니다.');
      }

      updateAIRangeMeta(patient, range.rangeStartIdx, range.rangeEndIdx);
      const sbarHtml = generateNarrativeSBAR(patient, startData, endData, range.selectedRawDates);
      const orderHistoryHtml = generateOrderHistory(patient, range.selectedRawDates);

      if (summaryTab) {
        summaryTab.innerHTML = sbarHtml + orderHistoryHtml;
      }
      renderChecklists(pid, endData);
    } catch (error) {
      console.error(error);
      if (summaryTab) {
        summaryTab.innerHTML = `<div class="ai-placeholder" style="color:red;">오류: ${escapeHtml(error.message)}</div>`;
      }
    }
  }, 300);
};

openAddRecordModal = function () {
  if (!selectedPatientId) return;
  const patient = getPatientFromCacheSync(selectedPatientId);
  const rawDate = dateList[currentDateIndex];
  const now = getKoreanNowParts();
  const displayDate = patient ? mapPatientDate(patient, rawDate) : now.date;
  document.getElementById('addRecordModal').classList.add('active');
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('recordTime').value = `${displayDate} ${now.time}`;
};

window.openLabModal = async function (pid, category) {
  const patient = await getPatientData(pid);
  if (!patient) return alert('환자 정보를 찾을 수 없습니다.');

  const modalBody = document.getElementById('labModalBody');
  const modal = document.getElementById('labModal');
  const overlay = document.getElementById('modalOverlay');
  if (!modalBody || !modal || !overlay) {
    return alert('Lab 모달창 요소를 찾을 수 없습니다.');
  }

  const rawDates = getPatientRawDates(patient);
  let targetCategory = category;
  if (!targetCategory && patient.dailyData?.[rawDates[0]]?.labs) {
    targetCategory = Object.keys(patient.dailyData[rawDates[0]].labs)[0];
  }

  const categories = Object.keys(patient.dailyData?.[rawDates[0]]?.labs || {});
  let tabHtml = '<div style="display:flex; gap:5px; margin-bottom:10px; border-bottom:2px solid #ddd; padding-bottom:5px;">';
  categories.forEach((cat) => {
    const activeStyle = cat === targetCategory ? 'background:#1976d2; color:white;' : 'background:#eee; color:#333;';
    tabHtml += `<button onclick="openLabModal('${pid}', '${cat}')" style="border:none; padding:6px 12px; border-radius:15px; cursor:pointer; font-weight:bold; ${activeStyle}">${cat}</button>`;
  });
  tabHtml += '</div>';

  let labKeys = [];
  for (const rawDate of rawDates) {
    if (patient.dailyData?.[rawDate]?.labs?.[targetCategory]) {
      labKeys = Object.keys(patient.dailyData[rawDate].labs[targetCategory]);
      break;
    }
  }

  let html = `${tabHtml}<h3 style="margin-bottom:10px;">${patient.name}님의 ${targetCategory} 누적 결과</h3>`;
  html += '<div class="modal-table-container" style="overflow-x:auto;"><table class="modal-table">';
  html += '<thead><tr style="background:#f5f5f5;"><th style="min-width:100px; position:sticky; left:0; background:#e0e0e0; z-index:10; border:1px solid #ccc;">검사항목</th>';
  rawDates.forEach((rawDate) => {
    html += `<th style="min-width:90px; border:1px solid #ccc; padding:6px;">${mapPatientDate(patient, rawDate).slice(5)}</th>`;
  });
  html += '</tr></thead><tbody>';

  labKeys.forEach((key) => {
    html += `<tr><td style="font-weight:bold; position:sticky; left:0; background:#f9f9f9; border:1px solid #ccc;">${key}</td>`;
    rawDates.forEach((rawDate) => {
      const categoryObj = patient.dailyData?.[rawDate]?.labs?.[targetCategory] || null;
      const value = formatLabValue(categoryObj ? (categoryObj[key] || '-') : '-');
      const status = getLabStatus(key, value);
      let cellStyle = '';
      if (status.status === 'high') cellStyle = 'color:#d32f2f; font-weight:bold;';
      if (status.status === 'low') cellStyle = 'color:#1976d2; font-weight:bold;';
      html += `<td style="border:1px solid #ccc; text-align:center; padding:6px; ${cellStyle}">${value}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  modalBody.innerHTML = html;
  modal.classList.add('active');
  overlay.classList.add('active');
};

window.openVitalSheetModal = async function (pid, rawDate) {
  const patient = await getPatientData(pid);
  if (!patient || !patient.dailyData) return;
  const rawDates = getPatientRawDates(patient);
  const targetRawDate = rawDate && patient.dailyData[rawDate] ? rawDate : rawDates[rawDates.length - 1];
  const dayData = patient.dailyData[targetRawDate];
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

  const displayDate = mapPatientDate(patient, targetRawDate);
  const html = `
    <div style="margin-bottom:10px; color:#455a64; font-size:12px;">${escapeHtml(displayDate)} 기준 활력징후 시트입니다.</div>
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
  window.openHtmlNoteModal(`${patient.name} V/S 시트 (${displayDate})`, html);
};

window.openSpecialSummaryModal = async function (pid) {
  const patient = await getPatientData(pid);
  if (!patient || !patient.dailyData) return;
  const items = unique(
    getPatientRawDates(patient).flatMap((rawDate) =>
      (patient.dailyData?.[rawDate]?.specials || []).map((text) => `${mapPatientDate(patient, rawDate)}: ${text}`)
    )
  );
  const html = items.length
    ? `<ul style="padding-left:18px; line-height:1.8;">${items.map((item) => `<li>${escapeHtml(normalizeMedicalTerm(item))}</li>`).join('')}</ul>`
    : '<div>영상/특수검사 정보가 없습니다.</div>';
  window.openHtmlNoteModal(`${patient.name} 영상/특수검사`, html);
};

buildHandoffAnalysis = function (patient, dates) {
  const fullRawDates = getPatientRawDates(patient);
  const selectedRawDates = Array.isArray(dates) && dates.length ? dates.slice() : fullRawDates.slice();
  const normalizedDailyTimeline = baseBuildNormalizedDailyTimelineForPeriodOverride(patient, selectedRawDates);
  const fullTimeline = baseBuildNormalizedDailyTimelineForPeriodOverride(patient, fullRawDates);
  const longitudinalSummary = buildScopedLongitudinalSummary(patient, fullTimeline, normalizedDailyTimeline);
  const baseline = normalizedDailyTimeline[0] || fullTimeline[0] || null;
  const current = normalizedDailyTimeline[normalizedDailyTimeline.length - 1] || fullTimeline[fullTimeline.length - 1] || null;
  const previous = normalizedDailyTimeline.length > 1
    ? normalizedDailyTimeline[normalizedDailyTimeline.length - 2]
    : null;
  const currentChanges = detectHandoffChanges(previous, current, baseline);
  const timelineEvents = [];

  normalizedDailyTimeline.forEach((snapshot, index) => {
    if (index === 0) return;
    timelineEvents.push(...detectHandoffChanges(normalizedDailyTimeline[index - 1], snapshot, baseline));
  });

  const prioritizedHandoffItems = scoreHandoffEvents(currentChanges, { current, previous });
  return {
    normalizedDailyTimeline,
    fullTimeline,
    longitudinalSummary,
    changeEvents: currentChanges,
    prioritizedHandoffItems,
    analysisPeriod: {
      fullStay: longitudinalSummary.fullStayRange,
      selected: longitudinalSummary.displayDateRange
    },
    sbarPayload: buildSbarPayload(patient, {
      current,
      prioritizedHandoffItems,
      timelineEvents: scoreHandoffEvents(timelineEvents, { current, previous })
    })
  };
};

generateNarrativeSBAR = function (patient, startData, endData, dates) {
  const analysis = buildHandoffAnalysis(patient, dates);
  const historyList = (endData.pastHistory || []).join(', ');
  const historyHtml = historyList
    ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>중요 과거력</b> ${escapeHtml(localizeClinicalDisplayText(historyList))}</div>`
    : '';
  const longitudinalSummaryHtml = renderLongitudinalSummaryPanel(analysis.longitudinalSummary, patient);
  const situationItems = analysis.sbarPayload.situation.length
    ? renderHandoffBulletList(analysis.sbarPayload.situation)
    : '<div style="color:#666;">중대한 상태변화는 확인되지 않았습니다.</div>';
  const backgroundCards = analysis.sbarPayload.background.length
    ? analysis.sbarPayload.background.map((item) => renderBackgroundCard(item)).join('')
    : '<div style="padding:5px; color:#666;">선택 기간 동안 핵심 배경 변화가 확인되지 않았습니다.</div>';
  const assessmentItems = analysis.sbarPayload.assessment.length
    ? renderAssessmentList(analysis.sbarPayload.assessment)
    : '<div style="color:#666;">즉시 우선순위로 분류된 문제는 없습니다.</div>';
  const recommendationItems = analysis.sbarPayload.recommendation.length
    ? renderHandoffBulletList(analysis.sbarPayload.recommendation)
    : '<div style="color:#666;">현재 계획 유지 및 routine monitoring 권장.</div>';

  const assessmentHtml = `
    ${assessmentItems}
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      <button class="sbar-link-btn" onclick="openLabModal('${patient.id}', 'Hematology')">주요 검사 결과 자세히 보기</button>
      <button class="sbar-link-btn" onclick="openSpecialSummaryModal('${patient.id}')">영상 / 특수 검사 보기</button>
      <button class="sbar-link-btn" onclick="alert('협진: ${endData.consults ? endData.consults : '정보 없음'}')">협진 요청 현황 보기</button>
    </div>
  `;

  return `
    ${longitudinalSummaryHtml}
    <div class="sbar-section">
      <div class="sbar-header situation">S - Situation</div>
      <div class="sbar-body">
        <div style="margin-bottom:4px;"><b>현재 간호 초점:</b> ${escapeHtml(localizeClinicalDisplayText(endData.nursingProblem || '-'))}</div>
        <div style="margin-bottom:4px;"><b>입원 배경:</b> ${escapeHtml(localizeClinicalDisplayText(patient.admissionNote || patient.admitReason || '-'))}</div>
        ${historyHtml}
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
      <div class="sbar-body">${assessmentHtml}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header recommendation">R - Recommendation</div>
      <div class="sbar-body">
        ${recommendationItems}
        ${renderRoutineOrderLink(endData, dates)}
      </div>
    </div>
  `;
};

if (window.handoffAppApi) {
  window.handoffAppApi.syncDateList = syncDateList;
  window.handoffAppApi.getRealtimeDateContext = getRealtimeDateContext;
  window.handoffAppApi.mapPatientDate = mapPatientDate;
  window.handoffAppApi.buildHandoffAnalysis = buildHandoffAnalysis;
  window.handoffAppApi.generateNarrativeSBAR = generateNarrativeSBAR;
}
