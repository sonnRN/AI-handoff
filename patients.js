// ======================================================================
// 🏥 40F1 가상 환자 데이터 생성 엔진 (Virtual Patient Engine)
// 작성일: 2025-12-13
// 설명: 실제 EMR 수준의 방대한 정형/비정형 데이터를 생성하기 위한 시뮬레이션 엔진
// ======================================================================

// ----------------------------------------------------------------------
// 1. 기초 유틸리티 및 설정
// ----------------------------------------------------------------------
const DATES = Array.from({ length: 10 }, (_, i) => {
    const d = new Date('2025-11-23');
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
});

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(1);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const deviate = (val, range) => val + rand(-range, range);

// ----------------------------------------------------------------------
// 2. 방대한 텍스트 라이브러리 (Nursing Note Templates)
// ----------------------------------------------------------------------
const NOTE_TEMPLATES = {
    general: [
        "Patient resting in bed. no complaints.",
        "식사 절반 정도 섭취함. 소화 불량 호소 없음.",
        "Sleeping soundly. Respiration regular.",
        "보호자 상주 하에 안정 취하는 중.",
        "Position change 시행함 (Supine -> Rt. lateral).",
        "V/S stable. 특이 사항 관찰되지 않음.",
        "수면 양상 규칙적임. 통증 호소 없음."
    ],
    respiratory: [
        "SpO2 95% 이상 유지됨. 호흡음 깨끗함.",
        "Slight crackle sound at both LLL.",
        "기침 간헐적으로 하나 가래 배출은 없음.",
        "Nebulizer 치료 시행함. 환자 편안해함.",
        "Deep breathing encouraging 시행함.",
        "O2 supply 유지 중. Nasal cannula proper position 확인.",
        "호흡 시 보조근 사용 없이 편안해 보임."
    ],
    cardio: [
        "맥박 규칙적이며 말초 순환 양호함.",
        "Chest pain 부인함. EKG 모니터상 NSR.",
        "피부색 정상이며 따뜻하고 건조함.",
        "S1, S2 sound clear. No murmur.",
        "Capillary refill time < 2 sec."
    ],
    gastro: [
        "Bowel sound normo-active.",
        "복부 팽만감 없음. 부드러움.",
        "Nausea/Vomiting 없음.",
        "어제 이후 변 보지 못했다고 함.",
        "L-tube drainage 비워줌. 색깔 greenish."
    ],
    neuro: [
        "Conscious alert. Orientation intact.",
        "묻는 말에 적절히 대답함.",
        "Pupil size 3mm/3mm, Prompt light reflex.",
        "Motor power 모든 사지 Grade 5 확인.",
        "Dizziness 호소 없음."
    ],
    pain: [
        "통증 NRS 2점. 참을만하다고 함.",
        "수술 부위 통증 호소하여 PCA button 사용법 교육함.",
        "진통제 투여 후 통증 완화되었다고 함 (NRS 5 -> 2).",
        "자세 변경 시 약간의 불편감 호소함."
    ]
};

// ----------------------------------------------------------------------
// 2-1. 약물 데이터베이스 (Drug Database)
// ----------------------------------------------------------------------
const DRUG_DB = {
    antibiotics: [
        { name: "Meropenem", dose: "1g", type: "inj", defaultRate: "IV Push" },
        { name: "Vancomycin", dose: "1g", type: "inj", defaultRate: "Mix 200cc, 1hr" },
        { name: "Ceftriaxone", dose: "2g", type: "inj", defaultRate: "IV Push" },
        { name: "Tazocin", dose: "4.5g", type: "inj", defaultRate: "Mix 100cc, 30min" },
        { name: "Metronidazole", dose: "500mg", type: "inj", defaultRate: "Bottle, 30min" },
        { name: "Levofloxacin", dose: "750mg", type: "inj", defaultRate: "Bottle, 1hr" }
    ],
    analgesics: [
        { name: "Tylenol", dose: "650mg", type: "po", usage: "TID" },
        { name: "Ultracet", dose: "1tab", type: "po", usage: "TID" },
        { name: "Tramadol", dose: "50mg", type: "inj", defaultRate: "IM" },
        { name: "Oxycodone", dose: "10mg", type: "po", usage: "BID" },
        { name: "Fentanyl Patch", dose: "25mcg", type: "patch", usage: "q72hr" },
        { name: "Keromin", dose: "30mg", type: "inj", defaultRate: "IV Push" }
    ],
    gastro: [
        { name: "Pantoprazole", dose: "40mg", type: "inj", defaultRate: "IV Push" },
        { name: "Magmil", dose: "500mg", type: "po", usage: "BID" },
        { name: "Duolac", dose: "1cap", type: "po", usage: "BID" },
        { name: "Gaster", dose: "20mg", type: "inj", defaultRate: "IV Push" },
        { name: "Nasea", dose: "0.3mg", type: "inj", defaultRate: "IV Push" }
    ],
    respiratory: [
        { name: "Mucosten", dose: "300mg", type: "po", usage: "TID" },
        { name: "Symbicort", dose: "2puff", type: "inhale", usage: "BID" },
        { name: "Ventolin", dose: "2.5mg", type: "nebu", usage: "PRN" },
        { name: "Solu-Cortef", dose: "100mg", type: "inj", defaultRate: "IV Push" }
    ],
    vasopressor: [
        { name: "Norepinephrine", dose: "8mg/50cc", type: "inj", defaultRate: "Running", range: "2~20cc/hr" },
        { name: "Dopamine", dose: "400mg/200cc", type: "inj", defaultRate: "Running", range: "5~15cc/hr" },
        { name: "Vasopressin", dose: "20U/100cc", type: "inj", defaultRate: "Running", range: "2cc/hr" }
    ],
    fluids: [
        { name: "N/S 1L", dose: "1000ml", type: "fluid", defaultRate: "80cc/hr" },
        { name: "H/S 1L", dose: "1000ml", type: "fluid", defaultRate: "100cc/hr" },
        { name: "5% D/W", dose: "500ml", type: "fluid", defaultRate: "40cc/hr" },
        { name: "SmofKabiven", dose: "1000ml", type: "tpn", defaultRate: "42cc/hr" }
    ]

};

const ROUTINE_EVENTS = [
    { name: "IV Infiltration", note: "IV site swelling & redness noted. IV removed.", action: "New IV insert at Lt. arm." },
    { name: "Insomnia", note: "잠이 오지 않는다고 호소함.", action: "Sleep hygiene education provided." },
    { name: "Constipation", note: "3일째 대변 보지 못함. 복부 불편감 호소.", action: "Magmil given per order." },
    { name: "Minor Fever", note: "BT 37.8 checked. Chilling sensation (-).", action: "Ice bag applied." },
    { name: "Nausea", note: "속이 울렁거린다고 함.", action: "Nasea amp IV injected." },
    { name: "Refusal of Care", note: "기분 저하로 식사 및 운동 거부함.", action: "Emotional support provided." },
    { name: "Diarrhea", note: "물설사 2회 함. 복통 경미함.", action: "Stool exam ordered." },
    { name: "Headache", note: "두통(NRS 3점) 호소함.", action: "Tylenol given." }
];

