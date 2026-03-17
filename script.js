// ===== 전역 설정 =====
let selectedPatientId = null;
let aiPanelOpen = false;
let checklistState = {};
let currentDateIndex = 9;
let dateList = [];
let patientStore = [];
let usingExternalData = false;
let externalApiBase = 'api/patients-mcp';
let externalDataSourceLabel = '';
let patientLoadError = '';
const patientDetailCache = new Map();
let uiInitialized = false;
const KOREA_TIMEZONE = 'Asia/Seoul';
const PATIENT_LIST_COUNT = 50;
const WARD_DISPLAY_ORDER = ['ICU', 'N병동', 'S병동', '내과병동', '재활병동'];

function unique(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function getAppMode() {
  return document.body?.dataset?.appMode || 'emr-demo';
}

function isEngineDemoMode() {
  return getAppMode() === 'engine-demo';
}

document.addEventListener('DOMContentLoaded', function () {
  if (!isEngineDemoMode()) {
    initializeApp();
  }
});

async function initializeApp() {
  await loadPatientStore();
  renderPatientList();
  setupUI();
  updateDataSourceLabel();
  updateDateDisplay();
  if (!patientStore.length) return;

  let firstPatient = patientStore[0];
  try {
    firstPatient = await getPatientData(patientStore[0].id);
  } catch (error) {
    console.warn('Initial patient detail load failed.', error);
  }

  syncDateList(firstPatient);
  currentDateIndex = Math.max(0, dateList.length - 1);
  setupAIRangeSelectors();
  updateDateDisplay();
  selectPatient(patientStore[0].id);
}

async function loadPatientStore() {
  const endpoints = buildPatientDataEndpoints();

  try {
    let lastError = null;
    patientLoadError = '';

    for (const endpoint of endpoints) {
      try {
        const requestUrl = endpoint.url.includes('?')
          ? `${endpoint.url}&count=${PATIENT_LIST_COUNT}`
          : `${endpoint.url}?count=${PATIENT_LIST_COUNT}`;
        const response = await fetch(requestUrl);
        if (!response.ok) throw new Error(`External patient list failed: ${response.status}`);

        const payload = await response.json();
        if (!payload.patients || !payload.patients.length) throw new Error('No external patients returned');

        patientStore = payload.patients;
        usingExternalData = true;
        externalApiBase = endpoint.url;
        externalDataSourceLabel = buildExternalSourceLabel(payload);
        preloadPatientDetailCache(payload);
        return;
      } catch (endpointError) {
        lastError = endpointError;
      }
    }

    throw lastError || new Error('No external patient endpoint succeeded');
  } catch (error) {
    console.error('MCP patient load failed.', error);
    patientStore = [];
    usingExternalData = true;
    externalApiBase = endpoints[0]?.url || '';
    externalDataSourceLabel = '합성 FHIR MCP 연결 실패';
    patientLoadError = error.message || 'MCP patient load failed';
  }
}

async function ensurePatientStoreLoaded() {
  if (patientStore.length) return patientStore;
  await loadPatientStore();
  return patientStore;
}

function getPatientStore() {
  return patientStore;
}

function isUsingExternalData() {
  return usingExternalData;
}

function formatDoctorDisplay(patient) {
  const parts = [];
  if (patient?.ward) parts.push(String(patient.ward).trim());
  if (patient?.doctor) parts.push(String(patient.doctor).trim());
  return parts.filter(Boolean).join(' / ') || '-';
}

function updateDataSourceLabel() {
  const header = document.querySelector('.list-header');
  if (!header) return;
  header.textContent = `환자목록 · ${externalDataSourceLabel || '합성 FHIR MCP'}`;
}

function syncDateList(patient) {
  if (!patient || !patient.dailyData) return;
  dateList = Object.keys(patient.dailyData).sort();
  currentDateIndex = Math.min(currentDateIndex, Math.max(0, dateList.length - 1));
}

function getWardSortIndex(ward) {
  const normalized = String(ward || '').trim();
  const fixedIndex = WARD_DISPLAY_ORDER.indexOf(normalized);
  return fixedIndex >= 0 ? fixedIndex : WARD_DISPLAY_ORDER.length + 1;
}

function groupPatientsByWard(patients) {
  const groups = new Map();

  (patients || []).forEach((patient) => {
    const ward = String(patient?.ward || '기타병동').trim() || '기타병동';
    if (!groups.has(ward)) groups.set(ward, []);
    groups.get(ward).push(patient);
  });

  return Array.from(groups.entries())
    .sort((left, right) => {
      const wardDelta = getWardSortIndex(left[0]) - getWardSortIndex(right[0]);
      if (wardDelta !== 0) return wardDelta;
      return String(left[0]).localeCompare(String(right[0]), 'ko');
    })
    .map(([ward, items]) => ({
      ward,
      patients: items.slice().sort((left, right) => {
        return String(left?.room || '').localeCompare(String(right?.room || ''), 'ko');
      })
    }));
}

async function getPatientData(pid) {
  const cacheKey = String(pid);
  if (patientDetailCache.has(cacheKey)) return patientDetailCache.get(cacheKey);

  const response = await fetch(`${externalApiBase}?id=${encodeURIComponent(pid)}`);
  if (!response.ok) {
    throw new Error(`External patient detail failed: ${response.status}`);
  }

  const detail = await response.json();
  patientDetailCache.set(cacheKey, detail);
  patientStore = patientStore.map(pt => String(pt.id) === cacheKey ? { ...pt, ...detail } : pt);
  return detail;
}

function getKoreanNowParts() {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: KOREA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

window.handoffAppApi = {
  ensurePatientStoreLoaded,
  getPatientStore,
  getPatientData,
  syncDateList,
  isUsingExternalData,
  getKoreanNowParts
};

// 초기화
document.addEventListener('DOMContentLoaded', function () {
});

function setupUI() {
  if (uiInitialized) return;
  uiInitialized = true;
  // 날짜 네비게이션
  const prevBtn = document.getElementById('prevDateBtn');
  const nextBtn = document.getElementById('nextDateBtn');
  const dateSel = document.getElementById('dateSelect');

  if (prevBtn && nextBtn && dateSel) {
    // 1. Selector 초기화 (옵션 추가)
    dateSel.innerHTML = '';
    dateList.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.text = `${d} (HD#${i + 1})`;
      dateSel.appendChild(opt);
    });
    dateSel.value = currentDateIndex;

    // 2. 이벤트 리스너
    prevBtn.addEventListener('click', () => changeDate(-1));
    nextBtn.addEventListener('click', () => changeDate(1));
    dateSel.addEventListener('change', (e) => {
      currentDateIndex = parseInt(e.target.value);
      updateUI();
    });
  }

  // AI 패널 관련
  const aiBtn = document.getElementById('aiBtn');
  const closeBtn = document.getElementById('aiPanelClose');
  const overlay = document.getElementById('overlay');

  if (aiBtn) aiBtn.addEventListener('click', openAIPanel);
  if (closeBtn) closeBtn.addEventListener('click', closeAIPanel);
  if (overlay) overlay.addEventListener('click', closeAIPanel);

  // 탭 전환
  document.querySelectorAll('.ai-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.ai-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ai-tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      const targetId = e.target.dataset.tab;
      const targetContent = document.getElementById(`tab-${targetId}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // 분석 버튼
  const analyzeBtn = document.getElementById('aiRangeApplyBtn');
  if (analyzeBtn) {
    analyzeBtn.onclick = function () {
      if (selectedPatientId) runAIRangeAnalysis(selectedPatientId);
      else alert("환자를 먼저 선택해주세요.");
    };
  }

  // 기록 추가 모달
  const addRecordBtn = document.getElementById('addRecordBtn');
  if (addRecordBtn) addRecordBtn.addEventListener('click', openAddRecordModal);
}

function setupAIRangeSelectors() {
  const startSel = document.getElementById('aiRangeStart');
  const endSel = document.getElementById('aiRangeEnd');
  if (!startSel || !endSel) return;

  startSel.innerHTML = ''; endSel.innerHTML = '';
  dateList.forEach((d, i) => {
    startSel.add(new Option(d, i));
    endSel.add(new Option(d, i));
  });
  startSel.value = Math.max(0, dateList.length - 3);
  endSel.value = dateList.length - 1;
}

function changeDate(delta) {
  const newIndex = currentDateIndex + delta;
  if (newIndex >= 0 && newIndex < dateList.length) {
    currentDateIndex = newIndex;
    updateUI();
  }
}

function updateUI() {
  updateDateDisplay();
  if (selectedPatientId) updateDashboard(selectedPatientId);
}

function updateDateDisplay() {
  const dateStr = dateList[currentDateIndex];
  const displayEl = document.getElementById('currentDateDisplay');
  const dDayEl = document.getElementById('dDayDisplay');
  const dateSel = document.getElementById('dateSelect');
  const prevBtn = document.getElementById('prevDateBtn');
  const nextBtn = document.getElementById('nextDateBtn');

  if (!dateList.length || !dateStr) {
    if (displayEl) displayEl.textContent = '-';
    if (dDayEl) dDayEl.textContent = '대기 중';
    if (dateSel) dateSel.value = '';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  if (displayEl) displayEl.textContent = dateStr;
  if (dDayEl) {
    const diff = currentDateIndex - (dateList.length - 1);
    dDayEl.textContent = diff === 0 ? "오늘" : `D${diff}`;
  }

  // 동기화
  if (dateSel) dateSel.value = currentDateIndex;

  // 버튼 활성/비활성 상태
  if (prevBtn) prevBtn.disabled = (currentDateIndex === 0);
  if (nextBtn) nextBtn.disabled = (currentDateIndex === dateList.length - 1);
}

// ===== 🖥️ 메인 대시보드 업데이트 =====
async function updateDashboard(pid) {
  let p = null;

  try {
    p = await getPatientData(pid);
  } catch (error) {
    console.error(error);
    return;
  }

  if (!p) return;
  syncDateList(p);
  const dateKey = dateList[currentDateIndex];
  const data = p.dailyData ? p.dailyData[dateKey] : null;
  if (!data) return;

  // Header (Integrated)
  setText('pName', p.name);
  setText('pRegNo', p.registrationNo);
  setText('pAge', `${p.gender}/${p.age}`);
  setText('pBlood', p.bloodType);
  setText('pBody', p.bodyInfo);
  setHTML('pDiag', p.diagnosis);
  // setHTML('ptRegNum', p.regNum); // Redundant, pRegNo is already set above

  // Render Past History in Column 1
  const historyStr = (data.pastHistory || []).map(item => `<div>• ${item}</div>`).join('');
  setHTML('pastHistoryList', historyStr || '-');

  setText('pAdmit', p.admitDate);
    setText('pDoc', formatDoctorDisplay(p));
  setText('pIso', p.isolation);
  setText('pHD', `HD #${getHD(p.admitDate, dateKey)}`);
  setHTML('allergyBadges', renderAllergyBadges(p));
  setHTML('cautionCard', renderCautionCard(p, data));

  setHTML('admitReason', `<div style="max-height:140px; overflow-y:auto; font-size:13px; line-height:1.6;">${formatAdmissionSummaryHtml(p.admissionNote || p.admitReason)}</div>`);
  setHTML('nursingProblem', formatMultilineText(data.nursingProblem));

  const h = data.handover || {};
  const combinedLines = [...(h.lines || []), ...(h.tubes || []), ...(h.drains || []), ...(h.vent || [])];
  setHTML('lineTube', renderCurrentLineTubeList(h));

  const hourly = data.hourly || [];
  const vsFlow = hourly.filter((h, i) => i % 4 === 0 || h.event).map(h => {
    const style = h.event ? 'color:#c62828; font-weight:bold; background-color:#ffebee;' : '';
    return `<div style="font-size:11px; margin-bottom:2px; padding:2px; ${style}">
        [${h.time}] BP:${h.vital.bp} / P:${h.vital.hr} / T:${h.vital.bt} / SpO2:${h.vital.spo2 || '-'}%
      </div>`;
  }).join('');
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

  // 🩸 Lab Results (Clickable Categories)
  const labs = data.labs || {};
  let labHtml = '';
  // Flatten for finding abnormals primarily, but render categories
  const categories = Object.keys(labs);
  if (categories.length > 0) {
    labHtml = categories.map(cat =>
      `<div class="lab-link-item" onclick="openLabModal('${p.id}', '${cat}')" style="cursor:pointer; color:#1976d2; margin-bottom:2px; font-weight:bold;">
        ▶ ${cat} 
        <span style="font-size:10px; color:#666; font-weight:normal;">(Click to view)</span>
       </div>`
    ).join('');
  }
  setHTML('labResult', renderLabSummary(p.id, labs));
  setHTML('labSpecial', (data.specials || []).map(item => `• ${item}`).join('<br>') || '-');

  const notesHtml = hourly.flatMap(h => (h.notes || []).map(n => `
    <div style="border-bottom:1px solid #eee; padding:4px 0; font-size:11px;">
      <span style="color:#1976d2; font-weight:bold;">[${h.time}]</span> 
      <span>${n}</span>
    </div>
  `)).join('');
  setHTML('nursingNoteDisplay', notesHtml || '기록 없음');

  // New: Render Doctor Orders
  const doc = data.docOrders || { routine: [], prn: [] };
  let docHtml = '';
  if (doc.routine.length) {
    docHtml += `<div style="margin-bottom:6px;"><div style="color:#2e7d32; font-weight:bold; margin-bottom:2px;">[정규 처방]</div>${doc.routine.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  if (doc.prn.length) {
    docHtml += `<div><div style="color:#d81b60; font-weight:bold; margin-bottom:2px;">[PRN / Notify]</div>${doc.prn.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  setHTML('docOrderList', docHtml || '특이 처방 없음');

  // Update AI Panel
  const aiPtDiv = document.getElementById('aiPanelPatient');
    if (aiPtDiv) aiPtDiv.textContent = `${p.ward ? `${p.ward} · ` : ''}${p.name} (${p.age}/${p.gender}) - ${p.diagnosis}`;
}

// ===== 🤖 AI 스마트 인계 로직 =====
function runAIRangeAnalysis(pid) {
  const summaryTab = document.getElementById('tab-summary');
  summaryTab.innerHTML = '<div class="ai-placeholder" style="padding:20px;">⏳ 분석 중...</div>';

  setTimeout(async () => {
    try {
      const p = await getPatientData(pid);
      const startIdx = parseInt(document.getElementById('aiRangeStart').value);
      const endIdx = parseInt(document.getElementById('aiRangeEnd').value);

      if (startIdx > endIdx) {
        summaryTab.innerHTML = '<div class="ai-placeholder">⚠️ 종료일이 시작일보다 빠를 수 없습니다.</div>';
        return;
      }

      const targetDates = dateList.slice(startIdx, endIdx + 1);
      const startData = p.dailyData[dateList[startIdx]];
      const endData = p.dailyData[dateList[endIdx]];

      if (!startData || !endData) throw new Error("해당 날짜의 데이터가 없습니다.");

      const sbarHTML = generateNarrativeSBAR(p, startData, endData, targetDates);
      const orderHistoryHTML = generateOrderHistory(p, targetDates);

      summaryTab.innerHTML = sbarHTML + orderHistoryHTML;
      renderChecklists(pid, endData);
    } catch (e) {
      console.error(e);
      summaryTab.innerHTML = `<div class="ai-placeholder" style="color:red;">오류: ${e.message}</div>`;
    }
  }, 300);
}

// 📄 서사형 SBAR 생성 (Data-Driven Logic)
function generateNarrativeSBAR(p, startData, endData, dates) {
  const startDateStr = dates[0].slice(5);
  const endDateStr = dates[dates.length - 1].slice(5);
  const story = analyzeClinicalCourse(p, dates);

  // 1. Situation: Patient ID, Diagnosis, Vital Trend, Alert
  // Placeholder for NEWS2 score, assuming it's calculated elsewhere or mocked for now
  const newsScore = 6; // Example value
  const riskLevel = newsScore >= 7 ? 'High Risk (Medical Emergency)' : newsScore >= 5 ? 'Medium Risk (Urgent Response)' : 'Low Risk';

  // Past History Formatting
  const historyList = (endData.pastHistory || []).join(", ");
  const historyHTML = historyList ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>📌 중요 과거력:</b> ${historyList}</div>` : '';

  const situationHTML = `
    <div style="margin-bottom:4px;"><b>환자유형:</b> ${endData.nursingProblem || '-'}</div>
    <div style="margin-bottom:4px;"><b>입원동기:</b> ${p.admissionNote || p.admitReason}</div>
    ${historyHTML}
    <div><b>현재활력:</b> BP ${endData.vital.bp}, HR ${endData.vital.hr}, BT ${endData.vital.bt}, SpO2 ${endData.vital.spo2}%</div>
  `;

  let bgContent = '';
  bgContent += `<div style="margin-bottom:12px; color:#555;">${story.admission}</div>`;

  if (story.events.length > 0) {
    story.events.forEach(e => {
      bgContent += `
            <div style="margin-bottom:10px; padding:8px; background:#f9f9f9; border-left:3px solid #1976d2; border-radius:4px;">
              <div style="font-weight:bold; color:#333; margin-bottom:4px;">📅 ${e.date} (HD#${e.hd}) - ${e.name}</div>
              <div style="line-height:1.5; font-size:13px; color:#444;">${e.narrative}</div>
            </div>
          `;
    });
  } else {
    bgContent += `<div style="padding:5px; color:#666;">• 특이 이벤트 없이 안정적인 경과 유지됨.</div>`;
  }

  const assessmentHTML = `
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:5px;">
      <button class="sbar-link-btn" onclick="openLabModal('${p.id}', 'Hematology')">
        🩸 <b>[진단검사]</b> 누적 검사결과 보기 (Click)
      </button>
      <button class="sbar-link-btn" onclick="alert('PACS Viewer: ${endData.specials && endData.specials.length > 0 ? endData.specials[0] : '최근 영상 없음'}')">
        ☢️ <b>[영상검사]</b> ${endData.specials && endData.specials.length > 0 ? endData.specials.join(', ') : '특이 영상 소견 없음'}
      </button>
      <button class="sbar-link-btn" onclick="alert('협진: ${endData.consults ? endData.consults : '없음'}')">
        👨‍⚕️ <b>[협진내역]</b> ${endData.consults ? endData.consults : '타과 협진 없음'}
      </button>
    </div>
  `;

  // ===== Recommendation Structure Refactoring =====

  // 1. AI Summary (Plan, Safety, Lab/Med Checks, Routine Orders)
  let aiSummaryHTML = '';
  const aiItems = [];

  // Plan & Safety
  if (endData.plan) aiItems.push(...endData.plan);
  if (endData.tMax > 38.0) aiItems.push("발열 지속되므로 Blood Culture f/u 필요");

  // Routine Orders
  if (endData.docOrders && endData.docOrders.routine && endData.docOrders.routine.length > 0) {
    const routineListStr = encodeURIComponent(JSON.stringify(endData.docOrders.routine));
    const dateStr = dates[dates.length - 1];
    aiItems.push(
      `<span style="color:#1976d2; cursor:pointer; text-decoration:underline; font-weight:bold;" onclick="openRoutineModal('${dateStr}', '${routineListStr}')">📋 주치의 루틴 오더 확인 (Click)</span>`
    );
  }

  // Safety Checks
  const allOrders = [...(endData.docOrders?.routine || []), ...(endData.docOrders?.prn || [])];
  const lastLabs = {};
  if (endData.labs) Object.values(endData.labs).forEach(catObj => Object.assign(lastLabs, catObj));

  if (getLabStatus('K', lastLabs['K']).status === 'high') {
    const kMeds = ['Aldactone', 'Spironolactone', 'ACEi', 'ARB', 'Potassium'];
    const conflict = allOrders.find(ord => kMeds.some(km => ord.includes(km)));
    if (conflict) aiItems.push(`⚠️ [Safety] 고칼륨혈증(${lastLabs['K']}) + 칼륨 약물(${conflict})`);
  }
  const currentSBP = parseInt(endData.vital.bp.split('/')[0]);
  if (currentSBP < 90) {
    const htnMeds = ['Nicardipine', 'Betablocker', 'Nitroglycerin', 'Furosemide'];
    const conflict = allOrders.find(ord => htnMeds.some(km => ord.includes(km)));
    if (conflict) aiItems.push(`⚠️ [Safety] 저혈압(${currentSBP}) + 혈압강하제(${conflict})`);
  }
  if (getLabStatus('Plt', lastLabs['Plt']).status === 'low') {
    const bleedMeds = ['Aspirin', 'Plavix', 'Heparin', 'Clexane', 'Warin'];
    const conflict = allOrders.find(ord => bleedMeds.some(km => ord.includes(km)));
    if (conflict) aiItems.push(`⚠️ [Safety] 혈소판감소(${lastLabs['Plt']}) + 출혈위험약물(${conflict})`);
  }

  // Integrate Doctor Orders if important (Notify/Keep/Strict) - Added missing logic from previous revert
  allOrders.forEach(ord => {
    if (ord.includes("Notify") || ord.includes("Keep") || ord.includes("Strict") || ord.includes("Npo") || ord.includes("Isolation")) {
      if (!aiItems.includes(ord)) aiItems.push(ord);
    }
  });

  if (aiItems.length > 0) {
    aiSummaryHTML = `<ul style="padding-left:15px; margin:0; list-style:disc;">
            ${aiItems.map(item => `<li style="margin-bottom:3px;">${item}</li>`).join('')}
        </ul>`;
  }

  // 2. Direct Check (Nursing Tasks)
  let directCheckHTML = '';
  if (endData.nursingTasks && endData.nursingTasks.length > 0) {
    const taskItems = endData.nursingTasks.map(task => {
      const safeDetail = task.detail.replace(/'/g, "\\'");
      return `<li style="margin-bottom:4px;">
            <span style="color:#e65100; cursor:pointer;" onclick="openNoteModal('${task.text}', '${safeDetail}')">
                📋 [확인] ${task.text}
            </span>
          </li>`;
    }).join('');

    directCheckHTML = `<ul style="padding-left:15px; margin-top:8px; list-style:none;">
            ${taskItems}
        </ul>`;
  }

  // 3. To-Do (Removed from Summary as per user request, moved to dedicated Tab)

  return `
    <div class="sbar-section">
      <div class="sbar-header situation">📍 S - Situation</div>
      <div class="sbar-body">${situationHTML}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header background">📋 B - Background</div>
      <div class="sbar-body">${bgContent}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header assessment">🔍 A - Assessment</div>
      <div class="sbar-body">${assessmentHTML}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header recommendation">✅ R - Recommendation</div>
      <div class="sbar-body">
        ${aiSummaryHTML}
        ${directCheckHTML}
      </div>
    </div>
  `;
}

// 🏥 루틴 오더 모달 열기
window.openRoutineModal = function (date, routineListEncoded) {
  const routineList = JSON.parse(decodeURIComponent(routineListEncoded));
  const title = `주치의 루틴 오더 (${date})`;

  let content = `<ul style="padding-left:20px; line-height:1.8;">`;
  routineList.forEach(order => {
    content += `<li>${order}</li>`;
  });
  content += `</ul>`;

  document.getElementById('noteModalTitle').innerText = title;
  document.getElementById('noteModalBody').innerHTML = content;
  document.getElementById('noteModal').classList.add('active');
  document.getElementById('modalOverlay').classList.add('active'); // Ensure overlay is also activated if it exists, matching openNoteModal pattern usually, referencing existing openNoteModal logic
  // Checking openNoteModal above (line 390): it uses 'modalOverlay'
  if (document.getElementById('modalOverlay')) document.getElementById('modalOverlay').classList.add('active');
};

// ✅ To-Do 체크 표시 핸들러
window.toggleTodo = function (checkbox) {
  const parent = checkbox.closest('.todo-item');
  const timeSpan = parent.querySelector('.todo-time');

  if (checkbox.checked) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    timeSpan.innerText = `Checked at ${timeStr}`;
    parent.style.opacity = "0.7";
  } else {
    timeSpan.innerText = "";
    parent.style.opacity = "1";
  }
};

// 📝 간호 기록 모달 열기
window.openNoteModal = function (title, content) {
  document.getElementById('noteModalTitle').innerText = title;
  document.getElementById('noteModalBody').innerText = content; // Use innerText for safety/formatting
  document.getElementById('noteModal').classList.add('active');
  document.getElementById('modalOverlay').classList.add('active');
};

// 🧠 AI 임상 경과 분석 엔진
function analyzeClinicalCourse(p, dates) {
  // 1. Admission Analysis
  const admission = p.admissionNote
    ? `<div style="font-weight:bold; color:#2c3e50; margin-bottom:4px;">[입원경위]</div>${p.admissionNote}`
    : `본 환자는 <b>${p.initialComplaint || p.admitReason}</b> 주호소로 <b>${p.admissionRoute || '응급실'}</b> 통해 내원하였습니다.`;

  // 2. Vital Trend Analysis (Start vs End)
  const startData = p.dailyData[dates[0]];
  const endData = p.dailyData[dates[dates.length - 1]];
  let trendNarrative = "";

  if (startData && endData) {
    const sBP = parseInt(startData.vital.bp.split('/')[0]);
    const eBP = parseInt(endData.vital.bp.split('/')[0]);
    const sHR = parseInt(startData.vital.hr);
    const eHR = parseInt(endData.vital.hr);

    const bpDiff = eBP - sBP;
    if (bpDiff <= -20) trendNarrative += `📉 전일 대비 수축기 혈압이 현저히 감소(${sBP} -> ${eBP})하여 불안정한 혈역학적 상태임. <br>`;
    else if (bpDiff >= 20) trendNarrative += `📈 전일 대비 혈압이 상승(${sBP} -> ${eBP})하는 추세임. <br>`;

    const hrDiff = eHR - sHR;
    if (hrDiff >= 20) trendNarrative += `💓 빈맥(HR ${sHR}->${eHR})이 심화되고 있어 원인 감별 필요함. <br>`;
  }

  // 3. Event Analysis
  const events = [];

  // Add Trend to Events if significant
  if (trendNarrative) {
    events.push({
      date: "Period Analysis",
      hd: "-",
      name: "Vital Trend",
      narrative: trendNarrative
    });
  }

  dates.forEach((d, idx) => {
    const dayData = p.dailyData[d];
    const prevData = idx > 0 ? p.dailyData[dates[idx - 1]] : null;
    let dailyEvent = null;

    // A. 이벤트 탐지
    if (dayData.hourly) {
      dayData.hourly.forEach(h => {
        if (h.event) {
          dailyEvent = {
            date: d.slice(5),
            hd: getHD(p.admitDate, d),
            name: h.event,
            narrative: ""
          };

          // Causality Construction (원인 -> 결과 -> 조치)
          const parts = [];

          // a) 증상 (Note)
          parts.push(`${h.time}경 "${h.notes.find(n => n.includes('EVENT'))?.replace('🔴 [EVENT] ', '') || h.event}" 소견 보여`);

          // b) 조치 (Action) -> 다음 시간대 처치 기록 + New Order 확인
          // New Order Check
          const newOrders = [];
          if (prevData) {
            const curInj = new Set(dayData.orders?.inj?.map(o => typeof o === 'string' ? o : o.text) || []);
            const prevInj = new Set(prevData.orders?.inj?.map(o => typeof o === 'string' ? o : o.text) || []);
            curInj.forEach(o => { if (!prevInj.has(o)) newOrders.push(o); });
          }
          if (newOrders.length > 0) parts.push(`즉시 <b>${newOrders.join(', ')}</b> 투여 시작하였으며`);

          // Nursing Action check
          const actionNote = dayData.hourly.find(hn => hn.notes.some(n => n.includes('Action')))?.notes.find(n => n.includes('Action'));
          if (actionNote) parts.push(`${actionNote.replace('🔵 [Action] ', '')} 시행하였습니다.`);
          else if (newOrders.length === 0) parts.push(`모니터링 강화하였습니다.`);

          // c) 결과 (Result) -> Labs High/Low context
          // Flatten ALL Labs for abnormality check
          const flattenLabs = {};
          if (dayData.labs) {
            Object.values(dayData.labs).forEach(catObj => Object.assign(flattenLabs, catObj));
          }

          // User Request: Remove associated lab findings from narrative
          // const abnormalLabs = [];
          // for (const [k, v] of Object.entries(flattenLabs)) {
          //   const st = getLabStatus(k, v);
          //   if (st.status === 'high') abnormalLabs.push(`${k} 🔼${v}`);
          //   if (st.status === 'low') abnormalLabs.push(`${k} 🔽${v}`);
          // }

          dailyEvent.narrative = parts.join(' ');
        }
      });
    }
    if (dailyEvent) events.push(dailyEvent);
  });

  return { admission, events };
}

// 🩸 [수정완료] Lab 모달 열기 (전역 함수로 등록)
function formatMultilineText(value) {
  if (!value) return '-';
  return String(value)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<div>${line}</div>`)
    .join('') || '-';
}

function stripHtmlTags(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitAdmissionParts(value) {
  return String(value || '')
    .split(/\s*\/\s*|\n+/)
    .map(part => stripHtmlTags(part))
    .filter(Boolean);
}

function formatAdmissionSummaryHtml(value) {
  if (!value) return '-';

  const source = String(value).replace(/<br\s*\/?>/gi, '\n');
  const matches = Array.from(source.matchAll(/<b>(.*?)<\/b>\s*:\s*([^\n]+)/gi));

  if (matches.length) {
    return matches.map((match) => {
      const title = stripHtmlTags(match[1]);
      const lines = splitAdmissionParts(match[2]);
      return `
        <div class="admit-summary-block">
          <div class="admit-summary-title">${escapeHtml(title)}</div>
          ${lines.map((line) => `<div class="admit-summary-line">${escapeHtml(line)}</div>`).join('')}
        </div>
      `;
    }).join('');
  }

  return splitAdmissionParts(source)
    .map((line) => `<div class="admit-summary-line">${escapeHtml(line)}</div>`)
    .join('') || '-';
}

function formatLabValue(value) {
  if (value === null || typeof value === 'undefined' || value === '') return '-';
  const text = String(value);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text).toFixed(2);
  return text.replace(/(-?\d+\.\d{2})\d+/g, '$1');
}

function renderAllergyBadges(patient) {
  const items = patient.allergies || patient.pastAllergies || [];
  if (!items.length) {
    return '<span class="flag-badge" style="background:#eceff1; color:#455a64; border-color:#cfd8dc;">알레르기 정보 없음</span>';
  }
  return items.slice(0, 5).map(item => `<span class="flag-badge">${item}</span>`).join('');
}

function collectCurrentLineTubeItems(handover) {
  const seen = new Set();
  const merged = [
    ...(handover?.lines || []),
    ...(handover?.tubes || []),
    ...(handover?.drains || []),
    ...(handover?.vent || [])
  ];

  return merged.filter((item) => {
    const text = typeof item === 'string' ? item : item?.text;
    if (!text) return false;
    const key = stripHtmlTags(text).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderCurrentLineTubeList(handover) {
  const items = collectCurrentLineTubeItems(handover);
  return items.length ? renderSimpleList(items) : '-';
}

function renderCautionCard(patient, data) {
  const parts = [];
  if (patient.isolation && patient.isolation !== '-') parts.push(`격리: ${patient.isolation}`);
  if (patient.caution && patient.caution !== '-') parts.push(`주의: ${patient.caution}`);
  if (data.docOrders?.prn?.length) parts.push(`알림: ${data.docOrders.prn[0]}`);
  return parts.length ? parts.map(item => `<div>${item}</div>`).join('') : '주의사항 정보 없음';
}

function renderMedSchedule(schedule, meds) {
  const rows = schedule.length ? schedule : meds.slice(0, 8).map(item => {
    const text = typeof item === 'string' ? item : item.text;
    const detail = typeof item === 'string' ? '' : (item.detail || '정규 투약');
    return { time: inferScheduleTime(detail), name: text, detail };
  });

  if (!rows.length) return '-';

  const body = rows.map(row => `<tr><td>${row.time || '-'}</td><td>${row.name}</td><td>${row.detail || '-'}</td></tr>`).join('');
  return `<table class="schedule-table"><thead><tr><th>시간</th><th>약물</th><th>비고</th></tr></thead><tbody>${body}</tbody></table>`;
}

function inferScheduleTime(detail) {
  const text = String(detail || '').toUpperCase();
  if (text.includes('BID')) return '09:00 / 21:00';
  if (text.includes('TID')) return '09:00 / 13:00 / 18:00';
  if (text.includes('QID')) return '09:00 / 13:00 / 17:00 / 21:00';
  if (text.includes('HS')) return '22:00';
  if (text.includes('PRN')) return '필요시';
  if (text.includes('IV')) return '정규 시간 확인';
  return '09:00';
}

function sortLabCategories(categories) {
  const order = ['CBC', '화학검사', '전해질', '간기능', '신장기능', '염증검사', '혈액가스', '응고검사', '요검사', '기타'];
  return [...categories].sort((a, b) => {
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);
    return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
  });
}

function renderLabSummary(pid, labs) {
  const categories = sortLabCategories(Object.keys(labs || {}));
  if (!categories.length) return '-';

  return categories.map(category => {
    const entries = Object.entries(labs[category] || {}).slice(0, 6);
    if (!entries.length) return '';

    const rows = entries.map(([key, rawValue]) => {
      const value = formatLabValue(rawValue);
      const status = getLabStatus(key, value).status;
      const color = status === 'high' ? '#c62828' : status === 'low' ? '#1565c0' : '#333';
      return `<tr>
        <td style="border:1px solid #dcdcdc; padding:4px 6px; font-weight:bold;">${key}</td>
        <td style="border:1px solid #dcdcdc; padding:4px 6px; color:${color}; font-weight:${status === 'normal' ? 'normal' : 'bold'};">${value}</td>
      </tr>`;
    }).join('');

    return `<div style="margin-bottom:8px;">
      <div class="lab-link-item" onclick="openLabModal('${pid}', '${category}')" style="cursor:pointer; color:#1976d2; margin-bottom:4px; font-weight:bold;">${category}</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; background:#fff;">
        <thead>
          <tr style="background:#f3f6fb;">
            <th style="border:1px solid #dcdcdc; padding:4px 6px; text-align:left;">검사항목</th>
            <th style="border:1px solid #dcdcdc; padding:4px 6px; text-align:left;">수치</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');
}

window.openLabModal = async function (pid, category) {
  const p = await getPatientData(pid);
  if (!p) return alert("환자 정보를 찾을 수 없습니다.");

  const modalBody = document.getElementById('labModalBody');
  const modal = document.getElementById('labModal');
  const overlay = document.getElementById('modalOverlay');

  if (!modalBody || !modal || !overlay) {
    return alert("Lab 모달창 요소를 찾을 수 없습니다.");
  }

  const allDates = Object.keys(p.dailyData).sort();

  let targetCategory = category;
  if (!targetCategory) {
    if (p.dailyData[allDates[0]].labs) {
      targetCategory = Object.keys(p.dailyData[allDates[0]].labs)[0];
    }
  }

  const categories = Object.keys(p.dailyData[allDates[0]].labs || {});
  let tabHtml = `<div style="display:flex; gap:5px; margin-bottom:10px; border-bottom:2px solid #ddd; padding-bottom:5px;">`;
  categories.forEach(cat => {
    const activeStyle = cat === targetCategory ? 'background:#1976d2; color:white;' : 'background:#eee; color:#333;';
    tabHtml += `<button onclick="openLabModal('${pid}', '${cat}')" style="border:none; padding:6px 12px; border-radius:15px; cursor:pointer; font-weight:bold; ${activeStyle}">${cat}</button>`;
  });
  tabHtml += `</div>`;


  // 검사 항목 추출 (선택된 카테고리 내)
  let labKeys = [];
  for (let d of allDates) {
    if (p.dailyData[d].labs && p.dailyData[d].labs[targetCategory]) {
      labKeys = Object.keys(p.dailyData[d].labs[targetCategory]);
      break;
    }
  }

  let html = `${tabHtml}<h3 style="margin-bottom:10px;">${p.name}님의 ${targetCategory} 누적 결과</h3>`;
  html += `<div class="modal-table-container" style="overflow-x:auto;"><table class="modal-table">`;

  html += `<thead><tr style="background:#f5f5f5;">
             <th style="min-width:100px; position:sticky; left:0; background:#e0e0e0; z-index:10; border:1px solid #ccc;">검사항목</th>`;
  allDates.forEach(d => {
    html += `<th style="min-width:70px; border:1px solid #ccc; padding:6px;">${d.slice(5)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  labKeys.forEach(key => {
    html += `<tr><td style="font-weight:bold; position:sticky; left:0; background:#f9f9f9; border:1px solid #ccc;">${key}</td>`;
    allDates.forEach(d => {
      // Nested Lookup
      const categoryObj = p.dailyData[d].labs ? p.dailyData[d].labs[targetCategory] : null;
      const val = formatLabValue(categoryObj ? (categoryObj[key] || '-') : '-');

      const st = getLabStatus(key, val);
      let cellStyle = '';
      if (st.status === 'high') cellStyle = 'color:#d32f2f; font-weight:bold;'; // Red
      if (st.status === 'low') cellStyle = 'color:#1976d2; font-weight:bold;';  // Blue

      html += `<td style="border:1px solid #ccc; text-align:center; padding:6px; ${cellStyle}">${val}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;

  modalBody.innerHTML = html;
  modal.classList.add('active');
  overlay.classList.add('active');
};

// 📊 Lab Status Checker (High/Low/Normal)
function getLabStatus(key, val) {
  if (val === '-' || typeof val !== 'string') return { status: 'normal' };

  // Remove notes like "(H)", "(L)" for parsing
  const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return { status: 'normal' };

  let range = { min: -Infinity, max: Infinity };

  // Define Reference Ranges
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

  if (num > range.max) return { status: 'high' };
  if (num < range.min) return { status: 'low' };
  return { status: 'normal' };
}

// Legacy helper removal or update if used elsewhere
function isAbnormal(key, val) {
  return getLabStatus(key, val).status !== 'normal';
}

// 모달 닫기 (전역 함수)
window.closeModal = function (id) {
  document.getElementById(id).classList.remove('active');
  // 오버레이는 닫지 않음 (다른 모달이 있을 수 있으므로)
  // 만약 모든 모달이 닫히면 오버레이도 닫아야 함
  const activeModals = document.querySelectorAll('.detail-modal.active');
  if (activeModals.length === 0) {
    document.getElementById('modalOverlay').classList.remove('active');
  }
};

window.closeAllModals = function () {
  document.querySelectorAll('.detail-modal').forEach(m => m.classList.remove('active'));
  document.getElementById('modalOverlay').classList.remove('active');
};

// 💊 처방 변경 타임라인 (Yesterday -> Today Focus)
function generateOrderHistory(p, dates) {
  if (dates.length < 1) return '<div class="sbar-section"><div class="sbar-body">데이터 부족</div></div>';

  const todayDate = dates[dates.length - 1]; // 선택된 범위의 마지막 날 (기준일)
  const ystDate = dates.length >= 2 ? dates[dates.length - 2] : null;

  const currData = p.dailyData[todayDate] || { orders: { inj: [], po: [] } };
  const prevData = (ystDate && p.dailyData[ystDate]) ? p.dailyData[ystDate] : { orders: { inj: [], po: [] } };

  // Helper to extract name
  const getName = (item) => typeof item === 'string' ? item : item.text;

  // 1. Changes (Yesterday -> Today)
  const prevSet = new Set([...(prevData.orders.inj || []).map(getName), ...(prevData.orders.po || []).map(getName)]);
  const currSet = new Set([...(currData.orders.inj || []).map(getName), ...(currData.orders.po || []).map(getName)]);

  let changesHTML = '';
  const added = [];
  const removed = [];

  currSet.forEach(d => { if (!prevSet.has(d)) added.push(d); });
  prevSet.forEach(d => { if (!currSet.has(d)) removed.push(d); });

  if (added.length > 0 || removed.length > 0) {
    changesHTML += `<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px dashed #ccc;">`;
    changesHTML += `<div style="font-weight:bold; color:#d81b60; margin-bottom:4px;">🔄 변경된 처방 (Yesterday vs Today)</div>`;
    if (added.length) changesHTML += `<div style="font-size:12px; color:#2e7d32;">${added.map(d => `🆕 <b>${d}</b> <span style="color:#666; font-size:11px;">(Today 09:00 시작)</span>`).join('<br>')}</div>`;
    if (removed.length) changesHTML += `<div style="font-size:12px; color:#c62828; margin-top:4px;">${removed.map(d => `❌ <b>${d}</b> <span style="color:#666; font-size:11px;">(Yesterday 18:00 종료)</span>`).join('<br>')}</div>`;
    changesHTML += `</div>`;
  } else {
    changesHTML += `<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px dashed #ccc; color:#666; font-size:12px;">🔄 전일 대비 처방 변경사항 없음.</div>`;
  }

  // 2. Today's Full List with Precise Admin Times
  let timeTableHTML = `<div style="font-weight:bold; color:#e65100; margin-bottom:6px;">🕒 금일 투약 상세 (Today Verified)</div>`;
  timeTableHTML += `<table style="width:100%; font-size:11px; border-collapse:collapse;">`;
  timeTableHTML += `<thead style="background:#fff3e0;"><tr><th style="padding:4px; text-align:left;">약물명</th><th style="padding:4px; text-align:left;">용법</th><th style="padding:4px; text-align:left;">실제 투약 시간</th></tr></thead><tbody>`;

  const allMeds = [...(currData.orders.inj || []), ...(currData.orders.po || [])];

  if (allMeds.length === 0) {
    timeTableHTML += `<tr><td colspan="3" style="padding:8px; text-align:center;">투약 처방 없음</td></tr>`;
  } else {
    allMeds.forEach(med => {
      const name = typeof med === 'string' ? med : med.text;
      const detail = typeof med === 'string' ? '' : med.detail;
      const times = simulateAdminTime(detail || 'QD');

      timeTableHTML += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:4px; font-weight:bold; color:#333;">${name}</td>
          <td style="padding:4px; color:#555;">${detail || '-'}</td>
          <td style="padding:4px; color:#1565c0;">${times}</td>
        </tr>
      `;
    });
  }
  timeTableHTML += `</tbody></table>`;

  return `
    <div class="sbar-section" style="border-color:#ff9800; margin-top:15px;">
      <div class="sbar-header" style="background:#fff3e0; color:#e65100;">💊 약물 처방 현황 (Medication Timeline)</div>
      <div class="sbar-body">
        ${changesHTML}
        ${timeTableHTML}
      </div>
    </div>
  `;
}

// 🕒 투약 시간 시뮬레이션 헬퍼
function simulateAdminTime(usage) {
  const u = usage.toUpperCase();
  if (u.includes("QD")) return "09:00";
  if (u.includes("BID")) return "09:00, 21:00";
  if (u.includes("TID")) return "09:00, 13:00, 18:00";
  if (u.includes("QID")) return "09:00, 13:00, 17:00, 21:00";
  if (u.includes("HS")) return "22:00";
  if (u.includes("PRN")) return "필요 시 (PRN)";
  if (u.includes("IV PUSH")) return "09:00, 17:00, 01:00 (Q8hr)"; // Default assumption for antibiotics
  if (u.includes("RUNNING") || u.includes("MAIN") || u.includes("FLUID")) return "Continuous Infusion";
  if (u.includes("Q8HR")) return "09:00, 17:00, 01:00";
  if (u.includes("Q12HR")) return "09:00, 21:00";
  if (u.includes("TPN")) return "Continuous (18:00 start)";
  return "09:00 (Routine)";
}

// ✅ 직접확인 & 할일 (Enhanced Checklist)
function renderChecklists(pid, data) {
  if (!checklistState[pid]) checklistState[pid] = {};
  const h = data.handover || {};

  let checkHTML = '';
  // 1. 주입 약물 (Rate Check) - Essential
  if (h.drugs?.length) checkHTML += buildCheckSection('💉 주입 약물 (Infusion Rate)', h.drugs, pid, 'drug');

  // 2. 라인 (Insertion Depth & Site)
  if (h.lines?.length) checkHTML += buildCheckSection('🔌 라인 (C-line/Peripheral)', h.lines, pid, 'line');

  // 3. 튜브/배액관 (Drainage Aspect & Amount)
  const tubeItems = [...(h.tubes || []), ...(h.drains || [])];
  if (tubeItems.length) checkHTML += buildCheckSection('🫁 튜브 & 배액관', tubeItems, pid, 'tube');

  // 4. 호흡기 설정 (Vent/O2)
  if (h.vent?.length) checkHTML += buildCheckSection('💨 인공호흡기 & 산소 (Setting)', h.vent, pid, 'vent');

  // 5. 신경학적 사정 (GCS/Pupil)
  if (h.neuro?.length) checkHTML += buildCheckSection('🧠 신경학적 사정 (GCS)', h.neuro, pid, 'neuro');

  // 6. 기타 (Isolation, Restraint)
  if (h.etc?.length) checkHTML += buildCheckSection('⚠️ 기타 확인 (Isolation etc)', h.etc, pid, 'etc');

  document.getElementById('checkListBody').innerHTML = checkHTML || '<div class="no-data">확인할 항목이 없습니다.</div>';

  let todoHTML = '';
  // Use data.todoList from patients.js
  const todoList = data.todoList || [];

  if (todoList.length > 0) {
    const todayItems = todoList.filter(item => item.isToday);
    const futureItems = todoList.filter(item => !item.isToday);

    if (todayItems.length > 0) {
      todoHTML += buildCheckSection('🚨 금일 수행 (Today)', todayItems, pid, 'todo_today', 'urgent-header');
    }
    if (futureItems.length > 0) {
      todoHTML += buildCheckSection('📅 예정 항목', futureItems, pid, 'todo_future');
    }
  }

  // Fallback for legacy data.todo if todoList is empty (optional, but keeping for safety)
  if (!todoList.length) {
    const t = data.todo || {};
    if (t.urgent?.length) todoHTML += buildCheckSection('🚨 Urgent', t.urgent, pid, 'urg', 'urgent-header');
    if (t.scheduled?.length) todoHTML += buildCheckSection('⏰ Scheduled', t.scheduled, pid, 'sch', 'sched-header');
    if (t.routine?.length) todoHTML += buildCheckSection('🔄 Routine', t.routine, pid, 'rou');
    if (t.prn?.length) todoHTML += buildCheckSection('💊 PRN', t.prn, pid, 'prn');
  }

  document.getElementById('todoListBody').innerHTML = todoHTML || '<div class="no-data">할 일이 없습니다.</div>';
}

function buildCheckSection(title, items, pid, prefix, headerClass = '') {
  if (!items || items.length === 0) return '';
  const itemHTML = items.map((item, idx) => {
    const text = typeof item === 'string' ? item : item.text;
    const detail = typeof item === 'string' ? '' : item.detail;
    const key = `${pid}_${prefix}_${idx}`;
    return createCheckItem(key, text, detail, pid);
  }).join('');

  const headerStyle = headerClass === 'urgent-header' ? 'background:#ffebee; color:#c62828;' :
    headerClass === 'sched-header' ? 'background:#e3f2fd; color:#1565c0;' :
      'background:#f5f5f5; color:#333;';

  return `
    <div class="check-section" style="margin-bottom:12px; border:1px solid #ddd; border-radius:6px; overflow:hidden;">
      <div style="padding:8px 12px; font-weight:bold; font-size:12px; ${headerStyle} border-bottom:1px solid #eee;">${title}</div>
      <div style="background:#fff;">${itemHTML}</div>
    </div>`;
}

function createCheckItem(key, text, detail, pid) {
  const timestamp = checklistState[pid][key];
  const isChecked = !!timestamp;
  return `
    <div class="checklist-item ${isChecked ? 'checked' : ''}" onclick="toggleCheck('${pid}', '${key}', this)">
      <div style="display:flex; align-items:center;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} style="pointer-events:none; margin-right:8px;">
        <div style="flex:1">
          <div class="checklist-text" style="font-weight:bold; color:#333;">${text}</div>
          ${detail ? `<div class="checklist-detail" style="font-size:11px; color:#1976d2;">└ ${detail}</div>` : ''}
        </div>
      </div>
      ${isChecked ? `<div class="checklist-time" style="font-size:10px; color:#4caf50; text-align:right; margin-top:2px;">${timestamp} 확인</div>` : ''}
    </div>
  `;
}

function toggleCheck(pid, key, el) {
  const checkbox = el.querySelector('input');
  if (checklistState[pid][key]) {
    delete checklistState[pid][key];
    checkbox.checked = false;
    el.classList.remove('checked');
    const badge = el.querySelector('.checklist-time');
    if (badge) badge.remove();
  } else {
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    checklistState[pid][key] = now;
    checkbox.checked = true;
    el.classList.add('checked');
    el.insertAdjacentHTML('beforeend', `<div class="checklist-time">${now}</div>`);
  }
}

function isAbnormal(key, val) {
  const v = parseFloat(val);
  if (key === 'WBC' && v > 10) return true;
  if (key === 'Hb' && v < 10) return true;
  if (key === 'Plt' && v < 100) return true;
  if (key === 'Cr' && v > 1.5) return true;
  if (key === 'Lactate' && v > 2.0) return true;
  if (key === 'Na' && (v < 135 || v > 150)) return true;
  if (key === 'K' && (v < 3.5 || v > 5.5)) return true;
  if ((key === 'AST' || key === 'ALT') && v > 50) return true;
  return false;
}

function renderMedList(arr) {
  return (arr || []).map(d => {
    const text = typeof d === 'string' ? d : d.text;
    const detail = d.detail ? `<span style="font-size:10px; color:#666; display:block; padding-left:14px;">└ ${d.detail}</span>` : '';
    // 주사/경구 구분은 리스트가 이미 분리되어 들어오므로 아이콘 생략 혹은 범용 아이콘 사용
    // 여기서는 간단히 텍스트만 출력하거나 점(•)을 붙임
    return `<div style="margin-bottom:4px;">• ${text}${detail}</div>`;
  }).join('') || '-';
}

function renderSimpleList(arr) { return (arr || []).map(i => typeof i === 'string' ? `• ${i}` : `• ${i.text} (${i.detail || ''})`).join('<br>'); }
async function selectPatient(pid) {
  selectedPatientId = pid;
  document.querySelectorAll('.pt-row').forEach(row => {
    row.classList.toggle('selected', row.dataset.id === String(pid));
  });
  await updateDashboard(pid);
  setupAIRangeSelectors();
  if (aiPanelOpen) runAIRangeAnalysis(pid);
}
function renderPatientList() {
  const list = document.getElementById('patientList');
  if (!list) return;
  if (!patientStore.length) {
    const errorText = patientLoadError
      ? `합성 FHIR MCP 연결 실패<br><span class="pt-empty-detail">${escapeHtml(patientLoadError)}</span>`
      : '표시할 환자 데이터가 없습니다.';
    list.innerHTML = `<div class="pt-empty">${errorText}</div>`;
    const counter = document.getElementById('patientCount');
      if (counter) counter.textContent = '0';
      return;
    }

  const wardGroups = groupPatientsByWard(patientStore);
  list.innerHTML = wardGroups.map((group) => {
    const rows = group.patients.map((patient) => `
      <div class="pt-row" data-id="${patient.id}" data-ward="${escapeHtml(group.ward)}" onclick="selectPatient('${patient.id}')">
        <span class="room">${escapeHtml(patient.room || '-')}</span>
        <span class="name">${escapeHtml(patient.name || '-')}</span>
      </div>
    `).join('');

    return `
      <section class="pt-ward-group" data-ward="${escapeHtml(group.ward)}">
        <div class="pt-ward-header">
          <span class="pt-ward-name">${escapeHtml(group.ward)}</span>
          <span class="pt-ward-count">${group.patients.length}명</span>
        </div>
        ${rows}
      </section>
    `;
  }).join('');
  document.getElementById('patientCount').textContent = patientStore.length;
}

function buildExternalSourceLabel(payload) {
  if (payload?.source === 'github-pages-public-demo-snapshot') return 'GitHub Pages 정적 합성 FHIR 스냅샷';
  const mode = String(payload?.mcp?.connectionMode || '').trim();
  if (mode === 'server') return '합성 FHIR MCP 서버';
  if (mode === 'direct-fallback') return '합성 FHIR MCP 게이트웨이';
  return '합성 FHIR MCP';
}

function preloadPatientDetailCache(payload) {
  const detailsById = payload?.detailsById || {};
  Object.entries(detailsById).forEach(([id, detail]) => {
    if (detail) {
      patientDetailCache.set(String(id), detail);
    }
  });
}

function buildPatientDataEndpoints() {
  const endpoints = [];
  const remoteApiBase = getConfiguredRemoteApiBase();

  if (remoteApiBase) {
    endpoints.push({
      kind: 'remote-mcp',
      url: buildApiUrl(remoteApiBase, '/api/patients-mcp')
    });
  }

  endpoints.push({
    kind: 'same-origin-mcp',
    url: '/api/patients-mcp'
  });

  return dedupeEndpoints(endpoints);
}

function dedupeEndpoints(endpoints) {
  const seen = new Set();
  return endpoints.filter(endpoint => {
    const key = `${endpoint.kind}:${endpoint.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getConfiguredRemoteApiBase() {
  const configBase = normalizeApiBase(window?.AI_HANDOFF_RUNTIME_CONFIG?.apiBase);
  if (configBase) return configBase;

  const queryBase = normalizeApiBase(getQueryParam('apiBase'));
  if (queryBase) return queryBase;

  return '';
}

function normalizeApiBase(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  return source.replace(/\/+$/, '');
}

function buildApiUrl(base, path) {
  const normalizedBase = normalizeApiBase(base);
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getQueryParam(key) {
  try {
    const params = new URLSearchParams(window?.location?.search || '');
    return params.get(key) || '';
  } catch (error) {
    return '';
  }
}
function openAIPanel() { if (!selectedPatientId) return alert("환자선택필요"); document.getElementById('aiPanel').classList.add('active'); document.getElementById('overlay').classList.add('active'); aiPanelOpen = true; runAIRangeAnalysis(selectedPatientId); }
function closeAIPanel() { document.getElementById('aiPanel').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); aiPanelOpen = false; }
function openAddRecordModal() { if (!selectedPatientId) return; document.getElementById('addRecordModal').classList.add('active'); document.getElementById('modalOverlay').classList.add('active'); document.getElementById('recordTime').value = dateList[currentDateIndex] + " " + new Date().toTimeString().slice(0, 5); }
function saveRecord() { alert("저장됨"); closeAllModals(); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '-'; }
function setHTML(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val || '-'; }
function getHD(start, current) { return Math.floor((new Date(current) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1; }

updateDashboard = async function (pid) {
  let p = null;

  try {
    p = await getPatientData(pid);
  } catch (error) {
    console.error(error);
    return;
  }

  if (!p) return;
  syncDateList(p);
  const dateKey = dateList[currentDateIndex];
  const data = p.dailyData ? p.dailyData[dateKey] : null;
  if (!data) return;

  setText('pName', p.name);
  setText('pRegNo', p.registrationNo);
  setText('pAge', `${p.gender}/${p.age}`);
  setText('pBlood', p.bloodType);
  setText('pBody', p.bodyInfo);
  setHTML('pDiag', p.diagnosis);
  setText('pAdmit', p.admitDate);
    setText('pDoc', formatDoctorDisplay(p));
  setText('pIso', p.isolation);
  setText('pHD', `HD #${getHD(p.admitDate, dateKey)}`);
  setHTML('allergyBadges', renderAllergyBadges(p));
  setHTML('cautionCard', renderCautionCard(p, data));

  const historyStr = (data.pastHistory || []).map(item => `<div>• ${item}</div>`).join('');
  setHTML('pastHistoryList', historyStr || '-');
  setHTML('admitReason', `<div style="max-height:140px; overflow-y:auto; font-size:13px; line-height:1.6;">${formatAdmissionSummaryHtml(p.admissionNote || p.admitReason)}</div>`);
  setHTML('nursingProblem', formatMultilineText(data.nursingProblem));

  const handover = data.handover || {};
  const currentLineTube = [...(handover.lines || []), ...(handover.tubes || []), ...(handover.drains || []), ...(handover.vent || [])];
  setHTML('lineTube', renderCurrentLineTubeList(handover));

  const hourly = data.hourly || [];
  const vsFlow = hourly
    .filter((entry, index) => index % 4 === 0 || entry.event)
    .map(entry => {
      const style = entry.event ? 'color:#c62828; font-weight:bold; background-color:#ffebee;' : '';
      return `<div style="font-size:13px; margin-bottom:2px; padding:2px; ${style}">[${entry.time}] BP:${entry.vital.bp} / P:${entry.vital.hr} / T:${entry.vital.bt} / SpO2:${entry.vital.spo2 || '-'}%</div>`;
    }).join('');
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

  const labs = data.labs || {};
  setHTML('labResult', renderLabSummary(p.id, labs));
  setHTML('labSpecial', (data.specials || []).map(item => `• ${item}`).join('<br>') || '-');

  const notesHtml = hourly.flatMap(entry => (entry.notes || []).map(note => `
    <div style="border-bottom:1px solid #eee; padding:6px 0; font-size:13px; line-height:1.6;">
      <span style="color:#1976d2; font-weight:bold;">[${entry.time}]</span>
      <span>${note}</span>
    </div>
  `)).join('');
  setHTML('nursingNoteDisplay', notesHtml || '기록 없음');

  const doc = data.docOrders || { routine: [], prn: [] };
  let docHtml = '';
  if (doc.routine.length) {
    docHtml += `<div style="margin-bottom:6px;"><div style="color:#2e7d32; font-weight:bold; margin-bottom:2px;">[정규 처방]</div>${doc.routine.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  if (doc.prn.length) {
    docHtml += `<div><div style="color:#d81b60; font-weight:bold; margin-bottom:2px;">[PRN / Notify]</div>${doc.prn.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  setHTML('docOrderList', docHtml || '특이 처방 없음');

const aiPtDiv = document.getElementById('aiPanelPatient');
  if (aiPtDiv) aiPtDiv.textContent = `${p.ward ? `${p.ward} · ` : ''}${p.name} (${p.age}/${p.gender}) - ${p.diagnosis}`;
};

function generateNarrativeSBAR(p, startData, endData, dates) {
  const analysis = buildHandoffAnalysis(p, dates);
  const historyList = (endData.pastHistory || []).join(', ');
  const historyHTML = historyList
    ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>\uc911\uc694 \uacfc\uac70\ub825</b> ${escapeHtml(historyList)}</div>`
    : '';
  const longitudinalSummaryHTML = renderLongitudinalSummaryPanel(analysis.longitudinalSummary);
  const situationItems = analysis.sbarPayload.situation.length
    ? renderHandoffBulletList(analysis.sbarPayload.situation)
    : `<div style="color:#666;">\uc911\ub300\ud55c \uc0c1\ud0dc\ubcc0\ud654\ub294 \ud655\uc778\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.</div>`;
  const backgroundCards = analysis.sbarPayload.background.length
    ? analysis.sbarPayload.background.map((item) => renderBackgroundCard(item)).join('')
    : `<div style="padding:5px; color:#666;">\uc120\ud0dd \uae30\uac04 \ub3d9\uc548 \ud575\uc2ec \ubcc0\ud654\uac00 \ud655\uc778\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.</div>`;
  const assessmentItems = analysis.sbarPayload.assessment.length
    ? renderAssessmentList(analysis.sbarPayload.assessment)
    : `<div style="color:#666;">\uc989\uc2dc \uc6b0\uc120\uc21c\uc704\ub85c \ubd84\ub958\ub41c \ubb38\uc81c\ub294 \uc5c6\uc2b5\ub2c8\ub2e4.</div>`;
  const recommendationItems = analysis.sbarPayload.recommendation.length
    ? renderHandoffBulletList(analysis.sbarPayload.recommendation)
    : `<div style="color:#666;">\ud604\uc7ac \uacc4\ud68d \uc720\uc9c0 \ubc0f routine monitoring \uad8c\uc7a5.</div>`;

  const assessmentHTML = `
    ${assessmentItems}
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      <button class="sbar-link-btn" onclick="openLabModal('${p.id}', 'Hematology')">
        \uc8fc\uc694 \uac80\uc0ac \uacb0\uacfc \uc790\uc138\ud788 \ubcf4\uae30
      </button>
      <button class="sbar-link-btn" onclick="alert('PACS Viewer: ${endData.specials && endData.specials.length > 0 ? endData.specials[0] : '\uc5f0\uacb0\ub41c \uc601\uc0c1 \uc815\ubcf4 \uc5c6\uc74c'}')">
        \uc601\uc0c1 / \ud2b9\uc218 \uac80\uc0ac \ubcf4\uae30
      </button>
      <button class="sbar-link-btn" onclick="alert('\ud611\uc9c4: ${endData.consults ? endData.consults : '\uc815\ubcf4 \uc5c6\uc74c'}')">
        \ud611\uc9c4 \uc694\uccad \ud604\ud669 \ubcf4\uae30
      </button>
    </div>
  `;

  return `
    ${longitudinalSummaryHTML}
    <div class="sbar-section">
      <div class="sbar-header situation">S - Situation</div>
      <div class="sbar-body">
        <div style="margin-bottom:4px;"><b>\ud604\uc7ac \uac04\ud638 \ucd08\uc810:</b> ${escapeHtml(endData.nursingProblem || '-')}</div>
        <div style="margin-bottom:4px;"><b>\uc785\uc6d0 \ubc30\uacbd:</b> ${escapeHtml(normalizeNarrativeText(p.admissionNote || p.admitReason || '-'))}</div>
        ${historyHTML}
        <div style="margin-bottom:8px;"><b>\ud604\uc7ac \ud65c\ub825:</b> BP ${escapeHtml(endData.vital.bp)}, HR ${escapeHtml(String(endData.vital.hr))}, BT ${escapeHtml(String(endData.vital.bt))}, SpO2 ${escapeHtml(String(endData.vital.spo2))}%</div>
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

function renderLongitudinalSummaryPanel(summary) {
  if (!summary || !summary.sections) {
    return `
      <div class="longitudinal-panel">
        <div class="longitudinal-panel-header">
          <div class="longitudinal-panel-title">\u0032\ub2e8\uacc4 \ud575\uc2ec \ud658\uc790\uc694\uc57d</div>
          <div class="longitudinal-panel-subtitle">\uc885\ub2e8 \ub370\uc774\ud130\uac00 \ubd80\uc871\ud574 \uc694\uc57d\uc744 \ub9cc\ub4e4\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.</div>
        </div>
      </div>
    `;
  }

  const chipItems = [
    `${summary.dateRange?.start || '-'} ~ ${summary.dateRange?.end || '-'}`,
    `\ud6c4\ubcf4 ${summary.debug?.candidateCount || 0}\uac1c \ubd84\uc11d`,
    `\ud604\uc7ac \uae30\uc900 ${summary.currentDate || '-'}`
  ];

  return `
    <div class="longitudinal-panel">
      <div class="longitudinal-panel-header">
        <div class="longitudinal-panel-title">\u0032\ub2e8\uacc4 \ud575\uc2ec \ud658\uc790\uc694\uc57d</div>
        <div class="longitudinal-panel-subtitle">n\uc77c\uce58 \ud658\uc790 \ub370\uc774\ud130\ub97c \uc555\ucd95\ud574 \ud604\uc7ac \ubc30\uacbd, \uc9c0\uc18d \ubb38\uc81c, \ub2e4\uc74c \uadfc\ubb34\uc870 \uc778\uacc4 \ucc45\uc784\uc744 \uba3c\uc800 \ubcf4\uc5ec\uc90d\ub2c8\ub2e4.</div>
      </div>
      <div class="longitudinal-panel-body">
        <div class="longitudinal-chip-row">
          ${chipItems.map((item) => `<span class="longitudinal-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="longitudinal-concise">${escapeHtml(summary.conciseSummary || '\uc694\uc57d \uc815\ubcf4 \uc5c6\uc74c')}</div>
        <div class="longitudinal-groups">
          ${renderLongitudinalSummaryGroup('\ud658\uc790 \uc815\uccb4\uc131', '\uc774 \ud658\uc790\uac00 \uc5b4\ub5a4 \ud658\uc790\uc778\uc9c0 \ud30c\uc545\ud558\ub294 \uc601\uc5ed', summary.sections.identity, '\uc815\uccb4\uc131 \uc694\uc57d \uc815\ubcf4 \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\ud604\uc7ac \uad00\ub9ac \ud2c0', '\ud604\uc7ac \uc720\uc9c0 \uc911\uc778 \uad00\ub9ac \uc870\uac74\uacfc \uc8fc\uc758\uc0ac\ud56d', summary.sections.careFrame, '\ud604\uc7ac \uad00\ub9ac \ud2c0 \uc815\ubcf4 \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\uc9c0\uc18d \ud575\uc2ec \ubb38\uc81c', '\uae30\uac04 \uc804\uccb4\uc5d0\uc11c \ub0a8\uc544 \uc788\ub294 \ud575\uc2ec \ubb38\uc81c', summary.sections.persistentConcerns, '\uc9c0\uc18d \ud575\uc2ec \ubb38\uc81c \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\uc9d1\uc911 \uad00\ucc30', '\uc774\ubc88 \uadfc\ubb34\uc870\uac00 \ub354 \uc8fc\uc758\ud574\uc11c \ubcfc \ud56d\ubaa9', summary.sections.watchItems, '\uc9d1\uc911 \uad00\ucc30 \ud56d\ubaa9 \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\uc9c0\uc18d \uc778\uacc4 \ucc45\uc784', '\ub2e4\uc74c \uadfc\ubb34\uc870\uac00 \uc774\uc5b4\ubc1b\uc544\uc57c \ud560 \ucc45\uc784', summary.sections.carryoverItems, '\uc9c0\uc18d \uc778\uacc4 \ucc45\uc784 \uc5c6\uc74c')}
        </div>
      </div>
    </div>
  `;
}

function renderLongitudinalSummaryGroup(title, description, items, emptyText) {
  const body = items && items.length
    ? items.map((item) => renderLongitudinalSummaryItem(item)).join('')
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

function renderLongitudinalSummaryItem(item) {
  const evidence = (item.evidence || []).slice(0, 4).join(', ');
  const sourceDates = (item.sourceDates || []).join(', ');
  const reasoning = (item.reasoning || []).join(' · ');

  return `
    <article class="longitudinal-item">
      <div class="longitudinal-item-top">
        <div class="longitudinal-item-summary">${escapeHtml(item.summary || '-')}</div>
        <span class="longitudinal-band ${longitudinalBandClass(item.importanceBand)}">${escapeHtml(longitudinalBandLabel(item.importanceBand))} · ${Number(item.score || 0)}점</span>
      </div>
      ${item.detail ? `<div class="longitudinal-item-detail">${escapeHtml(item.detail)}</div>` : ''}
      <details class="longitudinal-item-details">
        <summary>\ud310\ub2e8 \uadfc\uac70 \ubcf4\uae30</summary>
        <div class="longitudinal-item-meta"><b>\uadfc\uac70:</b> ${escapeHtml(evidence || 'evidence 부족')}</div>
        <div class="longitudinal-item-meta"><b>\uad00\ucc30 \ub0a0\uc9dc:</b> ${escapeHtml(sourceDates || '-')}</div>
        <div class="longitudinal-item-meta"><b>\uc810\uc218 \ubd84\ud574:</b> ${escapeHtml(reasoning || '-')}</div>
      </details>
    </article>
  `;
}

function longitudinalBandLabel(band) {
  const map = {
    core: '\ud575\uc2ec',
    focus: '\uc9d1\uc911',
    supporting: '\ubcf4\uc870',
    background: '\ubc30\uacbd'
  };
  return map[band] || '\ubc30\uacbd';
}

if (window.handoffAppApi) {
  window.handoffAppApi.generateNarrativeSBAR = generateNarrativeSBAR;
}

function generateNarrativeSBAR(p, startData, endData, dates) {
  const analysis = buildHandoffAnalysis(p, dates);
  const historyList = (endData.pastHistory || []).join(', ');
  const historyHTML = historyList
    ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>중요 과거력</b> ${escapeHtml(historyList)}</div>`
    : '';
  const longitudinalSummaryHTML = renderLongitudinalSummaryPanel(analysis.longitudinalSummary);
  const situationItems = analysis.sbarPayload.situation.length
    ? renderHandoffBulletList(analysis.sbarPayload.situation)
    : `<div style="color:#666;">중대한 상태변화는 확인되지 않았습니다.</div>`;
  const backgroundCards = analysis.sbarPayload.background.length
    ? analysis.sbarPayload.background.map((item) => renderBackgroundCard(item)).join('')
    : `<div style="padding:5px; color:#666;">선택 기간 동안 핵심 변화가 확인되지 않았습니다.</div>`;
  const assessmentItems = analysis.sbarPayload.assessment.length
    ? renderAssessmentList(analysis.sbarPayload.assessment)
    : `<div style="color:#666;">즉시 우선순위로 분류된 문제는 없습니다.</div>`;
  const recommendationItems = analysis.sbarPayload.recommendation.length
    ? renderHandoffBulletList(analysis.sbarPayload.recommendation)
    : `<div style="color:#666;">현재 계획 유지 및 routine monitoring 권장.</div>`;

  const assessmentHTML = `
    ${assessmentItems}
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      <button class="sbar-link-btn" onclick="openLabModal('${p.id}', 'Hematology')">
        주요 검사 결과 자세히 보기
      </button>
      <button class="sbar-link-btn" onclick="alert('PACS Viewer: ${endData.specials && endData.specials.length > 0 ? endData.specials[0] : '연결된 영상 정보 없음'}')">
        영상 / 특수 검사 보기
      </button>
      <button class="sbar-link-btn" onclick="alert('협진: ${endData.consults ? endData.consults : '정보 없음'}')">
        협진 요청 현황 보기
      </button>
    </div>
  `;

  return `
    ${longitudinalSummaryHTML}
    <div class="sbar-section">
      <div class="sbar-header situation">S - Situation</div>
      <div class="sbar-body">
        <div style="margin-bottom:4px;"><b>현재 간호 초점:</b> ${escapeHtml(endData.nursingProblem || '-')}</div>
        <div style="margin-bottom:4px;"><b>입원 배경:</b> ${escapeHtml(normalizeNarrativeText(p.admissionNote || p.admitReason || '-'))}</div>
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

function renderLongitudinalSummaryPanel(summary) {
  if (!summary || !summary.sections) {
    return `
      <div class="longitudinal-panel">
        <div class="longitudinal-panel-header">
          <div class="longitudinal-panel-title">2단계 핵심 환자요약</div>
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

  return `
    <div class="longitudinal-panel">
      <div class="longitudinal-panel-header">
        <div class="longitudinal-panel-title">2단계 핵심 환자요약</div>
        <div class="longitudinal-panel-subtitle">n일치 환자 데이터를 압축해 현재 배경, 지속 문제, 다음 근무조 인계 책임을 먼저 보여줍니다.</div>
      </div>
      <div class="longitudinal-panel-body">
        <div class="longitudinal-chip-row">
          ${chipItems.map((item) => `<span class="longitudinal-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="longitudinal-concise">${escapeHtml(summary.conciseSummary || '요약 정보 없음')}</div>
        <div class="longitudinal-groups">
          ${renderLongitudinalSummaryGroup('환자 정체성', '이 환자가 어떤 환자인지 파악하는 영역', summary.sections.identity, '정체성 요약 정보 없음')}
          ${renderLongitudinalSummaryGroup('현재 관리 틀', '현재 유지 중인 관리 조건과 주의사항', summary.sections.careFrame, '현재 관리 틀 정보 없음')}
          ${renderLongitudinalSummaryGroup('지속 핵심 문제', '기간 전체에서 남아 있는 핵심 문제', summary.sections.persistentConcerns, '지속 핵심 문제 없음')}
          ${renderLongitudinalSummaryGroup('집중 관찰', '이번 근무조가 더 주의해서 볼 항목', summary.sections.watchItems, '집중 관찰 항목 없음')}
          ${renderLongitudinalSummaryGroup('지속 인계 책임', '다음 근무조가 이어받아야 할 책임', summary.sections.carryoverItems, '지속 인계 책임 없음')}
        </div>
      </div>
    </div>
  `;
}

function renderLongitudinalSummaryGroup(title, description, items, emptyText) {
  const body = items && items.length
    ? items.map((item) => renderLongitudinalSummaryItem(item)).join('')
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

function renderLongitudinalSummaryItem(item) {
  const evidence = (item.evidence || []).slice(0, 4).join(', ');
  const sourceDates = (item.sourceDates || []).join(', ');
  const reasoning = (item.reasoning || []).join(' · ');

  return `
    <article class="longitudinal-item">
      <div class="longitudinal-item-top">
        <div class="longitudinal-item-summary">${escapeHtml(item.summary || '-')}</div>
        <span class="longitudinal-band ${longitudinalBandClass(item.importanceBand)}">${escapeHtml(longitudinalBandLabel(item.importanceBand))} · ${Number(item.score || 0)}점</span>
      </div>
      ${item.detail ? `<div class="longitudinal-item-detail">${escapeHtml(item.detail)}</div>` : ''}
      <details class="longitudinal-item-details">
        <summary>판단 근거 보기</summary>
        <div class="longitudinal-item-meta"><b>근거:</b> ${escapeHtml(evidence || 'evidence 부족')}</div>
        <div class="longitudinal-item-meta"><b>관찰 날짜:</b> ${escapeHtml(sourceDates || '-')}</div>
        <div class="longitudinal-item-meta"><b>점수 분해:</b> ${escapeHtml(reasoning || '-')}</div>
      </details>
    </article>
  `;
}

function longitudinalBandClass(band) {
  const map = {
    core: 'core',
    focus: 'focus',
    supporting: 'supporting',
    background: 'background'
  };
  return map[band] || 'background';
}

function longitudinalBandLabel(band) {
  const map = {
    core: '핵심',
    focus: '집중',
    supporting: '보조',
    background: '배경'
  };
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

if (window.handoffAppApi) {
  window.handoffAppApi.buildNormalizedDailyTimeline = buildNormalizedDailyTimeline;
  window.handoffAppApi.buildLongitudinalPatientSummary = buildLongitudinalPatientSummary;
  window.handoffAppApi.buildHandoffAnalysis = buildHandoffAnalysis;
  window.handoffAppApi.generateNarrativeSBAR = generateNarrativeSBAR;
}

function generateNarrativeSBAR(p, startData, endData, dates) {
  const analysis = buildHandoffAnalysis(p, dates);
  const historyList = (endData.pastHistory || []).join(", ");
  const historyHTML = historyList ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>?뱦 以묒슂 怨쇨굅??</b> ${historyList}</div>` : '';
  const situationItems = analysis.sbarPayload.situation.length
    ? renderHandoffBulletList(analysis.sbarPayload.situation)
    : `<div style="color:#666;">중대한 상태변화는 확인되지 않았습니다.</div>`;
  const backgroundCards = analysis.sbarPayload.background.length
    ? analysis.sbarPayload.background.map((item) => renderBackgroundCard(item)).join('')
    : `<div style="padding:5px; color:#666;">선택 기간 동안 인계 우선순위 변화가 크지 않습니다.</div>`;
  const assessmentItems = analysis.sbarPayload.assessment.length
    ? renderAssessmentList(analysis.sbarPayload.assessment)
    : `<div style="color:#666;">즉시 우선순위로 분류된 문제는 없습니다.</div>`;
  const recommendationItems = analysis.sbarPayload.recommendation.length
    ? renderHandoffBulletList(analysis.sbarPayload.recommendation)
    : `<div style="color:#666;">현재 계획 유지 및 routine monitoring 권장.</div>`;

  const assessmentHTML = `
    ${assessmentItems}
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      <button class="sbar-link-btn" onclick="openLabModal('${p.id}', 'Hematology')">
        ?㈇ <b>[吏꾨떒寃??</b> ?꾩쟻 寃?ш껐怨?蹂닿린 (Click)
      </button>
      <button class="sbar-link-btn" onclick="alert('PACS Viewer: ${endData.specials && endData.specials.length > 0 ? endData.specials[0] : '理쒓렐 ?곸긽 ?놁쓬'}')">
        ??툘 <b>[?곸긽寃??]</b> ${endData.specials && endData.specials.length > 0 ? endData.specials.join(', ') : '?뱀씠 ?곸긽 ?뚭껄 ?놁쓬'}
      </button>
      <button class="sbar-link-btn" onclick="alert('?묒쭊: ${endData.consults ? endData.consults : '?놁쓬'}')">
        ?뫅?띯슃截?<b>[?묒쭊?댁뿭]</b> ${endData.consults ? endData.consults : '?怨??묒쭊 ?놁쓬'}
      </button>
    </div>
  `;

  return `
    <div class="sbar-section">
      <div class="sbar-header situation">?뱧 S - Situation</div>
      <div class="sbar-body">
        <div style="margin-bottom:4px;"><b>?섏옄?좏삎:</b> ${endData.nursingProblem || '-'}</div>
        <div style="margin-bottom:4px;"><b>?낆썝?숆린:</b> ${p.admissionNote || p.admitReason}</div>
        ${historyHTML}
        <div style="margin-bottom:8px;"><b>?꾩옱?쒕젰:</b> BP ${endData.vital.bp}, HR ${endData.vital.hr}, BT ${endData.vital.bt}, SpO2 ${endData.vital.spo2}%</div>
        ${situationItems}
      </div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header background">?뱥 B - Background</div>
      <div class="sbar-body">${backgroundCards}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header assessment">?뵇 A - Assessment</div>
      <div class="sbar-body">${assessmentHTML}</div>
    </div>
    <div class="sbar-section">
      <div class="sbar-header recommendation">??R - Recommendation</div>
      <div class="sbar-body">
        ${recommendationItems}
        ${renderRoutineOrderLink(endData, dates)}
      </div>
    </div>
  `;
}

function renderLongitudinalSummaryPanel(summary) {
  if (!summary || !summary.sections) {
    return `
      <div class="longitudinal-panel">
        <div class="longitudinal-panel-header">
          <div class="longitudinal-panel-title">\u0032\ub2e8\uacc4 \ud575\uc2ec \ud658\uc790 \uc694\uc57d</div>
          <div class="longitudinal-panel-subtitle">\uc885\ub2e8 \ub370\uc774\ud130\uac00 \ubd80\uc871\ud574 \uc694\uc57d\uc744 \ub9cc\ub4e4\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.</div>
        </div>
      </div>
    `;
  }

  const chipItems = [
    `${summary.dateRange?.start || '-'} ~ ${summary.dateRange?.end || '-'}`,
    `\ud6c4\ubcf4 ${summary.debug?.candidateCount || 0}\uac1c \ubd84\uc11d`,
    `\ud604\uc7ac \uae30\uc900 ${summary.currentDate || '-'}`
  ];

  return `
    <div class="longitudinal-panel">
      <div class="longitudinal-panel-header">
        <div class="longitudinal-panel-title">\u0032\ub2e8\uacc4 \ud575\uc2ec \ud658\uc790 \uc694\uc57d</div>
        <div class="longitudinal-panel-subtitle">n\uc77c\uce58 \ud658\uc790 \ub370\uc774\ud130\ub97c \uc555\ucd95\ud574 \ud604\uc7ac \ubc30\uacbd, \uc9c0\uc18d \ubb38\uc81c, \ub2e4\uc74c \uadfc\ubb34\uc870 \uc778\uacc4 \ucc45\uc784\uc744 \uba3c\uc800 \ubcf4\uc5ec\uc90d\ub2c8\ub2e4.</div>
      </div>
      <div class="longitudinal-panel-body">
        <div class="longitudinal-chip-row">
          ${chipItems.map((item) => `<span class="longitudinal-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="longitudinal-concise">${escapeHtml(summary.conciseSummary || '\uc694\uc57d \uc815\ubcf4 \uc5c6\uc74c')}</div>
        <div class="longitudinal-groups">
          ${renderLongitudinalSummaryGroup('\ud658\uc790 \uc815\uccb4\uc131', '\uc774 \ud658\uc790\uac00 \uc5b4\ub5a4 \ud658\uc790\uc778\uc9c0 \ud30c\uc545\ud558\ub294 \uc601\uc5ed', summary.sections.identity, '\uc815\uccb4\uc131 \uc694\uc57d \uc815\ubcf4 \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\ud604\uc7ac \uad00\ub9ac \ud2c0', '\ud604\uc7ac \uc720\uc9c0 \uc911\uc778 \uad00\ub9ac \uc870\uac74\uacfc \uc8fc\uc758\uc0ac\ud56d', summary.sections.careFrame, '\ud604\uc7ac \uad00\ub9ac \ud2c0 \uc815\ubcf4 \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\uc9c0\uc18d \ud575\uc2ec \ubb38\uc81c', '\uae30\uac04 \uc804\uccb4\uc5d0\uc11c \ub0a8\uc544 \uc788\ub294 \ud575\uc2ec \ubb38\uc81c', summary.sections.persistentConcerns, '\uc9c0\uc18d \ud575\uc2ec \ubb38\uc81c \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\uc9d1\uc911 \uad00\ucc30', '\uc774\ubc88 \uadfc\ubb34\uc870\uac00 \ub354 \uc8fc\uc758\ud574\uc11c \ubcfc \ud56d\ubaa9', summary.sections.watchItems, '\uc9d1\uc911 \uad00\ucc30 \ud56d\ubaa9 \uc5c6\uc74c')}
          ${renderLongitudinalSummaryGroup('\uc9c0\uc18d \uc778\uacc4 \ucc45\uc784', '\ub2e4\uc74c \uadfc\ubb34\uc870\uac00 \uc774\uc5b4\ubc1b\uc544\uc57c \ud560 \ucc45\uc784', summary.sections.carryoverItems, '\uc9c0\uc18d \uc778\uacc4 \ucc45\uc784 \uc5c6\uc74c')}
        </div>
      </div>
    </div>
  `;
}

function renderLongitudinalSummaryGroup(title, description, items, emptyText) {
  const body = items && items.length
    ? items.map((item) => renderLongitudinalSummaryItem(item)).join('')
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

function renderLongitudinalSummaryItem(item) {
  const evidence = (item.evidence || []).slice(0, 4).join(', ');
  const sourceDates = (item.sourceDates || []).join(', ');
  const reasoning = (item.reasoning || []).join(' / ');
  const score = Number.isFinite(Number(item.score)) ? Number(item.score) : 0;

  return `
    <article class="longitudinal-item">
      <div class="longitudinal-item-top">
        <div class="longitudinal-item-summary">${escapeHtml(item.summary || '-')}</div>
        <span class="longitudinal-band ${longitudinalBandClass(item.importanceBand)}">${escapeHtml(longitudinalBandLabel(item.importanceBand))} / ${score}\uc810</span>
      </div>
      ${item.detail ? `<div class="longitudinal-item-detail">${escapeHtml(item.detail)}</div>` : ''}
      <details class="longitudinal-item-details">
        <summary>\ud310\ub2e8 \uadfc\uac70 \ubcf4\uae30</summary>
        <div class="longitudinal-item-meta"><b>\uadfc\uac70:</b> ${escapeHtml(evidence || 'evidence \ubd80\uc871')}</div>
        <div class="longitudinal-item-meta"><b>\uad00\ucc30 \ub0a0\uc9dc:</b> ${escapeHtml(sourceDates || '-')}</div>
        <div class="longitudinal-item-meta"><b>\uc810\uc218 \ubd84\ud574:</b> ${escapeHtml(reasoning || '-')}</div>
      </details>
    </article>
  `;
}

function longitudinalBandClass(band) {
  const map = {
    core: 'core',
    focus: 'focus',
    supporting: 'supporting',
    background: 'background'
  };
  return map[band] || 'background';
}

function longitudinalBandLabel(band) {
  const map = {
    core: '\ud575\uc2ec',
    focus: '\uc9d1\uc911',
    supporting: '\ubcf4\uc870',
    background: '\ubc30\uacbd'
  };
  return map[band] || '\ubc30\uacbd';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateNarrativeSBAR(p, startData, endData, dates) {
  const analysis = buildHandoffAnalysis(p, dates);
  const historyList = (endData.pastHistory || []).join(', ');
  const historyHTML = historyList
    ? `<div style="margin-bottom:4px; color:#424242; font-size:11px;"><b>\uc911\uc694 \uacfc\uac70\ub825</b> ${escapeHtml(historyList)}</div>`
    : '';
  const longitudinalSummaryHTML = renderLongitudinalSummaryPanel(analysis.longitudinalSummary);
  const situationItems = analysis.sbarPayload.situation.length
    ? renderHandoffBulletList(analysis.sbarPayload.situation)
    : `<div style="color:#666;">\uc911\ub300\ud55c \uc0c1\ud0dc\ubcc0\ud654\ub294 \ud655\uc778\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.</div>`;
  const backgroundCards = analysis.sbarPayload.background.length
    ? analysis.sbarPayload.background.map((item) => renderBackgroundCard(item)).join('')
    : `<div style="padding:5px; color:#666;">\uc120\ud0dd \uae30\uac04 \ub3d9\uc548 \ud575\uc2ec \ubc30\uacbd \ubcc0\ud654\uac00 \ud655\uc778\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.</div>`;
  const assessmentItems = analysis.sbarPayload.assessment.length
    ? renderAssessmentList(analysis.sbarPayload.assessment)
    : `<div style="color:#666;">\uc989\uc2dc \uc6b0\uc120\uc21c\uc704\ub85c \ubd84\ub958\ub41c \ubb38\uc81c\ub294 \uc5c6\uc2b5\ub2c8\ub2e4.</div>`;
  const recommendationItems = analysis.sbarPayload.recommendation.length
    ? renderHandoffBulletList(analysis.sbarPayload.recommendation)
    : `<div style="color:#666;">\ud604\uc7ac \uacc4\ud68d \uc720\uc9c0 \ubc0f routine monitoring \uad8c\uc7a5.</div>`;

  const assessmentHTML = `
    ${assessmentItems}
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      <button class="sbar-link-btn" onclick="openLabModal('${p.id}', 'Hematology')">
        \uc8fc\uc694 \uac80\uc0ac \uacb0\uacfc \uc790\uc138\ud788 \ubcf4\uae30
      </button>
      <button class="sbar-link-btn" onclick="alert('PACS Viewer: ${endData.specials && endData.specials.length > 0 ? endData.specials[0] : '\uc5f0\uacb0\ub41c \uc601\uc0c1 \uc815\ubcf4 \uc5c6\uc74c'}')">
        \uc601\uc0c1 / \ud2b9\uc218 \uac80\uc0ac \ubcf4\uae30
      </button>
      <button class="sbar-link-btn" onclick="alert('\ud611\uc9c4: ${endData.consults ? endData.consults : '\uc815\ubcf4 \uc5c6\uc74c'}')">
        \ud611\uc9c4 \uc694\uccad \ud604\ud669 \ubcf4\uae30
      </button>
    </div>
  `;

  return `
    ${longitudinalSummaryHTML}
    <div class="sbar-section">
      <div class="sbar-header situation">S - Situation</div>
      <div class="sbar-body">
        <div style="margin-bottom:4px;"><b>\ud604\uc7ac \uac04\ud638 \ucd08\uc810:</b> ${escapeHtml(endData.nursingProblem || '-')}</div>
        <div style="margin-bottom:4px;"><b>\uc785\uc6d0 \ubc30\uacbd:</b> ${escapeHtml(normalizeNarrativeText(p.admissionNote || p.admitReason || '-'))}</div>
        ${historyHTML}
        <div style="margin-bottom:8px;"><b>\ud604\uc7ac \ud65c\ub825:</b> BP ${escapeHtml(endData.vital.bp)}, HR ${escapeHtml(String(endData.vital.hr))}, BT ${escapeHtml(String(endData.vital.bt))}, SpO2 ${escapeHtml(String(endData.vital.spo2))}%</div>
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

const LONGITUDINAL_SUMMARY_POLICY = {
  categoryBaseScores: {
    identity: 10,
    care_frame: 9,
    persistent_problem: 10,
    watch_item: 8,
    carryover: 9
  },
  thresholds: {
    core: 26,
    focus: 18,
    supporting: 10
  },
  maxItemsPerSection: {
    identity: 3,
    careFrame: 5,
    persistentConcerns: 4,
    watchItems: 4,
    carryoverItems: 4
  },
  highRiskMedicationKeywords: [
    /insulin/i,
    /heparin/i,
    /warfarin/i,
    /enoxaparin/i,
    /morphine/i,
    /fentanyl/i,
    /hydromorphone/i,
    /potassium|kcl/i,
    /norepinephrine|epinephrine|vasopressin|dobutamine/i,
    /cisplatin|doxorubicin|cyclophosphamide|chemo/i
  ]
};

function buildNormalizedDailyTimeline(patient, dates) {
  return (dates || [])
    .map((date) => normalizeDailySnapshot(patient, date, patient.dailyData?.[date]))
    .filter(Boolean);
}

function buildHandoffAnalysis(patient, dates) {
  const normalizedDailyTimeline = buildNormalizedDailyTimeline(patient, dates);
  const longitudinalSummary = buildLongitudinalPatientSummary(patient, normalizedDailyTimeline);
  const baseline = normalizedDailyTimeline[0] || null;
  const current = normalizedDailyTimeline[normalizedDailyTimeline.length - 1] || null;
  const previous = normalizedDailyTimeline.length > 1 ? normalizedDailyTimeline[normalizedDailyTimeline.length - 2] : null;
  const currentChanges = detectHandoffChanges(previous, current, baseline);
  const timelineEvents = [];

  normalizedDailyTimeline.forEach((snapshot, index) => {
    if (index === 0) return;
    timelineEvents.push(...detectHandoffChanges(normalizedDailyTimeline[index - 1], snapshot, baseline));
  });

  const prioritizedHandoffItems = scoreHandoffEvents(currentChanges, { current, previous });
  return {
    normalizedDailyTimeline,
    longitudinalSummary,
    changeEvents: currentChanges,
    prioritizedHandoffItems,
    sbarPayload: buildSbarPayload(patient, {
      current,
      prioritizedHandoffItems,
      timelineEvents: scoreHandoffEvents(timelineEvents, { current, previous })
    })
  };
}

function normalizeDailySnapshot(patient, date, data) {
  if (!data) return null;
  const meta = data.handoffMeta || {};
  const flatLabs = flattenLabMap(data.labs || {});
  const abnormalLabs = normalizeAbnormalLabEntries(meta.labs?.abnormal, flatLabs);
  const vital = data.vital || { bp: "120/80", hr: 80, bt: 36.8, rr: 18, spo2: 98 };
  const bpParts = String(vital.bp || "120/80").split('/');
  const abnormalFlags = meta.vitals?.abnormalFlags || detectVitalAbnormalFlags(vital);
  const completedActions = unique(meta.nursingActions?.completed || (data.nursingTasks || []).map((task) => typeof task === 'string' ? task : task.text));
  const followUpActions = unique(meta.nursingActions?.followUp || meta.nursingActions?.pending || (data.plan || []));
  const pendingActions = filterCarryoverActionItems(meta.nursingActions?.pending || followUpActions);
  const backgroundFollowUp = followUpActions.filter((item) => !pendingActions.includes(item));
  const lineItems = filterClinicalStatusItems('lines', meta.clinicalStatus?.lines || toItemText(data.handover?.lines || []));
  const tubeItems = filterClinicalStatusItems('tubes', meta.clinicalStatus?.tubes || toItemText(data.handover?.tubes || []));
  const drainItems = filterClinicalStatusItems('drains', meta.clinicalStatus?.drains || toItemText(data.handover?.drains || []));
  const ventItems = filterClinicalStatusItems('vent', meta.clinicalStatus?.vent || toItemText(data.handover?.vent || []));
  const activeOrders = meta.orders?.active || unique([...(data.docOrders?.routine || []), ...(data.docOrders?.prn || [])]);
  const medicationOrders = meta.orders?.medications || {
    inj: toItemText(data.orders?.inj || []),
    po: toItemText(data.orders?.po || []),
    running: []
  };
  const patientHistory = unique([...(data.pastHistory || []), ...(patient.pastHistory || [])]);
  const activeDevices = unique([...lineItems, ...tubeItems, ...drainItems]);
  const activityValue = normalizeActivityValue(meta.clinicalStatus?.activity || data.activity || "-");
  const cautionItems = unique([...(meta.clinicalStatus?.caution || []), ...(patient.caution ? [patient.caution] : [])])
    .map((item) => normalizeClinicalPlaceholderText(item))
    .filter((item) => item && item !== '-');
  const nursingProblem = extractCoreNursingProblem(
    data.nursingProblem,
    meta.clinicalStatus?.diagnoses || [patient.diagnosis].filter(Boolean)
  );
  const specialItems = toNormalizedTextList(data.specials || []);
  const consultItems = toNormalizedTextList(data.consults || []);
  const hourlyItems = Array.isArray(data.hourly) ? data.hourly : [];

  return {
    date,
    patientContext: {
      id: patient.id,
      name: patient.name || "-",
      gender: patient.gender || "-",
      age: patient.age || "-",
      room: patient.room || "-",
      ward: patient.ward || "-",
      diagnosis: normalizeClinicalPlaceholderText(patient.diagnosis),
      admissionReason: normalizeNarrativeText(patient.admissionNote || patient.admitReason || "-"),
      pastHistory: patientHistory,
      diet: normalizeNarrativeText(patient.diet || data.diet || "-")
    },
    nursingProblem,
    clinicalStatus: {
      diagnoses: normalizeDiagnosisItems(meta.clinicalStatus?.diagnoses || [patient.diagnosis]),
      isolation: meta.clinicalStatus?.isolation || patient.isolation || "-",
      activity: activityValue,
      caution: cautionItems,
      lines: lineItems,
      tubes: tubeItems,
      drains: drainItems,
      vent: ventItems,
      activeDevices,
      respiratorySupport: ventItems
    },
    orders: {
      active: activeOrders,
      routine: meta.orders?.routine || (data.docOrders?.routine || []),
      prn: meta.orders?.prn || (data.docOrders?.prn || []),
      medications: medicationOrders,
      counts: {
        active: activeOrders.length,
        routine: (meta.orders?.routine || data.docOrders?.routine || []).length,
        prn: (meta.orders?.prn || data.docOrders?.prn || []).length
      }
    },
    vitals: {
      latest: {
        bp: vital.bp || "120/80",
        systolic: Number(bpParts[0]) || 120,
        diastolic: Number(bpParts[1]) || 80,
        hr: Number(vital.hr) || 80,
        bt: Number(vital.bt) || 36.8,
        rr: Number(vital.rr) || 18,
        spo2: Number(vital.spo2) || 98
      },
      abnormalFlags,
      severityScore: abnormalFlags.length * 2,
      summaryText: buildVitalSummaryText(vital)
    },
    labs: {
      latest: meta.labs?.latest || flatLabs,
      abnormal: abnormalLabs,
      abnormalKeys: abnormalLabs.map((item) => item.key),
      severityScore: abnormalLabs.length,
      summaryText: buildLabSummaryText(abnormalLabs, flatLabs)
    },
    nursingActions: {
      completed: completedActions,
      pending: pendingActions,
      followUp: followUpActions,
      backgroundFollowUp,
      needsRecheck: pendingActions.slice(0, 4),
      completedCount: completedActions.length,
      pendingCount: pendingActions.length,
      followUpCount: followUpActions.length
    },
    carryover: {
      items: pendingActions,
      backgroundItems: backgroundFollowUp,
      hasCarryover: pendingActions.length > 0,
      pendingCount: pendingActions.length
    },
    summarySignals: {
      activeDevices,
      activeRisks: unique([
        ...cautionItems,
        ...abnormalFlags.map(vitalFlagLabel),
        ...abnormalLabs.slice(0, 3).map((item) => `${item.key} ${formatLabValue(String(item.value))}`)
      ])
    },
    sourceRefs: meta.sourceRefs || {},
    specials: specialItems,
    consults: consultItems,
    hourly: hourlyItems,
    docOrders: data.docOrders || { routine: [], prn: [] },
    medSchedule: data.medSchedule || []
  };
}

function buildLongitudinalPatientSummary(patient, normalizedDailyTimeline, policy = LONGITUDINAL_SUMMARY_POLICY) {
  const timeline = normalizedDailyTimeline || [];
  if (!timeline.length) {
    return {
      dateRange: null,
      sections: {
        identity: [],
        careFrame: [],
        persistentConcerns: [],
        watchItems: [],
        carryoverItems: []
      },
      scoredItems: [],
      topItems: [],
      conciseSummary: '요약 가능한 환자 데이터가 없습니다.',
      scorePolicy: policy.thresholds
    };
  }

  const scoredItems = uniqueBy(
    collectLongitudinalSummaryCandidates(patient, timeline, policy)
      .map((item) => scoreLongitudinalSummaryCandidate(item, policy)),
    (item) => item.id
  ).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.sourceDates?.length || 0) - (a.sourceDates?.length || 0);
  });

  const sections = {
    identity: selectLongitudinalSummaryItems(scoredItems, 'identity', policy.maxItemsPerSection.identity, policy.thresholds.supporting),
    careFrame: selectLongitudinalSummaryItems(scoredItems, 'care_frame', policy.maxItemsPerSection.careFrame, policy.thresholds.supporting),
    persistentConcerns: selectLongitudinalSummaryItems(scoredItems, 'persistent_problem', policy.maxItemsPerSection.persistentConcerns, policy.thresholds.supporting),
    watchItems: selectLongitudinalSummaryItems(scoredItems, 'watch_item', policy.maxItemsPerSection.watchItems, policy.thresholds.supporting),
    carryoverItems: selectLongitudinalSummaryItems(scoredItems, 'carryover', policy.maxItemsPerSection.carryoverItems, policy.thresholds.supporting)
  };

  return {
    patientId: patient.id,
    dateRange: {
      start: timeline[0].date,
      end: timeline[timeline.length - 1].date
    },
    currentDate: timeline[timeline.length - 1].date,
    sections,
    scoredItems,
    topItems: scoredItems.filter((item) => item.score >= policy.thresholds.focus).slice(0, 10),
    conciseSummary: buildLongitudinalSummaryNarrative(patient, sections),
    overview: {
      identity: sections.identity.map((item) => item.summary),
      careFrame: sections.careFrame.map((item) => item.summary),
      persistentConcerns: sections.persistentConcerns.map((item) => item.summary),
      watchItems: sections.watchItems.map((item) => item.summary),
      carryoverItems: sections.carryoverItems.map((item) => item.summary)
    },
    scorePolicy: policy.thresholds,
    debug: {
      candidateCount: scoredItems.length,
      sectionCounts: {
        identity: sections.identity.length,
        careFrame: sections.careFrame.length,
        persistentConcerns: sections.persistentConcerns.length,
        watchItems: sections.watchItems.length,
        carryoverItems: sections.carryoverItems.length
      }
    }
  };
}

function collectLongitudinalSummaryCandidates(patient, timeline, policy) {
  return uniqueBy([
    ...buildPatientIdentitySummaryCandidates(patient, timeline),
    ...buildCareFrameSummaryCandidates(timeline),
    ...buildPersistentConcernCandidates(timeline),
    ...buildWatchSummaryCandidates(timeline, policy),
    ...buildCarryoverSummaryCandidates(timeline)
  ], (item) => item.id);
}

function buildPatientIdentitySummaryCandidates(patient, timeline) {
  const current = timeline[timeline.length - 1];
  const candidates = [];
  const diagnosisList = unique(current.clinicalStatus?.diagnoses || [patient.diagnosis].filter(Boolean));
  const diagnosisDates = findTimelineDates(timeline, (snapshot) => overlaps(snapshot.clinicalStatus?.diagnoses || [], diagnosisList));

  if (diagnosisList.length) {
    const diagnosisTemporal = deriveTemporalScores(diagnosisDates.length || timeline.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `identity:diagnosis:${diagnosisList.join('|')}`,
      category: 'identity',
      summary: `환자 정체성: ${diagnosisList.slice(0, 3).join(', ')}`,
      detail: current.nursingProblem && current.nursingProblem !== diagnosisList.join(', ')
        ? `현재 간호 초점: ${current.nursingProblem}`
        : '현재 치료 및 간호의 중심이 되는 진단입니다.',
      evidence: diagnosisList.map((item) => `diagnosis:${item}`),
      sourceDates: diagnosisDates.length ? diagnosisDates : timeline.map((snapshot) => snapshot.date),
      scoreInput: {
        persistence: diagnosisTemporal.persistence,
        actionability: 2,
        safety: clampScore(estimateRiskKeywordScore(current.nursingProblem || diagnosisList.join(' ')), 1, 6),
        nursingDependency: 1,
        recurrence: diagnosisTemporal.recurrence
      }
    }));
  }

  const admissionReason = pickFirstNonEmpty(current.patientContext?.admissionReason, patient.admissionNote, patient.admitReason);
  if (admissionReason) {
    candidates.push(createLongitudinalSummaryCandidate({
      id: `identity:admission:${admissionReason}`,
      category: 'identity',
      summary: `입원 배경: ${truncateText(admissionReason, 72)}`,
      detail: '입원 이유와 치료 시작 맥락을 설명하는 핵심 배경입니다.',
      evidence: ['admission_reason'],
      sourceDates: timeline.map((snapshot) => snapshot.date),
      scoreInput: {
        persistence: 3,
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
      detail: '장기 경과와 간호 시 주의가 필요한 과거력입니다.',
      evidence: historyItems.map((item) => `history:${item}`),
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
      detail: '현재 감염관리 또는 주의사항 틀을 바꾸는 관리 조건입니다.',
      evidence: [`isolation:${current.clinicalStatus.isolation}`],
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

  if (current.clinicalStatus?.activity && current.clinicalStatus.activity !== '-') {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.clinicalStatus?.activity || '-') !== '-');
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `care:activity:${current.clinicalStatus.activity}`,
      category: 'care_frame',
      summary: `활동 수준: ${current.clinicalStatus.activity}`,
      detail: '현재 이동, 체위, 낙상예방 등 간호계획의 기본 틀입니다.',
      evidence: [`activity:${current.clinicalStatus.activity}`],
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 4,
        safety: 2,
        nursingDependency: 3,
        recurrence: temporal.recurrence
      }
    }));
  }

  buildDeviceSummaryCandidate(timeline, 'vent', '호흡 보조/산소', 5, 5, 3).forEach((item) => candidates.push(item));
  buildDeviceSummaryCandidate(timeline, 'lines', '유지 중인 line', 4, 3, 3).forEach((item) => candidates.push(item));
  buildDeviceSummaryCandidate(timeline, 'tubes', '유지 중인 tube', 4, 3, 3).forEach((item) => candidates.push(item));
  buildDeviceSummaryCandidate(timeline, 'drains', '유지 중인 drain', 4, 3, 3).forEach((item) => candidates.push(item));

  if ((current.clinicalStatus?.caution || []).length) {
    const cautionItems = unique(current.clinicalStatus.caution).slice(0, 4);
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.clinicalStatus?.caution || []).length > 0);
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `care:caution:${cautionItems.join('|')}`,
      category: 'care_frame',
      summary: `주의사항: ${cautionItems.join(', ')}`,
      detail: '반복 확인이 필요한 주의사항 또는 위험 요인입니다.',
      evidence: cautionItems.map((item) => `caution:${item}`),
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 3,
        safety: clampScore(estimateRiskKeywordScore(cautionItems.join(' ')), 2, 6),
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

  if (current.nursingProblem && current.nursingProblem !== '-') {
    const temporal = deriveTemporalScores(nursingProblemDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `persistent:nursing_problem:${current.nursingProblem}`,
      category: 'persistent_problem',
      summary: `지속 핵심 문제: ${current.nursingProblem}`,
      detail: `${nursingProblemDates.length || 1}일 범위에서 반복되거나 계속 추적 중인 임상·간호 문제입니다.`,
      evidence: [`nursing_problem:${current.nursingProblem}`],
      sourceDates: nursingProblemDates.length ? nursingProblemDates : [current.date],
      scoreInput: {
        persistence: temporal.persistence,
        actionability: 5,
        safety: clampScore(estimateRiskKeywordScore(current.nursingProblem), 2, 6),
        nursingDependency: 3,
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
  ]);

  if (persistentVitalFlags.length) {
    const sourceDates = findTimelineDates(timeline, (snapshot) => (snapshot.vitals?.abnormalFlags || []).some((flag) => persistentVitalFlags.includes(flag)));
    const temporal = deriveTemporalScores(sourceDates.length);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `persistent:vitals:${persistentVitalFlags.join('|')}`,
      category: 'persistent_problem',
      summary: `반복 활력 이상 경향: ${persistentVitalFlags.map(vitalFlagLabel).join(', ')}`,
      detail: `${sourceDates.length}일 범위에서 반복되거나 현재도 이어지는 활력징후 이상입니다.`,
      evidence: persistentVitalFlags.map((flag) => `vital:${flag}`),
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
    const currentValues = persistentLabKeys.map((key) => `${key} ${formatLabValue(String(current.labs?.latest?.[key] ?? '-'))}`);
    candidates.push(createLongitudinalSummaryCandidate({
      id: `persistent:labs:${persistentLabKeys.join('|')}`,
      category: 'persistent_problem',
      summary: `지속 검사 이상: ${currentValues.join(', ')}`,
      detail: `${sourceDates.length}일 이상 반복되거나 현재도 남아 있는 검사 이상 소견입니다.`,
      evidence: persistentLabKeys.map((key) => `lab:${key}`),
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
      summary: `현재 주의 활력징후: ${currentVitalFlags.map(vitalFlagLabel).join(', ')}`,
      detail: `${current.date} 기준 활력징후 이상으로 현재도 관찰이 필요한 항목입니다.`,
      evidence: currentVitalFlags.map((flag) => `vital:${flag}`),
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
      summary: `현재 주의 검사: ${topLabs.map((item) => `${item.key} ${formatLabValue(String(item.value))}`).join(', ')}`,
      detail: `${current.date} 기준 현재도 확인이 필요한 비정상 검사입니다.`,
      evidence: topLabs.map((item) => `lab:${item.key}`),
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
      summary: `고위험 약물/처치 맥락: ${highRiskOrders.join(', ')}`,
      detail: '다음 근무조가 약물 또는 처치 위험도를 염두에 두고 인계받아야 하는 항목입니다.',
      evidence: highRiskOrders.map((item) => `order:${item}`),
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
    return createLongitudinalSummaryCandidate({
      id: `carryover:${item}`,
      category: 'carryover',
      summary: `지속 인계 필요: ${item}`,
      detail: sourceDates.length > 1
        ? `${sourceDates.length}일 이상 이어진 미완료 또는 후속 확인 항목입니다.`
        : '다음 근무조가 이어받아 확인해야 하는 항목입니다.',
      evidence: [`pending:${item}`],
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
  return [
    createLongitudinalSummaryCandidate({
      id: `care:${key}:${currentItems.join('|')}`,
      category: 'care_frame',
      summary: `${label}: ${currentItems.slice(0, 4).join(', ')}`,
      detail: `현재 ${label} 관리가 유지 중입니다.`,
      evidence: currentItems.map((item) => `${label}:${item}`),
      sourceDates,
      scoreInput: {
        persistence: temporal.persistence,
        actionability,
        safety,
        nursingDependency,
        recurrence: temporal.recurrence
      }
    })
  ];
}

function createLongitudinalSummaryCandidate(input) {
  const evidence = unique((input.evidence || []).filter(Boolean));
  return {
    id: input.id || `${input.category}:${input.summary}`,
    category: input.category,
    summary: input.summary,
    detail: input.detail || '',
    evidence: evidence.length ? evidence : ['evidence 부족'],
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

function scoreLongitudinalSummaryCandidate(candidate, policy) {
  const breakdown = {
    categoryBase: typeof candidate.scoreInput.categoryBase === 'number'
      ? candidate.scoreInput.categoryBase
      : (policy.categoryBaseScores[candidate.category] || 0),
    persistence: clampScore(candidate.scoreInput.persistence, 0, 6),
    actionability: clampScore(candidate.scoreInput.actionability, 0, 6),
    safety: clampScore(candidate.scoreInput.safety, 0, 6),
    nursingDependency: clampScore(candidate.scoreInput.nursingDependency, 0, 4),
    recurrence: clampScore(candidate.scoreInput.recurrence, 0, 3),
    resolvedPenalty: -clampScore(candidate.scoreInput.resolvedPenalty, 0, 6)
  };
  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);

  return {
    ...candidate,
    score,
    scoreBreakdown: breakdown,
    importanceBand: score >= policy.thresholds.core
      ? 'core'
      : score >= policy.thresholds.focus
        ? 'focus'
        : score >= policy.thresholds.supporting
          ? 'supporting'
          : 'background',
    reasoning: buildSummaryReasoning(breakdown)
  };
}

function selectLongitudinalSummaryItems(items, category, maxItems, minimumScore) {
  const candidates = (items || []).filter((item) => item.category === category && item.score >= minimumScore);
  const fallback = candidates.length ? candidates : (items || []).filter((item) => item.category === category);
  return fallback.slice(0, maxItems);
}

function buildLongitudinalSummaryNarrative(patient, sections) {
  const lines = [];
  if (sections.identity[0]?.summary) lines.push(sections.identity[0].summary);
  if (sections.careFrame.length) lines.push(`현재 관리 틀: ${sections.careFrame.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.persistentConcerns.length) lines.push(`지속 문제: ${sections.persistentConcerns.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.watchItems.length) lines.push(`집중 관찰: ${sections.watchItems.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  if (sections.carryoverItems.length) lines.push(`지속 인계: ${sections.carryoverItems.slice(0, 2).map((item) => item.summary).join(' / ')}`);
  return lines.length ? lines.join(' | ') : `${patient.name || '환자'} 요약 정보가 부족합니다.`;
}

function buildSummaryReasoning(breakdown) {
  return Object.entries(breakdown)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${key} ${value > 0 ? '+' : ''}${value}`);
}

function buildVitalSummaryText(vital) {
  return `BP ${vital?.bp || '-'}, HR ${vital?.hr ?? '-'}, BT ${vital?.bt ?? '-'}, RR ${vital?.rr ?? '-'}, SpO2 ${vital?.spo2 ?? '-'}%`;
}

function buildLabSummaryText(abnormalLabs, flatLabs) {
  if (abnormalLabs.length) {
    return abnormalLabs.slice(0, 4).map((item) => `${item.key} ${formatLabValue(String(item.value))}`).join(', ');
  }
  const labKeys = Object.keys(flatLabs || {}).slice(0, 4);
  return labKeys.length ? labKeys.map((key) => `${key} ${formatLabValue(String(flatLabs[key]))}`).join(', ') : '주요 이상 검사 없음';
}

function normalizeAbnormalLabEntries(metaItems, flatLabs) {
  if (!Array.isArray(metaItems) || !metaItems.length) {
    return buildAbnormalLabList(flatLabs);
  }

  return metaItems
    .map((item) => {
      const value = typeof item?.value !== 'undefined' ? item.value : flatLabs?.[item?.key];
      const status = getLabStatus(item?.key, String(value ?? '-')).status;
      return {
        key: item?.key,
        value,
        status
      };
    })
    .filter((item) => item.key && item.status !== 'normal' && typeof item.value !== 'undefined' && item.value !== '-');
}

function deriveTemporalScores(dayCount) {
  const safeDayCount = Math.max(0, Number(dayCount) || 0);
  return {
    persistence: clampScore((safeDayCount - 1) * 2, 0, 6),
    recurrence: clampScore(safeDayCount - 1, 0, 3)
  };
}

function clampScore(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function findTimelineDates(timeline, predicate) {
  return (timeline || []).filter((snapshot) => predicate(snapshot)).map((snapshot) => snapshot.date);
}

function overlaps(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).some((item) => rightSet.has(item));
}

function pickFirstNonEmpty(...values) {
  return values
    .map((value) => typeof value === 'string' ? value.trim() : value)
    .find((value) => Boolean(value)) || '';
}

function truncateText(text, maxLength) {
  const source = String(text || '');
  return source.length > maxLength ? `${source.slice(0, maxLength - 1)}…` : source;
}

function normalizeNarrativeText(text) {
  const source = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*\n\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
  return source || '-';
}

function filterClinicalStatusItems(key, items) {
  return unique(
    (items || [])
      .map((item) => typeof item === 'string' ? item : item?.text)
      .map((item) => normalizeNarrativeText(item))
      .filter((item) => item !== '-' && isMeaningfulDeviceItem(key, item))
  );
}

function filterCarryoverActionItems(items) {
  return unique(
    (items || [])
      .map((item) => normalizeNarrativeText(item))
      .filter((item) => item !== '-' && isMeaningfulCarryoverItem(item))
  );
}

function normalizeActivityValue(text) {
  const source = normalizeNarrativeText(text);
  const lower = source.toLowerCase();
  if (!lower || lower === '-') return '-';

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
  if (exclusionPatterns.some((pattern) => pattern.test(lower))) return '-';

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

  return activityPatterns.some((pattern) => pattern.test(lower)) ? source : '-';
}

function extractCoreNursingProblem(text, fallbackDiagnoses) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => normalizeNarrativeText(line))
    .map((line) => normalizeClinicalPlaceholderText(line))
    .filter((line) => line && line !== '-');

  const focusLines = lines
    .filter((line) => !/요청사항|서비스 요청|검사 요청|\bct\b|\bmri\b|x-ray|ultrasound|therapy|counsel|education|teaching/i.test(line))
    .map((line) => line.replace(/^[-•]\s*/, '').replace(/^(주요 문제|간호 초점|간호계획)\s*:\s*/i, '').trim())
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

function normalizeDiagnosisItems(items) {
  return unique(
    (items || [])
      .map((item) => normalizeClinicalPlaceholderText(item))
      .filter((item) => item && item !== '-')
  );
}

function normalizeClinicalPlaceholderText(text) {
  const source = normalizeNarrativeText(text);
  if (!source || source === '-') return '-';
  if (/fhir 진단 정보 없음|간호문제 정보 없음|외부 fhir 환자|정보 없음|unknown diagnosis/i.test(source)) return '-';
  return source;
}

function isMeaningfulCarryoverItem(text) {
  const source = normalizeNarrativeText(text).toLowerCase();
  if (!source || source === '-') return false;
  if (isGenericFollowUpItem(source)) return false;

  const directActionPatterns = [
    /재확인/,
    /재평가/,
    /확인/,
    /사정/,
    /모니터/,
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
  const responsibilityPatterns = [
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
  const timeSensitiveTargetPatterns = [/\bct\b/, /\bmri\b/, /x-ray/, /ultrasound/, /검사/, /imaging/];
  const timeSensitiveActionPatterns = [/준비/, /결과/, /시행 여부/, /동의/, /이송/, /금식/, /\bnpo\b/, /전처치/];

  if (directActionPatterns.some((pattern) => pattern.test(source))) return true;
  if (responsibilityPatterns.some((pattern) => pattern.test(source))) return true;
  if (timeSensitiveTargetPatterns.some((pattern) => pattern.test(source)) && timeSensitiveActionPatterns.some((pattern) => pattern.test(source))) {
    return true;
  }

  return false;
}

function isGenericFollowUpItem(text) {
  const source = normalizeNarrativeText(text).toLowerCase();
  if (!source || source === '-') return true;

  if (/경과 관찰/.test(source) && !/(활력|혈압|맥박|호흡|산소|혈당|소변|배액|출혈|의식|통증|상처|드레싱|라인|튜브|드레인|검사 결과|투약|약물)/.test(source)) {
    return true;
  }

  if (/\bct\b|\bmri\b|x-ray|ultrasound|lipid panel|complete blood count|서비스 요청|검사 요청/.test(source) &&
    !/(준비|확인|재확인|결과|시행 여부|동의|이송|금식|전처치)/.test(source)) {
    return true;
  }

  return false;
}

function vitalFlagLabel(flag) {
  const labels = {
    bp: '혈압',
    hr: '심박수',
    bt: '체온',
    rr: '호흡수',
    spo2: '산소포화도'
  };
  return labels[flag] || flag;
}

function estimateRiskKeywordScore(text) {
  const source = String(text || '').toLowerCase();
  let score = 0;
  if (/산소|spo2|resp|호흡|vent|기도|rr/.test(source)) score += 3;
  if (/혈압|bp|심박|hr|shock|출혈|bleed|arrhythm|부정맥/.test(source)) score += 2;
  if (/감염|격리|sepsis|fever|열|crp|wbc/.test(source)) score += 2;
  if (/insulin|heparin|warfarin|kcl|potassium|morphine|fentanyl|vasopress|norepinephrine|epinephrine|chemo/.test(source)) score += 2;
  return clampScore(score, 0, 6);
}

function estimateLabRiskScore(keys) {
  const highRiskKeys = ['K', 'Na', 'Cr', 'Hb', 'WBC', 'Plt', 'CRP', 'BUN'];
  const matched = (keys || []).filter((key) => highRiskKeys.includes(String(key)));
  return clampScore(Math.max(2, matched.length * 2), 0, 6);
}

function isHighRiskMedication(orderText, policy) {
  return (policy.highRiskMedicationKeywords || []).some((pattern) => pattern.test(String(orderText || '')));
}

function isMeaningfulDeviceItem(key, item) {
  const text = normalizeNarrativeText(item).toLowerCase();
  if (!text) return false;

  const commonExclusions = [
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
    /\bconsult\b/,
    /\bencounter\b/,
    /\bstent\b/,
    /arterial blood/,
    /oxygen saturation/,
    /\bspo2\b/,
    /\bcontrast\b/
  ];
  if (commonExclusions.some((pattern) => pattern.test(text))) return false;

  if (key === 'vent') {
    if (/room air|^ra$|없음|none|no o2/.test(text)) return false;
    return /ventilator|\bvent\b|trach|tracheost|intubat|nasal cannula|non-rebreather|\bhfnc\b|high flow|\becmo\b|\bcpap\b|\bbipap\b|oxygen therapy|\bo2\b|oxygen/.test(text);
  }

  if (key === 'lines') {
    return /peripheral iv|\bmidline\b|\bpicc\b|central line|\bcvc\b|\bport\b|arterial line|\ba-line\b|\biv\b/.test(text);
  }

  if (key === 'tubes') {
    return /\bfoley\b|\bcatheter\b|\bng\b|\bog\b|\bpeg\b|\bg-tube\b|feeding tube|urinary catheter|\btube\b/.test(text)
      && !/chest tube|drain|hemovac|jackson-pratt|\bjp\b/.test(text);
  }

  if (key === 'drains') {
    return /\bdrain\b|hemovac|\bjp\b|jackson-pratt|chest tube|biliary drain|nephrostomy/.test(text);
  }

  return true;
}

function detectHandoffChanges(prev, curr, baseline) {
  if (!curr) return [];
  const previous = prev || { clinicalStatus: {}, orders: { active: [] }, vitals: { latest: {} }, labs: { latest: {} }, nursingActions: { completed: [], pending: [] } };
  const events = [];
  const prevOrders = new Set(previous.orders.active || []);
  const currOrders = new Set(curr.orders.active || []);

  buildStatusChangeEvents(previous, curr).forEach((item) => events.push(item));

  [...currOrders].filter((item) => !prevOrders.has(item)).slice(0, 4).forEach((item) => {
    events.push(createHandoffEvent('new_order', curr.date, `신규 오더 추가: ${item}`, '직전 날짜 대비 새 활성 오더입니다.', [`order:${item}`], 'situation'));
  });

  [...prevOrders].filter((item) => !currOrders.has(item)).slice(0, 4).forEach((item) => {
    events.push(createHandoffEvent('discontinued_order', curr.date, `중단 오더 확인: ${item}`, '직전 날짜에는 있었으나 현재 활성 오더에서 제외되었습니다.', [`order:${item}`], 'recommendation'));
  });

  detectVitalEvents(previous, curr, baseline).forEach((item) => events.push(item));
  detectLabEvents(previous, curr).forEach((item) => events.push(item));
  detectNursingActionEvents(previous, curr).forEach((item) => events.push(item));
  return events;
}

function buildStatusChangeEvents(prev, curr) {
  const events = [];
  const compareList = (typeLabel, beforeList, afterList) => {
    const before = new Set(beforeList || []);
    const after = new Set(afterList || []);
    const added = [...after].filter((item) => !before.has(item));
    const removed = [...before].filter((item) => !after.has(item));
    if (added.length) {
      events.push(createHandoffEvent('status_change', curr.date, `${typeLabel} 추가: ${added.join(', ')}`, `${typeLabel} 상태가 새로 확인되었습니다.`, added.map((item) => `${typeLabel}:${item}`), 'situation'));
    }
    if (removed.length) {
      events.push(createHandoffEvent('status_change', curr.date, `${typeLabel} 제거: ${removed.join(', ')}`, `${typeLabel} 상태가 해제 또는 종료되었습니다.`, removed.map((item) => `${typeLabel}:${item}`), 'background'));
    }
  };

  if ((prev.clinicalStatus?.activity || '-') !== (curr.clinicalStatus?.activity || '-')) {
    events.push(createHandoffEvent('status_change', curr.date, `활동 수준 변화: ${prev.clinicalStatus?.activity || '-'} -> ${curr.clinicalStatus?.activity || '-'}`, '환자 활동 또는 안정 수준이 변경되었습니다.', ['activity'], 'situation'));
  }
  if ((prev.clinicalStatus?.isolation || '-') !== (curr.clinicalStatus?.isolation || '-')) {
    events.push(createHandoffEvent('status_change', curr.date, `격리/주의 변화: ${prev.clinicalStatus?.isolation || '-'} -> ${curr.clinicalStatus?.isolation || '-'}`, '격리 또는 감염 관련 주의사항이 변경되었습니다.', ['isolation'], 'situation'));
  }

  compareList('Line', prev.clinicalStatus?.lines, curr.clinicalStatus?.lines);
  compareList('Tube', prev.clinicalStatus?.tubes, curr.clinicalStatus?.tubes);
  compareList('Drain', prev.clinicalStatus?.drains, curr.clinicalStatus?.drains);
  compareList('Vent/O2', prev.clinicalStatus?.vent, curr.clinicalStatus?.vent);
  return events;
}

function detectVitalEvents(prev, curr, baseline) {
  const events = [];
  const vital = curr.vitals?.latest || {};
  const prevVital = prev.vitals?.latest || {};
  const baseVital = baseline?.vitals?.latest || prevVital;
  const abnormalFlags = curr.vitals?.abnormalFlags || [];

  if (abnormalFlags.length) {
    events.push(createHandoffEvent('vital_abnormal', curr.date, `활력징후 이상: BP ${vital.bp}, HR ${vital.hr}, BT ${vital.bt}, SpO2 ${vital.spo2}%`, `이상 항목: ${abnormalFlags.join(', ')}`, abnormalFlags.map((item) => `vital:${item}`), 'situation'));
  }

  [
    { key: 'systolic', label: '수축기 혈압', threshold: 20 },
    { key: 'hr', label: '심박수', threshold: 20 },
    { key: 'bt', label: '체온', threshold: 1 },
    { key: 'spo2', label: '산소포화도', threshold: 3 }
  ].forEach(({ key, label, threshold }) => {
    const prevValue = Number(prevVital[key]);
    const currValue = Number(vital[key]);
    const baseValue = Number(baseVital[key]);
    if (Number.isFinite(prevValue) && Number.isFinite(currValue) && Math.abs(currValue - prevValue) >= threshold) {
      events.push(createHandoffEvent('vital_abnormal', curr.date, `${label} 변화: ${prevValue} -> ${currValue}`, '직전 날짜 대비 유의한 활력 변화입니다.', [`vital:${key}`], 'assessment'));
    } else if (Number.isFinite(baseValue) && Number.isFinite(currValue) && Math.abs(currValue - baseValue) >= threshold) {
      events.push(createHandoffEvent('vital_abnormal', curr.date, `${label} baseline 대비 변화: ${baseValue} -> ${currValue}`, '기준 시점 대비 유의한 활력 변화입니다.', [`vital:${key}`], 'assessment'));
    }
  });

  return uniqueBy(events, (item) => `${item.type}-${item.summary}`);
}

function detectLabEvents(prev, curr) {
  const events = [];
  const prevLabs = prev.labs?.latest || {};
  const currLabs = curr.labs?.latest || {};

  unique([...Object.keys(prevLabs), ...Object.keys(currLabs)]).forEach((key) => {
    const prevValue = prevLabs[key];
    const currValue = currLabs[key];
    if (typeof currValue === 'undefined' || currValue === '-') return;
    const prevStatus = getLabStatus(key, String(prevValue || '-')).status;
    const currStatus = getLabStatus(key, String(currValue)).status;
    const numericPrev = parseFloat(String(prevValue || '').replace(/[^0-9.-]/g, ''));
    const numericCurr = parseFloat(String(currValue || '').replace(/[^0-9.-]/g, ''));

    if (currStatus !== 'normal' && prevStatus === 'normal') {
      events.push(createHandoffEvent('lab_change', curr.date, `검사 이상 전환: ${key} ${formatLabValue(String(currValue))}`, '정상에서 비정상으로 전환된 검사입니다.', [`lab:${key}`], 'assessment'));
    } else if (currStatus !== 'normal' && prevStatus === currStatus && Number.isFinite(numericPrev) && Number.isFinite(numericCurr) && Math.abs(numericCurr - numericPrev) > 0) {
      const direction = numericCurr > numericPrev ? '악화/상승' : '호전/감소';
      events.push(createHandoffEvent('lab_change', curr.date, `주요 검사 변화: ${key} ${numericPrev} -> ${numericCurr}`, `비정상 상태가 지속되며 ${direction} 추세입니다.`, [`lab:${key}`], 'assessment'));
    }
  });

  return uniqueBy(events, (item) => `${item.type}-${item.summary}`);
}

function detectNursingActionEvents(prev, curr) {
  const events = [];
  const prevCompleted = new Set(prev.nursingActions?.completed || []);

  (curr.nursingActions?.completed || []).filter((item) => !prevCompleted.has(item)).slice(0, 3).forEach((item) => {
    events.push(createHandoffEvent('nursing_action', curr.date, `간호 수행 확인: ${item}`, '당일 새로 수행 또는 기록 확인된 간호 항목입니다.', [`nursing:${item}`], 'background'));
  });

  (curr.nursingActions?.pending || []).slice(0, 4).forEach((item) => {
    events.push(createHandoffEvent('nursing_action', curr.date, `다음 근무조 확인 필요: ${item}`, '현재 follow-up 또는 재확인이 필요한 간호/처치 항목입니다.', [`pending:${item}`], 'recommendation'));
  });

  return uniqueBy(events, (item) => `${item.type}-${item.summary}`);
}

function createHandoffEvent(type, date, summary, detail, evidence, sbarSection) {
  return {
    type,
    date,
    summary,
    detail,
    evidence: evidence && evidence.length ? evidence : ['evidence 부족'],
    sbarSection
  };
}

function scoreHandoffEvents(events, context) {
  const weights = {
    status_change: 100,
    new_order: 90,
    discontinued_order: 85,
    vital_abnormal: 80,
    lab_change: 75,
    nursing_action: 60
  };

  return (events || []).map((item) => {
    let score = weights[item.type] || 50;
    const text = `${item.summary} ${item.detail}`.toLowerCase();
    if (item.type === 'vital_abnormal' && /spo2|bp|hr|bt/.test(text)) score += 12;
    if (item.type === 'status_change' && /vent|o2|drain|line|tube|격리/.test(text)) score += 10;
    if (item.type === 'lab_change' && /k|na|cr|plt|wbc|hb/.test(text)) score += 8;
    if ((item.evidence || []).length > 1) score += 3;
    if (context?.current?.date === item.date) score += 5;

    return {
      ...item,
      score,
      priorityBand: score >= 100 ? 'urgent' : score >= 85 ? 'high' : score >= 70 ? 'moderate' : 'routine'
    };
  }).sort((a, b) => b.score - a.score);
}

function buildSbarPayload(patient, analysis) {
  const current = analysis.current;
  const prioritized = analysis.prioritizedHandoffItems || [];
  const situation = prioritized.filter((item) => item.sbarSection === 'situation').slice(0, 3);
  const assessment = prioritized.filter((item) => item.sbarSection === 'assessment').slice(0, 4);
  const recommendation = prioritized.filter((item) => item.sbarSection === 'recommendation').slice(0, 5);
  const background = uniqueBy(analysis.timelineEvents || [], (item) => `${item.date}-${item.summary}`).slice(0, 6).map((item) => ({
    ...item,
    hd: getHD(patient.admitDate, item.date)
  }));

  if (!situation.length && current) {
    situation.push({
      summary: `현재 활력: BP ${current.vitals.latest.bp}, HR ${current.vitals.latest.hr}, BT ${current.vitals.latest.bt}, SpO2 ${current.vitals.latest.spo2}%`,
      detail: current.vitals.abnormalFlags.length ? `이상 항목: ${current.vitals.abnormalFlags.join(', ')}` : '현재 활력 이상 플래그는 없습니다.',
      priorityBand: current.vitals.abnormalFlags.length ? 'high' : 'routine'
    });
  }

  if (!recommendation.length && current) {
    (current.nursingActions?.pending || []).slice(0, 3).forEach((item) => {
      recommendation.push({
        summary: `인계 후 추적 필요: ${item}`,
        detail: '다음 근무조에서 완료 여부를 재확인합니다.',
        priorityBand: 'moderate'
      });
    });
  }

  return { situation, background, assessment, recommendation };
}

function renderHandoffBulletList(items) {
  return `<ul style="padding-left:15px; margin:0; list-style:disc;">${items.map((item) => `
    <li style="margin-bottom:6px;">
      <div style="font-weight:bold; color:${handoffPriorityColor(item.priorityBand)};">${item.summary}</div>
      <div style="font-size:12px; color:#555;">${item.detail || '-'}</div>
    </li>
  `).join('')}</ul>`;
}

function renderAssessmentList(items) {
  return `<div style="display:flex; flex-direction:column; gap:8px;">${items.map((item) => `
    <div style="padding:8px 10px; border-radius:8px; background:#f8fafc; border-left:4px solid ${handoffPriorityColor(item.priorityBand)};">
      <div style="font-weight:bold; color:#263238;">${item.summary}</div>
      <div style="font-size:12px; color:#546e7a; margin-top:3px;">${item.detail || '-'}</div>
    </div>
  `).join('')}</div>`;
}

function renderBackgroundCard(item) {
  return `
    <div style="margin-bottom:10px; padding:8px; background:#f9f9f9; border-left:3px solid ${handoffPriorityColor(item.priorityBand)}; border-radius:4px;">
      <div style="font-weight:bold; color:#333; margin-bottom:4px;">?뱟 ${String(item.date).slice(5)} (HD#${item.hd || '-'})</div>
      <div style="line-height:1.5; font-size:13px; color:#444;">${item.summary}</div>
      <div style="line-height:1.5; font-size:12px; color:#666; margin-top:3px;">${item.detail || ''}</div>
    </div>
  `;
}

function renderRoutineOrderLink(endData, dates) {
  if (!(endData.docOrders && endData.docOrders.routine && endData.docOrders.routine.length > 0)) return '';
  const routineListStr = encodeURIComponent(JSON.stringify(endData.docOrders.routine));
  const dateStr = dates[dates.length - 1];
  return `
    <div style="margin-top:10px;">
      <span style="color:#1976d2; cursor:pointer; text-decoration:underline; font-weight:bold;" onclick="openRoutineModal('${dateStr}', '${routineListStr}')">
        ?뱥 二쇱튂??猷⑦떞 ?ㅻ뜑 ?뺤씤 (Click)
      </span>
    </div>
  `;
}

function handoffPriorityColor(priorityBand) {
  if (priorityBand === 'urgent') return '#c62828';
  if (priorityBand === 'high') return '#ef6c00';
  if (priorityBand === 'moderate') return '#1565c0';
  return '#546e7a';
}

function toItemText(items) {
  return (items || []).map((item) => typeof item === 'string' ? item : item.text).filter(Boolean);
}

function detectVitalAbnormalFlags(vital) {
  const bpParts = String(vital?.bp || '120/80').split('/');
  const systolic = Number(bpParts[0]) || 120;
  const hr = Number(vital?.hr) || 80;
  const bt = Number(vital?.bt) || 36.8;
  const rr = Number(vital?.rr) || 18;
  const spo2 = Number(vital?.spo2) || 98;
  const flags = [];

  if (systolic < 90 || systolic >= 180) flags.push('bp');
  if (hr < 50 || hr >= 120) flags.push('hr');
  if (bt >= 38 || bt < 36) flags.push('bt');
  if (rr >= 24 || rr < 10) flags.push('rr');
  if (spo2 < 92) flags.push('spo2');
  return flags;
}

function buildAbnormalLabList(flatLabs) {
  return Object.keys(flatLabs || {}).map((key) => ({
    key,
    value: flatLabs[key],
    status: getLabStatus(key, String(flatLabs[key])).status
  })).filter((item) => item.status !== 'normal');
}

function flattenLabMap(labs) {
  const result = {};
  Object.values(labs || {}).forEach((category) => Object.assign(result, category || {}));
  return result;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

openAIPanel = function () {
  if (!selectedPatientId) return alert("환자를 먼저 선택해주세요.");
  document.getElementById('aiPanel').classList.add('active');
  document.getElementById('overlay').classList.add('active');
  aiPanelOpen = true;
  runAIRangeAnalysis(selectedPatientId);
};

openAddRecordModal = function () {
  if (!selectedPatientId) return;
  const now = getKoreanNowParts();
  document.getElementById('addRecordModal').classList.add('active');
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('recordTime').value = `${dateList[currentDateIndex]} ${now.time}`;
};

saveRecord = function () {
  alert("저장되었습니다.");
  closeAllModals();
};

renderMedList = function (arr) {
  return (arr || []).map(d => {
    const text = typeof d === 'string' ? d : d.text;
    const detail = d && d.detail ? `<span style="font-size:12px; color:#666; display:block; padding-left:14px;">- ${d.detail}</span>` : '';
    return `<div style="margin-bottom:4px;">• ${text}${detail}</div>`;
  }).join('') || '-';
};

renderSimpleList = function (arr) {
  return (arr || []).map(i => typeof i === 'string' ? `• ${i}` : `• ${i.text}${i.detail ? ` (${i.detail})` : ''}`).join('<br>');
};

function enhanceNursingNote(note) {
  const text = String(note || '');
  if (text.includes('RN')) return text;
  if (text.includes('투약')) return `${text}. 투약 후 반응 관찰함.`;
  if (text.includes('관찰')) return `${text}. 이상 반응 여부 지속 확인함.`;
  if (text.includes('검사')) return `${text}. 결과 확인 후 주치의 지시 여부 확인함.`;
  return `${text}. 환자 상태 재평가 및 기록함.`;
}

updateDashboard = async function (pid) {
  let p = null;

  try {
    p = await getPatientData(pid);
  } catch (error) {
    console.error(error);
    return;
  }

  if (!p) return;
  syncDateList(p);
  const dateKey = dateList[currentDateIndex];
  const data = p.dailyData ? p.dailyData[dateKey] : null;
  if (!data) return;

  setText('pName', p.name);
  setText('pRegNo', p.registrationNo);
  setText('pAge', `${p.gender}/${p.age}`);
  setText('pBlood', p.bloodType);
  setText('pBody', p.bodyInfo);
  setHTML('pDiag', p.diagnosis);
  setText('pAdmit', p.admitDate);
    setText('pDoc', formatDoctorDisplay(p));
  setText('pIso', p.isolation);
  setText('pHD', `HD #${getHD(p.admitDate, dateKey)}`);
  setHTML('allergyBadges', renderAllergyBadges(p));
  setHTML('cautionCard', renderCautionCard(p, data));

  const historyStr = (data.pastHistory || []).map(item => `<div>• ${item}</div>`).join('');
  setHTML('pastHistoryList', historyStr || '-');
  setHTML('admitReason', `<div style="max-height:140px; overflow-y:auto; font-size:13px; line-height:1.6;">${formatAdmissionSummaryHtml(p.admissionNote || p.admitReason)}</div>`);
  setHTML('nursingProblem', formatMultilineText(data.nursingProblem));

  const handover = data.handover || {};
  const currentLineTube = [...(handover.lines || []), ...(handover.tubes || []), ...(handover.drains || []), ...(handover.vent || [])];
  setHTML('lineTube', renderCurrentLineTubeList(handover));

  const hourly = data.hourly || [];
  const vsFlow = hourly
    .filter((entry, index) => index % 4 === 0 || entry.event)
    .map(entry => {
      const style = entry.event ? 'color:#c62828; font-weight:bold; background-color:#ffebee;' : '';
      return `<div style="font-size:13px; margin-bottom:2px; padding:2px; ${style}">[${entry.time}] BP:${entry.vital.bp} / P:${entry.vital.hr} / T:${entry.vital.bt} / SpO2:${entry.vital.spo2 || '-'}%</div>`;
    }).join('');
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

  const labs = data.labs || {};
  setHTML('labResult', renderLabSummary(p.id, labs));
  setHTML('labSpecial', (data.specials || []).map(item => `• ${item}`).join('<br>') || '-');

  const notesHtml = hourly.flatMap(entry => (entry.notes || []).map(note => {
    const nurseMatch = String(note).match(/\(([^)]+RN)\)$/);
    const nurseBadge = nurseMatch ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; border-radius:999px; background:#e3f2fd; color:#0d47a1; font-weight:bold;">${nurseMatch[1]}</span>` : '';
    const cleaned = String(note).replace(/\s*\([^)]+RN\)$/, '');
    return `
      <div style="border-bottom:1px solid #eee; padding:8px 0; font-size:13px; line-height:1.7;">
        <span style="color:#1976d2; font-weight:bold;">[${entry.time}]</span>
        ${nurseBadge}
        <div style="margin-top:4px;">${enhanceNursingNote(cleaned)}</div>
      </div>
    `;
  })).join('');
  setHTML('nursingNoteDisplay', notesHtml || '기록 없음');

  const doc = data.docOrders || { routine: [], prn: [] };
  let docHtml = '';
  if (doc.routine.length) {
    docHtml += `<div style="margin-bottom:6px;"><div style="color:#2e7d32; font-weight:bold; margin-bottom:2px;">[정규 처방]</div>${doc.routine.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  if (doc.prn.length) {
    docHtml += `<div><div style="color:#d81b60; font-weight:bold; margin-bottom:2px;">[PRN / Notify]</div>${doc.prn.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  setHTML('docOrderList', docHtml || '특이 처방 없음');

  const aiPtDiv = document.getElementById('aiPanelPatient');
  if (aiPtDiv) aiPtDiv.textContent = `${p.ward ? `${p.ward} · ` : ''}${p.name} (${p.age}/${p.gender}) - ${p.diagnosis}`;
};
