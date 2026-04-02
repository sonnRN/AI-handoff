// Final UI hotfixes loaded after the legacy runtime so the last override wins.
getWardSortIndex = function (ward) {
  const order = ['내과계중환자실', '외과계중환자실', '신경과병동', '외과병동', '호흡기내과병동', '소화기내과병동', '신장내과병동'];
  const normalized = String(ward || '').trim();
  const fixedIndex = order.indexOf(normalized);
  return fixedIndex >= 0 ? fixedIndex : order.length + 1;
};

renderMedList = function (arr) {
  return (arr || []).map((entry) => {
    const text = typeof entry === 'string' ? entry : entry.text;
    const detail = entry && entry.detail
      ? `<span style="font-size:12px; color:#666; display:block; padding-left:14px;">- ${escapeHtml(String(entry.detail))}</span>`
      : '';
    return `<div style="margin-bottom:4px;">&bull; ${escapeHtml(String(text || '-'))}${detail}</div>`;
  }).join('') || '-';
};

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

  const historyStr = (data.pastHistory || [])
    .map((item) => `<div>&bull; ${escapeHtml(String(item || '-'))}</div>`)
    .join('');
  setHTML('pastHistoryList', historyStr || '-');
  setHTML('admitReason', `<div style="max-height:140px; overflow-y:auto; font-size:13px; line-height:1.6;">${formatAdmissionSummaryHtml(p.admissionNote || p.admitReason)}</div>`);
  setHTML('nursingProblem', formatMultilineText(data.nursingProblem));

  const handover = data.handover || {};
  setHTML('lineTube', renderCurrentLineTubeList(handover));

  const hourly = data.hourly || [];
  const vsFlow = hourly
    .filter((entry, index) => index % 4 === 0 || entry.event)
    .map((entry) => {
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
  setHTML('labResult', renderLabSummary(p.id, dateKey, data.labSummary || [], labs));
  setHTML('labSpecial', renderSpecialSummary(p.id, dateKey, data.specialDetails || [], data.specials || []));

  const notesHtml = hourly.flatMap((entry) => (entry.notes || []).map((note) => {
    const nurseMatch = String(note).match(/\(([^)]+RN)\)$/);
    const nurseBadge = nurseMatch ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; border-radius:999px; background:#e3f2fd; color:#0d47a1; font-weight:bold;">${escapeHtml(nurseMatch[1])}</span>` : '';
    const cleaned = String(note).replace(/\s*\([^)]+RN\)$/, '');
    return `
      <div style="border-bottom:1px solid #eee; padding:8px 0; font-size:13px; line-height:1.7;">
        <span style="color:#1976d2; font-weight:bold;">[${entry.time}]</span>
        ${nurseBadge}
        <div style="margin-top:4px;">${escapeHtml(enhanceNursingNote(cleaned))}</div>
      </div>
    `;
  })).join('');
  setHTML('nursingNoteDisplay', notesHtml || '기록 없음');

  const doc = data.docOrders || { routine: [], prn: [] };
  let docHtml = '';
  if (doc.routine.length) {
    docHtml += `<div style="margin-bottom:6px;"><div style="color:#2e7d32; font-weight:bold; margin-bottom:2px;">[정규 처방]</div>${doc.routine.map((item) => `<div>&bull; ${escapeHtml(String(item || '-'))}</div>`).join('')}</div>`;
  }
  if (doc.prn.length) {
    docHtml += `<div><div style="color:#d81b60; font-weight:bold; margin-bottom:2px;">[PRN / Notify]</div>${doc.prn.map((item) => `<div>&bull; ${escapeHtml(String(item || '-'))}</div>`).join('')}</div>`;
  }
  setHTML('docOrderList', docHtml || '특이 처방 없음');

  const aiPtDiv = document.getElementById('aiPanelPatient');
  if (aiPtDiv) aiPtDiv.textContent = `${p.ward ? `${p.ward} · ` : ''}${p.name} (${p.age}/${p.gender}) - ${p.diagnosis}`;
};