// ----------------------------------------------------------------------
// 3. 임상 데이터 생성 엔진 (Class)
// ----------------------------------------------------------------------
class PatientGenerator {
    constructor(profile) {
        this.profile = profile;
        this.dailyData = {};
        this.pastHistory = this.generatePastHistory(profile.diagnosis);

        // 상태 유지를 위한 변수 (Drift Logic)
        this.currentBP = { sys: 120, dia: 80 };
        this.currentHR = 80;
        this.currentBT = 36.5;
        this.currentSpO2 = 98;
    }

    generatePastHistory(diagnosis) {
        const history = [];
        const y = (min, max) => `<${rand(min, max)}>`; // Year helper

        // Common
        if (Math.random() > 0.3) history.push(`Hypertension ${y(2010, 2020)}`);
        if (Math.random() > 0.5) history.push(`Diabetes Mellitus ${y(2005, 2018)}`);

        // Diagnosis Specific
        if (diagnosis.includes("Shock") || diagnosis.includes("Sepsis")) {
            history.push(`COPD ${y(2015, 2022)}`);
            history.push(`BPH ${y(2012, 2019)}`);
        }
        if (diagnosis.includes("Stroke")) {
            history.push(`Atrial Fibrillation ${y(2018, 2023)}`);
            history.push(`Dyslipidemia ${y(2010, 2020)}`);
        }
        if (diagnosis.includes("Rectal") || diagnosis.includes("Pancreatic")) {
            history.push(`Appendectomy ${y(2000, 2010)}`);
            history.push(`Cholecystectomy ${y(2015, 2021)}`);
        }
        return history;
    }

    // 활력징후 드리프트 (급격한 변화 방지)
    updateVitals(target, volatility) {
        // 목표가 없으면 현재 유지하되 약간의 변동
        const targetSys = target?.sys || this.currentBP.sys;
        const targetDia = target?.dia || this.currentBP.dia;
        const targetHR = target?.hr || this.currentHR;
        const targetBT = target?.bt || this.currentBT;
        const targetSpO2 = target?.spo2 || 98; // 기본 98 회귀

        // 목표 방향으로 10~20% 씩 이동 + 랜덤 노이즈
        this.currentBP.sys += (targetSys - this.currentBP.sys) * 0.2 + rand(-volatility, volatility);
        this.currentBP.dia += (targetDia - this.currentBP.dia) * 0.2 + rand(-volatility, volatility);
        this.currentHR += (targetHR - this.currentHR) * 0.2 + rand(-volatility, volatility);
        this.currentBT += (targetBT - this.currentBT) * 0.2 + randFloat(-0.1, 0.1);

        // SpO2는 상한 100
        this.currentSpO2 += (targetSpO2 - this.currentSpO2) * 0.5 + rand(-1, 1);
        if (this.currentSpO2 > 100) this.currentSpO2 = 100;

        // 정수화
        return {
            bp: `${Math.round(this.currentBP.sys)}/${Math.round(this.currentBP.dia)}`,
            hr: Math.round(this.currentHR),
            rr: Math.round(this.currentHR / 4) + rand(-2, 2), // HR 연동
            bt: Math.max(35, Math.min(42, this.currentBT)).toFixed(1),
            spo2: Math.round(this.currentSpO2)
        };
    }

    generateLogs(hour, scenario) {
        const notes = [];

        // 중요 이벤트
        if (hour === scenario.eventTime) {
            notes.push(`🔴 [EVENT] ${scenario.eventNote}`);
        } else if (hour === scenario.eventTime + 1) {
            notes.push(`🔵 [Action] ${scenario.eventAction}`);
            notes.push(`[Re-eval] 처치 후 상태 재평가 시행함.`);
        }

        // 루틴 기록 (랜덤 문구 생성) - 낮시간에 더 빈번
        if (hour % 4 === 0 || (hour > 8 && hour < 20 && Math.random() > 0.7)) {
            // 시간대별 문맥
            if (hour >= 23 || hour <= 5) {
                if (Math.random() > 0.8) notes.push(pick(NOTE_TEMPLATES.general));
                else notes.push("Sleeping. 특이사항 없음.");
            } else {
                // 환자 진단에 따른 카테고리 가중치
                const category = this.getWeightedCategory();
                notes.push(pick(NOTE_TEMPLATES[category]));

                // 식사 시간
                if (hour === 8 || hour === 13 || hour === 18) {
                    notes.push(`Diet 제공됨. ${rand(50, 100)}% 섭취함.`);
                }
            }
        }
        return notes;
    }

    getWeightedCategory() {
        // 진단명 기반 가중치 (예: COPD면 respiratory, Sepsis면 general/vital)
        const diag = this.profile.diagnosis;
        if (diag.includes("COPD") || diag.includes("Pneumonia")) return Math.random() > 0.3 ? 'respiratory' : 'general';
        if (diag.includes("Shock") || diag.includes("Septic")) return Math.random() > 0.4 ? 'cardio' : 'general';
        if (diag.includes("Ca") || diag.includes("Op")) return Math.random() > 0.5 ? 'pain' : 'gastro';
        return 'general';
    }

    generateDay(dateIndex, scenario) {
        const date = DATES[dateIndex];
        const hourlyData = [];

        // 초기값 설정 (그날의 Base)
        if (scenario.baseBP) {
            const [s, d] = scenario.baseBP.split('/');
            this.currentBP = { sys: parseInt(s), dia: parseInt(d) };
        }
        if (scenario.baseHR) this.currentHR = scenario.baseHR;
        if (scenario.baseBT) this.currentBT = scenario.baseBT;
        if (scenario.baseSpO2) this.currentSpO2 = scenario.baseSpO2;

        let eventStarted = false;

        for (let h = 0; h < 24; h++) {
            const time = `${h.toString().padStart(2, '0')}:00`;

            // 이벤트 발생 시 Target Vitals 변경
            let target = null;
            let vol = 2; // 평소 변동성

            if (h === scenario.eventTime) eventStarted = true;

            if (eventStarted && scenario.eventVital) {
                target = scenario.eventVital; // 이벤트 목표치로 이동
                vol = 5; // 이벤트 중 변동성 증가
            }
            // 이벤트 종료/회복 로직은 단순화를 위해 유지 or 다음날 리셋

            const vital = this.updateVitals(target, vol);
            const notes = this.generateLogs(h, scenario);

            hourlyData.push({
                time: time,
                vital: vital,
                notes: notes,
                event: (h === scenario.eventTime) ? scenario.eventName : null
            });
        }

        // 일일 요약 데이터 조립
        const dailySummary = {
            hourly: hourlyData,
            vital: hourlyData[23].vital, // 마지막 데이터
            tMax: Math.max(...hourlyData.map(d => parseFloat(d.vital.bt))),
            io: { input: rand(1500, 2500), output: rand(1200, 2200) }, // 기본값
            activity: (hourlyData[23].vital.hr > 100 || hourlyData[23].vital.spo2 < 90) ? "Bed Rest" : "Ambulation (Wheelchair)",
            labs: this.generateLabs(scenario.labs),
            orders: this.generateOrders(scenario.orders, this.profile.diagnosis),
            plan: scenario.plan || [],
            nursingProblem: scenario.nursingProblem || "-",
            specials: scenario.specials || [],
            handover: scenario.handover || {},
            scores: scenario.scores || { fall: 50, pressure: 10, cre: 1 },
            // New Field: Doctor Orders
            docOrders: this.generateDoctorOrders(scenario.docOrders, this.profile.diagnosis, scenario),
            // New Field: Nursing Tasks with Timestamp
            nursingTasks: this.generateNursingTasks(this.profile.diagnosis, scenario, (scenario.scores || { fall: 50, pressure: 10 })),
            // New Field: Past History
            pastHistory: this.pastHistory,
            // New Field: To-Do Schedule
            todoList: this.generateSchedule(DATES[dateIndex], scenario, this.profile.diagnosis)
        };

        // I/O Override if shock/failure
        if (scenario.oliguria) dailySummary.io = { in: 2000, out: 400 };

        this.dailyData[DATES[dateIndex]] = dailySummary;
        return dailySummary;
    }

