// ===== 전역 설정 =====
let selectedPatientId = null;
let aiPanelOpen = false;
let checklistState = {};
let currentDateIndex = 9;
let dateList = [];

// 초기화
document.addEventListener('DOMContentLoaded', function () {
  if (typeof patients !== 'undefined' && patients.length > 0) {
    if (patients[0].dailyData) {
      dateList = Object.keys(patients[0].dailyData).sort();
    }
    renderPatientList();
    setupUI();
    setupAIRangeSelectors();
    selectPatient(patients[0].id);
  }
});

function setupUI() {
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

  if (displayEl) displayEl.textContent = dateStr;
  if (dDayEl) {
    const diff = currentDateIndex - (dateList.length - 1);
    dDayEl.textContent = diff === 0 ? "Today" : `D${diff}`; // 12-02 기준 D-Day
  }

  // 동기화
  if (dateSel) dateSel.value = currentDateIndex;

  // 버튼 활성/비활성 상태
  if (prevBtn) prevBtn.disabled = (currentDateIndex === 0);
  if (nextBtn) nextBtn.disabled = (currentDateIndex === dateList.length - 1);
}

// ===== 🖥️ 메인 대시보드 업데이트 =====
function updateDashboard(pid) {
  const p = patients.find(pt => pt.id === pid);
  if (!p) return;
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
  const historyStr = (data.pastHistory || []).join(', ');
  setHTML('pastHistoryList', historyStr || '-');

  setText('pAdmit', p.admitDate);
  setText('pDoc', p.doctor);
  setText('pIso', p.isolation);
  setText('pHD', `HD #${getHD(p.admitDate, dateKey)}`);

  setHTML('admitReason', `<div style="max-height:80px; overflow-y:auto; font-size:11px;">${p.admissionNote || p.admitReason}</div>`);
  setHTML('nursingProblem', data.nursingProblem);

  const h = data.handover || {};
  const combinedLines = [...(h.lines || []), ...(h.tubes || []), ...(h.drains || [])];
  setHTML('lineTube', renderSimpleList(combinedLines));

  const hourly = data.hourly || [];
  const vsFlow = hourly.filter((h, i) => i % 4 === 0 || h.event).map(h => {
    const style = h.event ? 'color:#c62828; font-weight:bold; background-color:#ffebee;' : '';
    return `<div style="font-size:11px; margin-bottom:2px; padding:2px; ${style}">
        [${h.time}] BP:${h.vital.bp} / P:${h.vital.hr} / T:${h.vital.bt} / SpO2:${h.vital.spo2 || '-'}%
      </div>`;
  }).join('');
  setHTML('vitalSign', vsFlow || '데이터 없음');

  setHTML('ioActivity', `
    <div><b>Total I/O:</b> ${data.io?.input || 0} / ${data.io?.totalOutput || 0}</div>
    <div style="margin-top:4px;"><b>Activity:</b> ${data.activity}</div>
  `);

  const inj = data.orders?.inj || [];
  const po = data.orders?.po || [];

  setHTML('injList', renderMedList(inj));
  setHTML('poList', renderMedList(po));

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
  setHTML('labResult', labHtml || '-');
  setHTML('labSpecial', (data.specials || []).join(', ') || '-');

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
    docHtml += `<div style="margin-bottom:6px;"><div style="color:#2e7d32; font-weight:bold; margin-bottom:2px;">[Routine]</div>${doc.routine.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  if (doc.prn.length) {
    docHtml += `<div><div style="color:#d81b60; font-weight:bold; margin-bottom:2px;">[PRN / Notify]</div>${doc.prn.map(r => `<div>• ${r}</div>`).join('')}</div>`;
  }
  setHTML('docOrderList', docHtml || '특이 Order 없음');

  // Update AI Panel
  const aiPtDiv = document.getElementById('aiPanelPatient');
  if (aiPtDiv) aiPtDiv.textContent = `${p.name} (${p.age}/${p.gender}) - ${p.diagnosis}`;
}

// ===== 🤖 AI 스마트 인계 로직 =====
function runAIRangeAnalysis(pid) {
  const summaryTab = document.getElementById('tab-summary');
  summaryTab.innerHTML = '<div class="ai-placeholder" style="padding:20px;">⏳ 분석 중...</div>';

  setTimeout(() => {
    try {
      const p = patients.find(pt => pt.id === pid);
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
window.openLabModal = function (pid, category) {
  const p = patients.find(pt => pt.id == pid);
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
      const val = categoryObj ? (categoryObj[key] || '-') : '-';

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
function selectPatient(pid) {
  selectedPatientId = pid;
  document.querySelectorAll('.pt-row').forEach(row => {
    row.classList.toggle('selected', parseInt(row.dataset.id) === pid);
  });
  updateDashboard(pid);
  if (aiPanelOpen) runAIRangeAnalysis(pid);
}
function renderPatientList() {
  const list = document.getElementById('patientList');
  list.innerHTML = patients.map(p => `<div class="pt-row" data-id="${p.id}" onclick="selectPatient(${p.id})"><span class="room">${p.room}</span><span class="name">${p.name}</span></div>`).join('');
  document.getElementById('patientCount').textContent = patients.length;
}
function openAIPanel() { if (!selectedPatientId) return alert("환자선택필요"); document.getElementById('aiPanel').classList.add('active'); document.getElementById('overlay').classList.add('active'); aiPanelOpen = true; runAIRangeAnalysis(selectedPatientId); }
function closeAIPanel() { document.getElementById('aiPanel').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); aiPanelOpen = false; }
function openAddRecordModal() { if (!selectedPatientId) return; document.getElementById('addRecordModal').classList.add('active'); document.getElementById('modalOverlay').classList.add('active'); document.getElementById('recordTime').value = dateList[currentDateIndex] + " " + new Date().toTimeString().slice(0, 5); }
function saveRecord() { alert("저장됨"); closeAllModals(); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '-'; }
function setHTML(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val || '-'; }
function getHD(start, current) { return Math.floor((new Date(current) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1; }