    generateDoctorOrders(scenarioDocOrders, diagnosis, scenario) {
        let routine = [];
        let prn = [];

        // 🏥 Diagnosis-Specific Clinical Orders
        // 1. Septic Shock & Kidney Failure
        if (diagnosis.includes("Shock") || diagnosis.includes("Kidney")) {
            routine.push("V/S check q1hr (Manual BP check)");
            routine.push("Hourly Urine Output Check (Keep > 0.5cc/kg/hr)");
            routine.push("Titrate Norepinephrine to Keep MAP > 65mmHg");
            routine.push("C-line Dressing q2days & whenever soiled");
            routine.push("ABGA f/u q6hr if on Ventilator");

            prn.push("SBP < 80mmHg or MAP < 60mmHg Notify");
            prn.push("HR > 130 or < 50 Notify");
            prn.push("BT > 38.0℃: Blood Cx x2 & Start Antibiotics within 1hr");
            prn.push("SpO2 < 90%: Increase FiO2 10% step-up");
        }

        // 2. Post-op (Rectal Ca)
        else if (diagnosis.includes("Rectal Ca") || diagnosis.includes("Op")) {
            routine.push("V/S check q4hr");
            routine.push("Encourage Deep Breathing & Incentive Spirometry");
            routine.push("Ambulation 4 times/day (POD#1~) with Guardian");
            routine.push("JP Drain: Empty & Recording q8hr");
            routine.push("Wound Dressing daily (Colostomy care if any)");

            prn.push("Pain NIST > 4: Tridol 50mg IV push");
            prn.push("Nausea/Vomiting: Metoclopramide 10mg IV");
            prn.push("BT > 38.0℃: Ice bag apply & Notify");
            prn.push("Abdominal Distension or Severe Pain: Notify Stat");
        }

        // 3. Stroke & COPD
        else if (diagnosis.includes("Stroke")) {
            routine.push("Neuro Check q2hr (GCS, Pupil, Motor power)");
            routine.push("Keep Head Elevation 30 degrees (ICP control)");
            routine.push("L-tube Feeding: 300cc q4hr (Check Regurgitation)");
            routine.push("Position Change q2hr (Prevent Bedsore)");
            routine.push("Seizure Precaution (Bed rail up, Airway standby)");

            prn.push("SBP > 160mmHg: Nicardipine 5mg IV push (per sliding scale)");
            prn.push("O2 Sat < 90%: Apply O2 2L -> 4L -> Notify");
            prn.push("Seizure Activity: Ativan 2mg IV Stat & Notify");
            prn.push("Sudden Mental Deterioration: Notify Stat");
        }

        // 4. Neutropenia & Pancreatic Ca
        else if (diagnosis.includes("Neutropenia") || diagnosis.includes("Pancreatic")) {
            routine.push("Reverse Isolation Protocol (Mask, Gown, Hand hygiene)");
            routine.push("No fresh flowers, No raw food diet");
            routine.push("Oral Care (Tantum gargle) q4hr");
            routine.push("Daily CBC (ANC monitoring) & CRP check");
            routine.push("PICC Dressing q7days (Chlorhexidine)");

            prn.push("BT > 38.0℃: Culture Stat (Blood x2, Urine, Sputum)");
            prn.push("If Fever: Start Meropenem 1g immediately (after Cx)");
            prn.push("Bleeding Sign (Gums, Stool, Petechiae): Notify");
            prn.push("NRS > 4: Fentanyl Patch check or IV Analgesics");
        }

        // Default Fallback
        else {
            routine.push("V/S check q8hr");
            routine.push("Diet: General Diet");
            routine.push("Encourage Hydration");
            prn.push("Pain > NRS 4: Tylenol ER 2tab PO");
        }

        // Scenario Specific Overrides (Event Driven)
        // e.g. Bleeding Event
        if (scenario.eventName && scenario.eventName.includes("Bleeding")) {
            routine.unshift("Strict Bed Rest (ABR)");
            routine.unshift("NPO (Nothing by Mouth)");
            prn.push("Hematemesis or Melena: Notify Stat");
            prn.push("Hb < 8.0: Prepare RBC Transfusion");
        }

        // Explicit Scenario Orders Merge
        if (scenarioDocOrders) {
            if (scenarioDocOrders.routine) routine = [...routine, ...scenarioDocOrders.routine];
            if (scenarioDocOrders.prn) prn = [...prn, ...scenarioDocOrders.prn];
        }

        return { routine: [...new Set(routine)], prn: [...new Set(prn)] };
    }

    // 👩‍⚕️ Nursing Task Generator (New)
    generateNursingTasks(diagnosis, scenario, scores) {
        let tasks = [];

        // 1. Isolation (Infection Control)
        if (diagnosis.includes("Pneumonia") || diagnosis.includes("Sepsis")) {
            tasks.push({
                text: "격리(MRSA) 접촉주의 유지",
                detail: "[간호기록] 객담 배양검사상 MRSA 검출되어 접촉주의 격리 시행 중임. 병실 앞 격리표지판 부착완료. 전용 혈압계/청진기 사용 중. 접촉 전후 손위생 및 보호구(가운, 장갑) 착용 준수함."
            });
        }

        // 2. Skin Integrity (Pressure Ulcer)
        if (scores.pressure > 18 || diagnosis.includes("Stroke") || diagnosis.includes("Bedridden")) {
            tasks.push({
                text: "피부(천골부) 욕창 1단계 관리",
                detail: "[간호기록] 천골부위(Sacrum) 3x3cm 발적(Stage 1) 지속 관찰됨. Mepilex Border 부착 중이며 2시간마다 체위변경 시행함. 에어매트리스 압력 정상 확인."
            });
        }

        // 3. Safety Risks (Falls)
        if (scores.fall >= 60) {
            tasks.push({
                text: "낙상 고위험 집중관리 (High Risk)",
                detail: `[간호기록] 낙상위험평가 ${scores.fall} 점(고위험).침상 난간 4개 올림 유지 중.낙상 예방 스티커 부착됨.휠체어 이동 시 안전벨트 착용 교육함.`
            });
        }

        // 4. Procedures & Devices
        if (diagnosis.includes("Op") || diagnosis.includes("Surgery")) {
            tasks.push({
                text: "수술/마취 동의서 받기",
                detail: "[간호기록] 내일 예정된 수술 관련하여 주치의 설명 후 환자/보호자 동의서 작성 완료됨. 자정부터 금식(NPO) 교육 및 확인서 서명 받음."
            });
        }
        if (scenario.eventName && scenario.eventName.includes("Bleeding")) {
            tasks.push({
                text: "수혈 동의서 (RBC) 작성 확인",
                detail: "[간호기록] Hb 7.8 저하되어 농축적혈구(RBC) 2 pint 수혈 처방 남. 보호자에게 수혈 부작용 및 목적 설명 후 동의서 서명 받음. 혈액은행 불출 요청함."
            });
        }
        if (diagnosis.includes("Neutropenia") || diagnosis.includes("Chemo")) {
            tasks.push({
                text: "PICC(중심정맥관) 드레싱 및 관리",
                detail: "[간호기록] PICC 삽입부위 발적 없음. 금일 Clorhexidine 드레싱 교환함. 관류(Flushing) 양호함. 항암제 투여 전 역혈 확인 필수."
            });
        }

        // 5. Doctor's Plan & Verbal Orders (New Request)
        if (diagnosis.includes("Rectal") || diagnosis.includes("Op")) {
            tasks.push({
                text: "보호자 면담 완료 (재수술 가능성 설명)",
                detail: "[간호기록] 주치의 회진 시 보호자(배우자)에게 수술 부위 삼출물 증가 소견 있어 재수술 가능성 있음을 설명함. 보호자 이해하고 질문 없었음. 정서적 지지 제공함."
            });
            tasks.push({
                text: "JP Drain 배액량/양상 q4hr 기록",
                detail: "[간호기록] JP #1, #2 배액 양상(Serosanguineous) 확인함. 4시간마다 배액량 측정하여 기록 중. 갑작스러운 출혈성 변화나 배액량 감소 시 즉시 보고하기로 함."
            });
        }

        if (scenario.eventName && scenario.eventName.includes("PCD")) {
            tasks.push({
                text: "시술 후 48-72hr 경과 관찰 오더",
                detail: "[간호기록] 주치의: PCD 시술 후 48~72시간 동안 배액량 및 발열 여부 면밀 관찰. 호전 없을 시 수술적 치료(Exploratory Laparotomy) 고려 계획임. V/S Stable 유지 중."
            });
        }

        return tasks;
    }

    // 🗓️ To-Do Schedule Generator (New)
    // 🗓️ To-Do Schedule Generator (New)
    generateSchedule(dateStr, scenario, diagnosis) {
        const todos = [];

        // 1. Line/Tube/Drain Management (Mandatory)
        // Ensure at least one line/tube check is present
        const deviceTask = Math.random() > 0.5
            ? "C-line 기능 점검 및 Flushing"
            : "L-tube/Foley 위치 확인 및 Irrigation";
        todos.push({ text: deviceTask, isToday: true });

        // 2. Dressing (Mandatory)
        todos.push({ text: "수술/시술 부위 소독 (Dressing Change)", isToday: true });

        // 3. Lab Order (Mandatory)
        const labTime = ["06:00", "10:00", "16:00"][Math.floor(Math.random() * 3)];
        todos.push({ text: `[채혈] 정규 혈액 검사 (Routine CBC/Chem) - ${labTime}`, isToday: true });

        // 4. Imaging Schedule (Mandatory)
        const imgType = Math.random() > 0.5 ? "흉부 X-ray (Chest PA)" : "복부 영상 (Abdomen Supine)";
        todos.push({ text: `[영상] ${imgType} 촬영 확인`, isToday: true });

        // 5. Surgery or Procedure (Mandatory)
        // Even if no surgery is "real", we mock a scheduled check or minor procedure
        const proc = diagnosis.includes("Op") ? "수술 후 상처 확인 (Wound Check)" : "초음파/심초음파 (Echo/Sono) 예정";
        todos.push({ text: `[시술/수술] ${proc} 오더 확인`, isToday: true });

        return todos;
    }

    generateLabs(scenarioLab) {
        // 🩸 카테고리별 Lab 데이터 생성
        // 1. Hematology (일반혈액검사)
        const hematology = {
            "WBC": randFloat(4.0, 10.0),
            "Hb": randFloat(12.0, 16.0),
            "Plt": rand(150, 450),
            "ANC": "-" // Default placeholder
        };

        // 2. Chemistry (일반화학검사)
        const chemistry = {
            "Na": rand(135, 145),
            "K": randFloat(3.5, 5.0),
            "Cl": rand(95, 105),
            "BUN": rand(10, 20),
            "Cr": randFloat(0.6, 1.2),
            "AST": rand(15, 40),
            "ALT": rand(15, 40),
            "T-Bil": randFloat(0.3, 1.2),
            "Albumin": randFloat(3.5, 5.0),
            "CRP": randFloat(0.1, 0.5)
        };

        // 3. Coagulation (응고검사)
        const coagulation = {
            "PT(INR)": randFloat(0.9, 1.1),
            "aPTT": randFloat(25.0, 35.0)
        };

        // 4. ABGA (동맥혈가스분석)
        const abga = {
            "pH": randFloat(7.35, 7.45),
            "pCO2": rand(35, 45),
            "pO2": rand(80, 100),
            "HCO3": rand(22, 26),
            "Lactate": randFloat(0.5, 1.5)
        };

        // 시나리오 오버라이드 (Scenario Specific Override)
        // scenarioLab이 평평한 객체(flat object)로 들어오면 적절히 분배해야 함
        // 예: { "WBC": "20.0 (H)" } -> hematology.WBC 업데이트
        if (scenarioLab) {
            for (const [key, val] of Object.entries(scenarioLab)) {
                if (key in hematology) hematology[key] = val;
                else if (key in chemistry) chemistry[key] = val;
                else if (key in coagulation) coagulation[key] = val;
                else if (key in abga) abga[key] = val;
                else chemistry[key] = val; // Default to chemistry if unknown
            }
        }

        return {
            "Hematology": hematology,
            "Chemistry": chemistry,
            "Coagulation": coagulation,
            "ABGA": abga
        };
    }

    generateOrders(scenarioOrders, diagnosis) {
        const inj = [];
        const po = [];

        // 1. Diagnosis 기반 Routine Drugs 자동 추가
        // 기본 수액
        if (diagnosis.includes("Shock") || diagnosis.includes("NPO")) {
            inj.push({ text: "N/S 1L", detail: "80cc/hr (Main)" });
        }

        // 위장약 루틴
        if (Math.random() > 0.3) po.push({ text: "Magmil 500mg", detail: "BID" });

        // 2. Scenario Specific Orders 병합
        if (scenarioOrders) {
            // Inj 처리
            (scenarioOrders.inj || []).forEach(item => {
                if (typeof item === 'string') {
                    // 문자열인 경우 DB매칭 시도 또는 기본 포맷팅
                    const dbMatch = this.findDrugInDB(item);
                    if (dbMatch) {
                        let detail = dbMatch.defaultRate;
                        if (dbMatch.range) detail = `${rand(5, 15)} cc / hr`; // Running drug random rate
                        inj.push({ text: `${dbMatch.name} ${dbMatch.dose} `, detail: detail });
                    } else {
                        inj.push({ text: item, detail: "IV Push" });
                    }
                } else {
                    // 이미 객체인 경우 ({name, rate...})
                    inj.push({ text: item.name, detail: item.rate || "IV" });
                }
            });

            // PO 처리
            (scenarioOrders.po || []).forEach(item => {
                po.push({ text: item, detail: "QD" }); // 단순 문자열 -> 객체 변환
            });
        }

        return { inj, po };
    }

    findDrugInDB(name) {
        // 간단 검색
        for (const cat in DRUG_DB) {
            const found = DRUG_DB[cat].find(d => name.includes(d.name));
            if (found) return found;
        }
        return null;
    }
}


// ----------------------------------------------------------------------
// 4. 환자별 시나리오 정의 및 데이터 생성 실행
// ----------------------------------------------------------------------

// === [Patient 1] Synthetic Patient Alpha: Septic Shock Scenario ===
const p1_gen = new PatientGenerator({ diagnosis: "Septic Shock" });
DATES.forEach((d, i) => {
    let s = {};
    if (i < 2) { // Shock State
        s = {
            baseBP: "90/50", baseHR: 110, baseBT: 38.5, oliguria: true,
            eventName: "Hypotension Alert", eventTime: 14,
            eventNote: "SBP 80mmHg 미만 저하. Mental drowsy change.",
            eventAction: "Norepinephrine 0.2mcg start. Leg elevation.",
            eventVital: { sys: 80, dia: 40, hr: 125, spo2: 92 },
            // 🩸 Septic Shock Labs: High WBC, High Lactate, High CRP, High Cr (AKI)
            slides: { "WBC": "25.5", "Cr": "2.8", "Lactate": "5.2", "CRP": "18.0", "pH": "7.28", "HCO3": "18" },
            nursingProblem: "#1. 쇼크위험성",
            scores: { fall: 90, pressure: 22, cre: 1 }
        };
        s.orders = { inj: ["Norepinephrine", "Vancomycin", "Meropenem"], po: [] };
        // [Checklist Enrichment]
        s.handover = {
            lines: [{ text: "C-line (Rt.IJ)", detail: "15cm, Fixed well, Insertion: 11/23" }],
            drugs: [{ text: "Norepinephrine", detail: "0.2mcg/kg/min (Running)" }, { text: "N/S 1L", detail: "100cc/hr" }],
            tubes: [{ text: "Foley", detail: "16Fr, Urine bag clear" }],
            vent: [{ text: "O2 (6L Mask)", detail: "SpO2 92% maintained" }],
            neuro: [{ text: "GCS Check", detail: "E3 V4 M6 (Drowsy)" }]
        };

    } else if (i < 6) { // CRRT & Ventilator
        s = {
            baseBP: "100/60", baseHR: 95, baseBT: 37.8,
            eventName: "CRRT Alarm", eventTime: 10,
            eventNote: "CRRT Filter clot sign 보임. Venous pressure high.",
            eventAction: "Replacement fluid 속도 조절. Heparin flushing.",
            eventVital: { sys: 105, dia: 65, spo2: 96 },
            nursingProblem: "#1. 조직관류 저하"
        };
        // CRRT applying: High Cr, High K
        s.labs = { "WBC": "18.0", "Cr": "3.2", "Lactate": "2.5", "CRP": "8.0", "K": "5.5" };
        s.orders = { inj: ["Meropenem", "Furosemide"], po: [] };
        // [Checklist Enrichment]
        s.handover = {
            lines: [{ text: "Dialysis DC (Femoral)", detail: "Patency OK, No oozing" }, { text: "C-line (Rt.IJ)", detail: "15cm" }],
            drugs: [{ text: "CRRT", detail: "Flow 150/30" }, { text: "Heparin", detail: "500u/hr" }],
            tubes: [{ text: "E-tube", detail: "7.5Fr, 23cm, Cuff 25cmH2O" }, { text: "L-tube", detail: "16Fr, 55cm, Drainage(-)" }, { text: "Foley", detail: "16Fr" }],
            vent: [{ text: "Ventilator", detail: "SIMV, FiO2 0.4, PEEP 5" }],
            neuro: [{ text: "GCS Check", detail: "E2 Vt M5 (Sedated)" }]
        };
    } else if (i === 6) { // Extubation
        s = {
            baseBP: "120/70", baseHR: 85, baseBT: 37.0,
            eventName: "Extubation", eventTime: 10,
            eventNote: "Mental Alert. Self respiration 양호하여 Extubation 시행함.",
            eventAction: "O2 5L Mask 적용. V/S stable check.",
            eventVital: { spo2: 98, rr: 20 },
            nursingProblem: "#1. 감염위험성"
        };
        s.labs = { "WBC": "9.5", "Cr": "1.5", "Lactate": "1.2", "CRP": "2.0" };
        s.orders = { inj: ["Ceftriaxone", "Mucosten"], po: [] };
        s.handover = {
            tubes: [{ text: "E-tube", detail: "Removed today" }, { text: "Foley", detail: "16Fr" }],
            vent: [{ text: "High Flow O2", detail: "40L/min, FiO2 0.4" }],
            lines: [{ text: "C-line", detail: "Rt.IJ, 15cm" }],
            neuro: [{ text: "GCS Check", detail: "E4 V5 M6 (Alert)" }]
        };

    } else { // Recovery
        s = {
            baseBP: "120/75", baseHR: 80, baseBT: 36.6,
            nursingProblem: "#1. 낙상위험성"
        };
        s.labs = { "WBC": "8.5", "Cr": "1.2", "Lactate": "1.0", "CRP": "1.5" };
        s.orders = { inj: ["Ceftriaxone"], po: ["Mucosten"] };
        // [Checklist for stable patient]
        s.handover = {
            lines: [{ text: "Peripheral IV", detail: "Lt.Arm, 20G" }],
            tubes: [{ text: "Foley", detail: "Removed" }],
            vent: [{ text: "Room air", detail: "SpO2 98%" }],
            neuro: [{ text: "GCS Check", detail: "Alert" }],
            drugs: [{ text: "N/S 500ml", detail: "KVO" }]
        };
    }
    if (s.slides) s.labs = s.slides;
    p1_gen.generateDay(i, s);
});


// === [Patient 2] Synthetic Patient Beta: Rectal Cancer Scenario ===
const p2_gen = new PatientGenerator({ diagnosis: "Rectal Ca Op" });
DATES.forEach((d, i) => {
    let s = {};
    if (i < 2) {
        s = { baseBP: "120/80", baseBT: 36.5, nursingProblem: "#1. 급성통증" };
        s.orders = { inj: ["Ceftriaxone"], po: ["Magmil", "Tylenol"] };
        s.handover = {
            lines: [{ text: "Peripheral IV", detail: "Rt.Hand, 22G" }],
            drains: [{ text: "J-P Drain", detail: "Lt.Abd, Serous, 50cc" }],
            vent: [{ text: "Room air", detail: "Stable" }],
            neuro: [{ text: "GCS Check", detail: "Alert" }], drugs: [{ text: "IV Fluids", detail: "Main 80cc/hr" }]
        };

    } else if (i === 2) { // [Major] Post-op Bleeding Event
        s = {
            baseBP: "90/60", baseHR: 115,
            eventName: "Post-op Bleeding", eventTime: 10,
            eventNote: "JP drain bloody color change (200cc/1hr). Dizziness 호소.",
            eventAction: "Duty Dr. Noti. Stat CBC, Coagulation lab 시행.",
            eventVital: { sys: 88, dia: 50, hr: 120 },
            nursingProblem: "#1. 체액부족위험성"
        };
        s.labs = { "Hb": "7.8", "Plt": "140", "PT(INR)": "1.5", "WBC": "8.5" };
        s.orders = { inj: ["N/S 1L", "Ceftriaxone"], po: [] };
        s.handover = {
            drains: [{ text: "J-P Drain", detail: "Lt.Abd, Bloody, 200cc/hr!" }],
            lines: [{ text: "Peripheral IV x2", detail: "18G(Rt), 20G(Lt)" }],
            vent: [{ text: "O2 4L Mask", detail: "SpO2 95%" }],
            neuro: [{ text: "GCS Check", detail: "Drowsy" }],
            drugs: [{ text: "N/S Loading", detail: "Full drop" }]
        };

    } else if (i === 3) {
        s = { baseBP: "110/70", baseHR: 90, nursingProblem: "#1. 낙상위험성" };
        s.labs = { Hb: "9.5", Plt: "150" };
        s.orders = { inj: ["Ceftriaxone"], po: ["Tylenol"] };
        s.handover = {
            drains: [{ text: "J-P Drain", detail: "Lt.Abd, Serosanguineous" }],
            lines: [{ text: "Peripheral IV", detail: "20G" }],
            neuro: [{ text: "GCS Check", detail: "Alert" }], vent: [{ text: "Room air", detail: "OK" }]
        };

    } else if (i === 6) { // [Major] Leakage Event
        s = {
            baseBP: "130/80", baseBT: 38.2,
            eventName: "Severe Abdominal Pain", eventTime: 16,
            eventNote: "복부 통증 NRS 8점 호소. 식은땀 관찰됨.",
            eventAction: "Duty Dr. Noti. CT abdomen 촬영 지시.",
            eventVital: { bt: 38.6, hr: 110 },
            nursingProblem: "#1. 급성통증"
        };
        s.labs = { "WBC": "16.5", "CRP": "9.5", "Lactate": "2.1" };
        s.specials = ["Abd CT: Anastomotic Leakage suspect"];
        s.handover = { drains: [{ text: "J-P Drain", detail: "Turbid color" }], neuro: [{ text: "Mental", detail: "Alert, Anxiety" }], drugs: [{ text: "Pain control", detail: "On going" }] };

    } else if (i === 7) { // PCD
        s = {
            baseBP: "110/70", baseBT: 37.5,
            eventName: "PCD Insertion", eventTime: 14,
            eventNote: "Sono guide PCD insertion 시행.",
            eventAction: "배액관 고정 튼튼히 함. Drainage 양상 확인 (Turbid).",
            nursingProblem: "#1. 감염위험성"
        };
        s.labs = { "WBC": "18.0", "CRP": "12.0" };
        s.orders = { inj: ["Tazocin", "Metronidazole"], po: [] }; // NPO
        s.handover = {
            drains: [{ text: "PCD", detail: "Rt.Buttock, 10Fr, Turbid" }, { text: "J-P Drain", detail: "Lt.Abd" }],
            lines: [{ text: "PICC", detail: "Lt.Arm, 4Fr, 40cm" }], // Added PICC
            vent: [{ text: "Room air", detail: "Stable" }],
            neuro: [{ text: "GCS Check", detail: "Alert" }]
        };

    } else {
        s = { baseBP: "115/75", baseBT: 36.8, nursingProblem: "#1. 영양불균형" };
        if (Math.random() > 0.5) {
            const re = pick(ROUTINE_EVENTS);
            s.eventName = re.name; s.eventTime = rand(9, 21);
            s.eventNote = re.note; s.eventAction = re.action;
        }
        s.orders = { inj: ["Tazocin"], po: [] };
        s.handover = {
            drains: [{ text: "PCD", detail: "Serous, 30cc" }, { text: "J-P Drain", detail: "Removed" }],
            lines: [{ text: "PICC", detail: "Lt.Arm, Dressing intact" }], drugs: [{ text: "Tazocin", detail: "Q8hr" }]
        };
    }
    p2_gen.generateDay(i, s);
});


// === [Patient 3] Synthetic Patient Gamma: Stroke and COPD Scenario ===
const p3_gen = new PatientGenerator({ diagnosis: "Stroke & COPD" });
DATES.forEach((d, i) => {
    let s = {};
    const baseABGA = { "pH": "7.35", "pCO2": "45", "pO2": "85", "HCO3": "24" };

    if (i < 3) {
        s = {
            baseBP: "140/90", baseHR: 100, baseSpO2: 88,
            eventName: "Dyspnea Attack", eventTime: 10,
            eventNote: "호흡곤란 호소. RR 32회/분 측정됨.",
            eventAction: "Nebulizer 시행 및 O2 증량.",
            eventVital: { spo2: 82, rr: 35 },
            nursingProblem: "#1. 가스교환장애"
        };
        s.labs = { ...baseABGA, "pH": "7.30", "pCO2": "65", "pO2": "55", "HCO3": "26" };
        s.orders = { inj: ["Solu-Cortef"], po: ["Theophylline"] };
        s.handover = {
            vent: [{ text: "O2 Mask", detail: "5L/min, SpO2 90%" }],
            neuro: [{ text: "GCS Check", detail: "E4 V4 M6 (Confusion)" }],
            lines: [{ text: "Peripheral IV", detail: "22G" }],
            drugs: [{ text: "Solu-Cortef", detail: "IV push completed" }]
        };

    } else if (i === 3) { // [Major] Neurological Deterioration
        s = {
            baseBP: "150/90", baseMental: "Drowsy",
            eventName: "Stroke Progression", eventTime: 9,
            eventNote: "Lt. arm motor weakness Grade 4 -> 2 저하됨. 구음장애 심해짐.",
            eventAction: "Brain MRI (Diffusion) f/u. Neuro Dr. Noti.",
            eventVital: { sys: 160, dia: 95 },
            nursingProblem: "#1. 뇌조직관류장애위험성"
        };
        s.specials = ["Brain MRI: Acute infarction extension at Rt. MCA"];
        s.orders = { inj: ["N/S 1L"], po: ["Aspirin", "Plavix"] };
        s.handover = {
            neuro: [{ text: "GCS Check", detail: "E3 V3 M4 (Drowsy)" }, { text: "Motor", detail: "Lt. Upper Gr II, Lower Gr III" }],
            tubes: [{ text: "L-tube", detail: "16Fr, 60cm" }], // Dysphagia -> L-tube inserted
            lines: [{ text: "Peripheral IV", detail: "18G for MRI" }],
            vent: [{ text: "Nasal Prong", detail: "2L" }]
        };

    } else if (i === 5) { // [Major] Aspiration Pneumonia
        s = {
            baseBP: "130/80", baseBT: 38.0,
            eventName: "Aspiration Sign", eventTime: 12,
            eventNote: "식사 도중 사레 들려 기침 심하게 함. SpO2 85%까지 저하.",
            eventAction: "Suction 시행. O2 5L 증량. NPO 유지.",
            eventVital: { spo2: 88, rr: 30, bt: 38.3 },
            nursingProblem: "#1. 기도흡인위험성"
        };
        s.labs = { "WBC": "15.0", "CRP": "4.5" };
        s.orders = { inj: ["Tazocin"], po: [] };
        s.handover = {
            tubes: [{ text: "L-tube", detail: "16Fr, 60cm, Regurgitation(+)" }],
            vent: [{ text: "O2 Mask", detail: "6L -> 8L" }],
            neuro: [{ text: "GCS Check", detail: "Drowsy" }],
            drugs: [{ text: "Tazocin", detail: "Start" }]
        };

    } else {
        s = { baseBP: "130/80", baseSpO2: 94, nursingProblem: "#1. 자가간호결핍" };
        if (Math.random() > 0.5) {
            const re = pick(ROUTINE_EVENTS);
            s.eventName = re.name; s.eventTime = rand(14, 20);
            s.eventNote = re.note; s.eventAction = re.action;
        }
        s.orders = { inj: ["Tazocin"], po: ["Aspirin"] };
        s.handover = {
            tubes: [{ text: "L-tube", detail: "16Fr, 60cm, No leakage" }],
            lines: [{ text: "Peripheral IV", detail: "22G, Swelling(-)" }],
            vent: [{ text: "Room air", detail: "OK" }],
            neuro: [{ text: "GCS Check", detail: "Alert" }], drugs: [{ text: "Meds", detail: "PO done" }]
        };
    }
    p3_gen.generateDay(i, s);
});


// === [Patient 4] Synthetic Patient Delta: Pancreatic Cancer Scenario ===
const p4_gen = new PatientGenerator({ diagnosis: "Pancreatic Ca" });
DATES.forEach((d, i) => {
    let s = {};
    if (i === 1) { // [Major] Anaphylaxis
        s = {
            baseBP: "120/70",
            eventName: "Chemo Anaphylaxis", eventTime: 11,
            eventNote: "항암제 투여 10분 후 전신 두드러기 및 호흡곤란 호소.",
            eventAction: "Infusion Stop. Epinephrine & Steroid stat IV.",
            eventVital: { sys: 80, dia: 50, hr: 130, spo2: 90 },
            nursingProblem: "#1. 쇼크위험성"
        };
        s.orders = { inj: ["Epinephrine", "Solu-Cortef"], po: [] };
        s.handover = {
            lines: [{ text: "PICC", detail: "Lt.Arm, 4Fr, Patent" }, { text: "Peripheral IV", detail: "Rt.Arm, 20G (New)" }],
            drugs: [{ text: "Epinephrine", detail: "IV pushed" }, { text: "N/S", detail: "Full drop" }],
            vent: [{ text: "O2 Mask", detail: "10L" }],
            neuro: [{ text: "GCS Check", detail: "Alert (Anxious)" }]
        };

    } else if (i === 3) { // Fever start
        s = {
            baseBP: "100/60", baseBT: 38.5,
            eventName: "Febrile Neutropenia", eventTime: 14,
            eventNote: "BT 38.9도 고열 Check. 오한 호소.",
            eventAction: "역격리(Reverse Isolation) 적용. Pan-culture 시행.",
            eventVital: { bt: 39.0, hr: 120 },
            nursingProblem: "#1. 고체온"
        };
        s.labs = { "WBC": "0.5", "ANC": "200", "Hb": "9.0", "CRP": "8.0" };
        s.orders = { inj: ["Meropenem", "Vancomycin", "G-CSF"], po: ["Tylenol"] };
        s.handover = {
            lines: [{ text: "PICC", detail: "Lt.Arm, 4Fr, 40cm, Clean" }],
            drugs: [{ text: "Meropenem", detail: "1g IV" }, { text: "Vancomycin", detail: "1g Mix" }],
            vent: [{ text: "Room air", detail: "OK" }],
            etc: [{ text: "Isolation", detail: "Reverse" }]
        };

    } else if (i < 8) {
        s = { baseBP: "110/65", baseBT: 37.5, nursingProblem: "#1. 감염위험성" };
        s.labs = { "WBC": "1.0", "ANC": `4${i} 0`, "Hb": "8.5", "CRP": "4.0" };
        if (Math.random() > 0.4) {
            const re = pick(ROUTINE_EVENTS);
            s.eventName = re.name; s.eventTime = rand(10, 18);
            s.eventNote = re.note; s.eventAction = re.action;
        }
        s.orders = { inj: ["Meropenem", "G-CSF", "TPN"], po: [] };
        s.handover = {
            lines: [{ text: "PICC", detail: "Dressing changed today" }],
            drugs: [{ text: "TPN", detail: "SmofKabiven 42cc/hr" }],
            vent: [{ text: "Room air", detail: "Stable" }],
            neuro: [{ text: "GCS Check", detail: "Alert" }]
        };

    } else {
        s = { baseBP: "120/80", baseBT: 36.5, nursingProblem: "#1. 영양불균형" };
        s.labs = { "WBC": "4.0", "ANC": "1500", "Hb": "9.5", "CRP": "0.5" };
        s.orders = { inj: ["G-CSF"], po: [] };
        s.handover = {
            lines: [{ text: "PICC", detail: "Cap changed" }],
            drugs: [{ text: "G-CSF", detail: "SQ injected" }],
            etc: [{ text: "Isolation", detail: "Off" }]
        };
    }
    p4_gen.generateDay(i, s);
});


// ----------------------------------------------------------------------
// 5. 최종 Export (p1_data, p2_data... 대체)
// ----------------------------------------------------------------------
// 최종 환자 리스트
const basePatients = [
    {
        id: 1, name: "Synthetic Patient Alpha", room: "SYN-ROOM-01", registrationNo: "SYN-0001", age: "65", gender: "M", doctor: "Demo Critical Care Team",
        diagnosis: "Septic Shock", department: "감염내과", admitDate: "2025-11-23", bloodType: "A+", bodyInfo: "172cm/70kg",
        isolation: "Contact", admitReason: "Synthetic sepsis scenario", admissionRoute: "ER", initialComplaint: "Fever & Hypotension",
        admissionNote: "This is a synthetic research patient used for demo validation. Severe infection, hypotension, and pneumonia findings were generated to exercise high-acuity nursing handoff logic. No real patient information is included.",
        opDate: "-", dischargeDate: "TBD", religion: "-", diet: "NPO (금식)",
        pastHistory: ["Synthetic HTN history", "Synthetic DM history", "Synthetic treated TB history"],
        caution: "낙상주의",
        dailyData: p1_gen.dailyData
    },
    {
        id: 2, name: "Synthetic Patient Beta", room: "SYN-ROOM-02", registrationNo: "SYN-0002", age: "52", gender: "F", doctor: "Demo Surgical Team",
        diagnosis: "Rectal Cancer", department: "외과", admitDate: "2025-11-24", bloodType: "O-", bodyInfo: "160cm/55kg",
        isolation: "-", admitReason: "Synthetic operation scenario", admissionRoute: "OPD", initialComplaint: "Scheduled synthetic operation",
        admissionNote: "This is a synthetic research patient generated to test perioperative nursing handoff behavior. A rectal cancer surgery pathway is simulated for structured summary and carryover review. No real patient information is included.",
        opDate: "2025-11-25", dischargeDate: "TBD", religion: "-", diet: "SOW (오전 금식)",
        pastHistory: ["Synthetic appendectomy history", "Synthetic low-comorbidity profile"],
        caution: "낙상주의",
        dailyData: p2_gen.dailyData
    },
    {
        id: 3, name: "Synthetic Patient Gamma", room: "SYN-ROOM-03", registrationNo: "SYN-0003", age: "45", gender: "M", doctor: "Demo Neuro Team",
        diagnosis: "Cerebral Infarction", department: "신경과", admitDate: "2025-11-25", bloodType: "B+", bodyInfo: "175cm/80kg",
        isolation: "-", admitReason: "Synthetic neurologic deficit scenario", admissionRoute: "ER", initialComplaint: "Left-sided weakness",
        admissionNote: "This is a synthetic research patient for neurologic handoff testing. Acute cerebral infarction findings, aspiration risk, and functional decline were generated to stress identity summary and monitoring logic. No real patient information is included.",
        opDate: "-", dischargeDate: "TBD", religion: "-", diet: "L-tube Feeding",
        pastHistory: ["Synthetic hyperlipidemia history", "Synthetic smoking exposure history"],
        caution: "낙상고위험",
        dailyData: p3_gen.dailyData
    },
    {
        id: 4, name: "Synthetic Patient Delta", room: "SYN-ROOM-04", registrationNo: "SYN-0004", age: "72", gender: "M", doctor: "Demo Oncology Team",
        diagnosis: "Pancreatic Cancer", department: "종양내과", admitDate: "2025-11-26", bloodType: "AB+", bodyInfo: "168cm/62kg",
        isolation: "Reverse", admitReason: "Synthetic chemotherapy scenario", admissionRoute: "OPD", initialComplaint: "Scheduled synthetic chemotherapy admission",
        admissionNote: "This is a synthetic research patient used to demonstrate oncology handoff patterns. Chemotherapy, infection risk, and nutrition follow-up are simulated for demo purposes only. No real patient information is included.",
        opDate: "-", dischargeDate: "TBD", religion: "-", diet: "General Diet",
        pastHistory: ["Synthetic pancreatic cancer history", "Synthetic chemotherapy cycle history"],
        caution: "화재주의",
        dailyData: p4_gen.dailyData
    }
];

const SYNTHETIC_PATIENT_CODES = [
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon",
    "Zeta", "Eta", "Theta", "Iota", "Kappa",
    "Lambda", "Mu", "Nu", "Xi", "Omicron",
    "Pi", "Rho", "Sigma", "Tau", "Upsilon",
    "Phi", "Chi", "Psi", "Omega", "Atlas",
    "Nova", "Orion", "Lyra", "Vega", "Luna",
    "Solar", "Aqua", "Cedar", "Maple", "River",
    "Stone", "Harbor", "Clover", "Dawn", "Echo",
    "Flint", "Glade", "Haven", "Iris", "Juniper"
];

const SYNTHETIC_WARD_LAYOUT = [
    { ward: "내과계중환자실", roomPrefix: "MICU", roomBase: 1, roomDigits: 2, doctorTeam: "Demo Medical Critical Care Team" },
    { ward: "외과계중환자실", roomPrefix: "SICU", roomBase: 21, roomDigits: 2, doctorTeam: "Demo Surgical Critical Care Team" },
    { ward: "N병동", roomPrefix: "N", roomBase: 301, roomDigits: 3, doctorTeam: "Demo Neuro Team" },
    { ward: "S병동", roomPrefix: "S", roomBase: 401, roomDigits: 3, doctorTeam: "Demo Surgical Team" },
    { ward: "내과병동", roomPrefix: "M", roomBase: 501, roomDigits: 3, doctorTeam: "Demo Medical Team" },
    { ward: "재활병동", roomPrefix: "R", roomBase: 601, roomDigits: 3, doctorTeam: "Demo Rehab Team" }
];

const patients = expandSyntheticPatients(basePatients, 60);

function expandSyntheticPatients(baseList, targetCount) {
    const expanded = [];

    for (let index = 0; index < targetCount; index += 1) {
        const template = baseList[index % baseList.length];
        const cycle = Math.floor(index / baseList.length);
        const patientNumber = index + 1;
        const clone = JSON.parse(JSON.stringify(template));
        const code = SYNTHETIC_PATIENT_CODES[index] || `Case-${String(patientNumber).padStart(2, '0')}`;
        const admitDate = shiftIsoDate(template.admitDate, cycle);
        const ageValue = Number.parseInt(String(template.age || "0"), 10);
        const wardAssignment = buildSyntheticWardAssignment(patientNumber);

        clone.id = patientNumber;
        clone.name = `Synthetic Patient ${code}`;
        clone.ward = wardAssignment.ward;
        clone.room = wardAssignment.room;
        clone.registrationNo = `SYN-${String(patientNumber).padStart(4, '0')}`;
        clone.age = Number.isFinite(ageValue) ? String(Math.max(19, ageValue + cycle)) : String(40 + patientNumber);
        clone.department = template.department || "일반내과";
        clone.doctor = `${wardAssignment.doctorTeam} ${cycle > 0 ? `Unit ${cycle + 1}` : "Unit 1"}`;
        clone.admitDate = admitDate;
        clone.dischargeDate = "TBD";
        clone.admissionNote = `${template.admissionNote} Synthetic variant ${patientNumber} is used for public demo validation.`;
        clone.external = false;

        expanded.push(clone);
    }

    return expanded;
}

function buildSyntheticWardAssignment(patientNumber) {
    const absoluteIndex = Math.max(0, Number(patientNumber || 1) - 1);
    const wardSpec = SYNTHETIC_WARD_LAYOUT[absoluteIndex % SYNTHETIC_WARD_LAYOUT.length];
    const slot = Math.floor(absoluteIndex / SYNTHETIC_WARD_LAYOUT.length);
    const roomNumber = String(wardSpec.roomBase + slot).padStart(wardSpec.roomDigits, '0');

    return {
        ward: wardSpec.ward,
        room: `${wardSpec.roomPrefix}-${roomNumber}`,
        doctorTeam: wardSpec.doctorTeam
    };
}

function shiftIsoDate(value, daysToAdd) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    date.setDate(date.getDate() + Number(daysToAdd || 0));
    return date.toISOString().split('T')[0];
}
