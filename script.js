(function handoffSimulationApp() {
  // Legacy MCP endpoint retained as a documented runtime path: /api/patients-mcp
  const STEP_ORDER = ["landing", "briefing", "emr", "record", "confirm", "followup", "feedback"];
  const STEP_LABELS = {
    landing: "Intro",
    briefing: "Briefing",
    emr: "EMR Review",
    record: "Handoff Recording",
    confirm: "Transcript Check",
    followup: "AI Follow-up",
    feedback: "Feedback"
  };

  const runtime = {
    scenario: null,
    analysis: null,
    config: {
      openaiConfigured: false,
      transcriptionProvider: "browser-or-manual",
      qaMode: false
    },
    state: {
      step: "landing",
      selectedDate: "",
      emrTab: "overview",
      prepNotes: "",
      handoffTranscript: "",
      recordingStatus: "idle",
      recordingMessage: "Press record and give your shift handoff naturally.",
      followUp: {
        opening: "",
        questions: [],
        answers: []
      },
      answerDraft: "",
      feedback: null
    },
    media: {
      recorder: null,
      chunks: [],
      stream: null,
      recognition: null,
      browserTranscript: "",
      mode: "handoff"
    }
  };

  function initialize() {
    runtime.scenario = window.HANDOFF_SIM_DATA.getScenario();
    runtime.state.selectedDate = runtime.scenario.patient.currentDate;
    runtime.config.qaMode = window.location.hostname === "localhost" || window.location.search.includes("qa=1");
    document.body.classList.toggle("qa-mode", runtime.config.qaMode);
    bindEvents();
    fetchConfig()
      .catch(function ignore() {
        return null;
      })
      .finally(function finalize() {
        tryBuildAnalysis();
        renderApp();
      });
  }

  function bindEvents() {
    document.addEventListener("click", handleClicks);
    document.addEventListener("input", handleInputs);
  }

  async function fetchConfig() {
    const response = await fetch("/api/simulation");
    if (!response.ok) return;
    const payload = await response.json();
    runtime.config.openaiConfigured = Boolean(payload.openaiConfigured);
    runtime.config.transcriptionProvider = payload.transcriptionProvider || "browser-or-manual";
    runtime.config.qaMode = Boolean(payload.qaMode) || runtime.config.qaMode;
    document.body.classList.toggle("qa-mode", runtime.config.qaMode);
  }

  function tryBuildAnalysis() {
    if (!window.handoffAppApi || typeof window.handoffAppApi.buildHandoffAnalysis !== "function") return;
    runtime.analysis = window.handoffAppApi.buildHandoffAnalysis(
      runtime.scenario.patient,
      window.HANDOFF_SIM_DATA.getTimelineDates()
    );
  }

  function setStep(step) {
    runtime.state.step = step;
    if (step === "record") runtime.state.recordingMessage = "Press record and give your shift handoff naturally.";
    window.scrollTo(0, 0);
    renderApp();
  }

  function currentDay() {
    return runtime.scenario.patient.dailyData[runtime.state.selectedDate];
  }

  function latestShiftHistory() {
    return runtime.scenario.shiftHistory[runtime.scenario.shiftHistory.length - 1];
  }

  function renderApp() {
    renderStatus();
    renderStepper();
    renderPatientSnapshot();
    renderProgress();
    renderLanding();
    renderBriefing();
    renderEmr();
    renderRecording();
    renderTranscriptReview();
    renderFollowUp();
    renderFeedback();
    updateVisibleStep();
    syncAutomationHooks();
  }

  function renderStatus() {
    const apiStatusPill = document.getElementById("apiStatusPill");
    const voiceStatusPill = document.getElementById("voiceStatusPill");
    if (apiStatusPill) {
      apiStatusPill.textContent = runtime.config.openaiConfigured ? "OpenAI enabled" : "Fallback mode";
    }
    if (voiceStatusPill) {
      voiceStatusPill.textContent = runtime.config.openaiConfigured
        ? "Server transcription ready"
        : "Browser transcription / manual fallback";
    }
  }

  function renderStepper() {
    const root = document.getElementById("stepperList");
    if (!root) return;
    root.innerHTML = STEP_ORDER.map(function buildStep(step, index) {
      const active = runtime.state.step === step ? "active" : "";
      return `<li class="${active}"><div class="step-index">${index + 1}</div><div><strong>${STEP_LABELS[step]}</strong><p class="muted">${step === "feedback" ? "Review score and retry." : "Complete this stage to move forward."}</p></div></li>`;
    }).join("");
  }

  function renderPatientSnapshot() {
    const root = document.getElementById("patientSnapshot");
    const notes = document.getElementById("prepNotesInput");
    if (notes && notes.value !== runtime.state.prepNotes) {
      notes.value = runtime.state.prepNotes;
    }
    if (!root) return;
    const patient = runtime.scenario.patient;
    root.innerHTML = `
      <div class="metric-card">
        <p class="section-label">Patient</p>
        <h3>${patient.name}</h3>
        <p class="muted">${patient.age} ${patient.gender} • ${patient.room}</p>
      </div>
      <div class="metric-card">
        <p class="section-label">Current shift</p>
        <strong>${patient.currentShift}</strong>
        <p class="muted">${latestShiftHistory().summary}</p>
      </div>
    `;
  }

  function renderProgress() {
    const fill = document.getElementById("progressFill");
    if (!fill) return;
    fill.style.width = `${(STEP_ORDER.indexOf(runtime.state.step) / (STEP_ORDER.length - 1)) * 100}%`;
  }

  function updateVisibleStep() {
    document.querySelectorAll(".view").forEach(function toggleView(element) {
      element.classList.toggle("is-active", element.getAttribute("data-step") === runtime.state.step);
    });
  }

  function cardList(title, items) {
    return `<section class="info-card"><p class="section-label">${title}</p><div class="detail-list">${items.map(function toItem(item) { return `<p>${item}</p>`; }).join("")}</div></section>`;
  }

  function renderLanding() {
    const root = document.getElementById("landingScenarioCard");
    if (!root) return;
    root.innerHTML = `
      <section class="info-card">
        <p class="section-label">Case at a glance</p>
        <h3>${runtime.scenario.patient.admissionReason}</h3>
        <div class="metric-grid">
          <div class="metric-card"><p class="section-label">Hospital day</p><div class="metric-value">${runtime.scenario.patient.hospitalDay}</div></div>
          <div class="metric-card"><p class="section-label">Code status</p><div class="metric-value">${runtime.scenario.patient.codeStatus}</div></div>
          <div class="metric-card"><p class="section-label">Current oxygen</p><div class="metric-value">${currentDay().handover.vent[0].detail}</div></div>
        </div>
      </section>
    `;
  }

  function renderBriefing() {
    const patient = runtime.scenario.patient;
    const briefingCase = document.getElementById("briefingCase");
    const briefingGoals = document.getElementById("briefingGoals");
    const briefingShiftHistory = document.getElementById("briefingShiftHistory");
    if (briefingCase) {
      briefingCase.innerHTML = `
        <p class="section-label">Case overview</p>
        <h3>${patient.name}</h3>
        <p class="muted">${patient.admissionReason}</p>
        <div class="key-value-grid">
          <div class="mini-card"><p class="section-label">Room</p><strong>${patient.room}</strong></div>
          <div class="mini-card"><p class="section-label">MRN</p><strong>${patient.mrn}</strong></div>
          <div class="mini-card"><p class="section-label">Allergies</p><strong>${patient.allergies.join(", ")}</strong></div>
          <div class="mini-card"><p class="section-label">Service</p><strong>${patient.admittingService}</strong></div>
        </div>
      `;
    }
    if (briefingGoals) {
      briefingGoals.innerHTML = `
        <p class="section-label">Learning goals</p>
        <div class="detail-list">${patient.learningGoals.map(function toGoal(goal) { return `<p>${goal}</p>`; }).join("")}</div>
        <p class="section-label">Problem list</p>
        <div class="detail-list">${patient.problemList.map(function toProblem(problem) { return `<p>${problem}</p>`; }).join("")}</div>
      `;
    }
    if (briefingShiftHistory) {
      briefingShiftHistory.innerHTML = `
        <p class="section-label">Multi-day history</p>
        ${runtime.scenario.shiftHistory.map(function toShift(shift) {
          return `<div class="thread-card ai"><strong>${shift.label}</strong><p class="muted">${shift.summary}</p></div>`;
        }).join("")}
      `;
    }
  }

  function renderEmr() {
    renderDateTabs();
    renderEmrTabs();
    renderEmrMain();
    renderEmrSide();
  }

  function renderDateTabs() {
    const root = document.getElementById("dateTabs");
    if (!root) return;
    root.innerHTML = window.HANDOFF_SIM_DATA.getTimelineDates().map(function toDate(date) {
      return `<button class="date-chip ${runtime.state.selectedDate === date ? "active" : ""}" data-action="select-date" data-date="${date}">${date}</button>`;
    }).join("");
  }

  function renderEmrTabs() {
    const root = document.getElementById("emrTabs");
    const tabs = [["overview", "Overview"], ["trends", "Trend Board"], ["meds", "Med Changes"], ["notes", "Nursing Notes"], ["history", "Shift History"]];
    if (!root) return;
    root.innerHTML = tabs.map(function toTab(tab) {
      return `<button class="tab-chip ${runtime.state.emrTab === tab[0] ? "active" : ""}" data-action="select-tab" data-tab="${tab[0]}">${tab[1]}</button>`;
    }).join("");
  }

  function renderEmrMain() {
    const root = document.getElementById("emrMainContent");
    const day = currentDay();
    if (!root) return;
    if (runtime.state.emrTab === "overview") {
      root.innerHTML = `
        <div class="cards-grid">
          ${cardList("Current priorities", [day.nursingProblem, day.providerUpdate].concat(day.plan))}
          ${cardList("Safety risks", day.safetyRisks)}
          ${cardList("Pending tasks", day.pendingTasks)}
          ${cardList("Provider updates", day.specials)}
        </div>
        <div class="metric-grid">
          <div class="metric-card"><p class="section-label">Vitals</p><div class="metric-value">${day.vital.bp}</div><p class="muted">HR ${day.vital.hr} • RR ${day.vital.rr} • Temp ${day.vital.bt} • SpO2 ${day.vital.spo2}%</p></div>
          <div class="metric-card"><p class="section-label">I/O</p><div class="metric-value">${day.io.net}</div><p class="muted">In ${day.io.input} • Out ${day.io.totalOutput}</p></div>
          <div class="metric-card"><p class="section-label">Activity</p><div class="metric-value-soft">${day.activity}</div></div>
          <div class="metric-card"><p class="section-label">Devices</p><div class="metric-value-soft">${day.handover.vent[0].detail}</div></div>
        </div>
      `;
      return;
    }

    if (runtime.state.emrTab === "trends") {
      const dates = window.HANDOFF_SIM_DATA.getTimelineDates();
      root.innerHTML = `
        <div class="cards-grid">
          ${cardList("Vital trend", dates.map(function toRow(date) {
            const item = runtime.scenario.patient.dailyData[date];
            return `${date}: BP ${item.vital.bp}, HR ${item.vital.hr}, RR ${item.vital.rr}, Temp ${item.vital.bt}, SpO2 ${item.vital.spo2}%`;
          }))}
          ${cardList("Lab trend", dates.map(function toLabRow(date) {
            const item = runtime.scenario.patient.dailyData[date];
            return `${date}: WBC ${item.labs.CBC.WBC}, Cr ${item.labs.BMP.Cr}, K ${item.labs.BMP.K}, Mg ${item.labs.BMP.Mg}, BNP ${item.labs.Other.BNP || "-"}`;
          }))}
          ${cardList("Fluid balance", dates.map(function toIoRow(date) {
            const item = runtime.scenario.patient.dailyData[date];
            return `${date}: ${item.io.net}, weight ${item.weightKg} kg`;
          }))}
        </div>
      `;
      return;
    }

    if (runtime.state.emrTab === "meds") {
      root.innerHTML = `
        <div class="cards-grid">
          ${cardList("Active IV / procedural medications", day.orders.inj)}
          ${cardList("Active oral medications", day.orders.po)}
          ${cardList("Medication changes", day.medicationChanges)}
          ${cardList("Schedule and timing", day.medSchedule)}
        </div>
      `;
      return;
    }

    if (runtime.state.emrTab === "notes") {
      root.innerHTML = `
        <div class="cards-grid">
          ${cardList("Nursing notes", day.nursingNotes)}
          ${cardList("Overnight events", day.overnightEvents)}
          ${cardList("Orders to follow through", day.docOrders.routine.concat(day.docOrders.prn))}
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="cards-grid">
        ${cardList("Shift-to-shift history", runtime.scenario.shiftHistory.map(function toHistory(item) { return `${item.label}: ${item.summary}`; }))}
        ${cardList("Baseline history", runtime.scenario.patient.baselineHistory)}
        ${cardList("Handoff focus checklist", runtime.scenario.currentFocusChecklist)}
      </div>
    `;
  }

  function renderEmrSide() {
    const root = document.getElementById("emrSideContent");
    const day = currentDay();
    if (!root) return;
    let analysisSummary = runtime.analysis && runtime.analysis.longitudinalSummary
      ? runtime.analysis.longitudinalSummary.conciseSummary || ""
      : "";
    if (!analysisSummary || /정보|summary unavailable/i.test(analysisSummary)) {
      analysisSummary = `${day.providerUpdate} Next tasks: ${day.pendingTasks.slice(0, 2).join("; ")}.`;
    }
    root.innerHTML = `
      <section class="info-card">
        <p class="section-label">Current chart focus</p>
        <div class="detail-list">
          <p>Code status: ${runtime.scenario.patient.codeStatus}</p>
          <p>Current oxygen: ${day.handover.vent[0].detail}</p>
          <p>Current rhythm: ${day.handover.drugs[0].detail}</p>
          <p>Repeat labs: ${day.pendingTasks[0]}</p>
        </div>
      </section>
      <section class="info-card">
        <p class="section-label">Engine summary</p>
        <p class="muted">${analysisSummary}</p>
      </section>
    `;
  }

  function renderRecording() {
    const recorderCard = document.getElementById("handoffRecorderCard");
    const expectations = document.getElementById("handoffExpectations");
    if (recorderCard) {
      recorderCard.innerHTML = buildRecorderMarkup({
        title: "Initial handoff",
        status: runtime.state.recordingStatus,
        message: runtime.state.recordingMessage,
        transcriptPreview: runtime.state.handoffTranscript,
        primaryAction: runtime.state.recordingStatus === "recording" ? "stop-recording" : "start-recording",
        primaryLabel: runtime.state.recordingStatus === "recording" ? "Stop Recording" : "Start Recording",
        secondaryAction: "load-demo-transcript",
        secondaryLabel: "Load Demo Transcript",
        showSecondary: runtime.config.qaMode
      });
    }
    if (expectations) {
      expectations.innerHTML = `
        <p class="section-label">What the receiver needs</p>
        <div class="detail-list">
          <p>Lead with why the patient is here and why discharge is not yet safe.</p>
          <p>Name the oxygen, renal, electrolyte, and fall-risk issues before lower-priority background.</p>
          <p>Close with exactly what the next nurse must follow up today.</p>
        </div>
      `;
    }
  }

  function renderTranscriptReview() {
    const transcriptInput = document.getElementById("handoffTranscriptInput");
    const transcriptSupport = document.getElementById("transcriptSupport");
    if (transcriptInput) transcriptInput.value = runtime.state.handoffTranscript;
    if (transcriptSupport) {
      transcriptSupport.innerHTML = `
        <p class="section-label">Review checklist</p>
        <div class="detail-list">
          <p>Did you say the patient is still on 2 L nasal cannula and desaturates with activity?</p>
          <p>Did you connect softer blood pressure and higher creatinine to reduced diuresis?</p>
          <p>Did you state the pending BMP/Mg, chest x-ray, sputum culture, PT, and wound care follow-up?</p>
        </div>
      `;
    }
  }

  function renderFollowUp() {
    const thread = document.getElementById("followupThread");
    const promptCard = document.getElementById("followupPromptCard");
    const recorderCard = document.getElementById("followupRecorderCard");
    if (thread) {
      const cards = [];
      if (runtime.state.followUp.opening) {
        cards.push(`<div class="thread-card ai"><strong>${runtime.scenario.receiverName}</strong><p class="muted">${runtime.state.followUp.opening}</p></div>`);
      }
      runtime.state.followUp.questions.forEach(function eachQuestion(question, index) {
        cards.push(`<div class="thread-card ai"><strong>Question ${index + 1}</strong><p>${question.question}</p></div>`);
        if (runtime.state.followUp.answers[index]) {
          cards.push(`<div class="thread-card user"><strong>Your answer</strong><p>${runtime.state.followUp.answers[index].answer}</p></div>`);
        }
      });
      thread.innerHTML = cards.join("") || `<div class="thread-card ai"><p class="muted">Submit the transcript to generate focused receiver questions.</p></div>`;
    }
    if (promptCard) {
      const nextQuestion = runtime.state.followUp.questions[runtime.state.followUp.answers.length];
      promptCard.innerHTML = nextQuestion
        ? `<p class="section-label">Answer in sequence</p><h3>${nextQuestion.question}</h3><p class="muted">You can dictate or type. Keep the answer nursing-specific and grounded in the chart.</p>`
        : `<p class="section-label">Follow-up complete</p><p class="muted">All receiver questions have answers. Generate final feedback when you are ready.</p>`;
    }
    if (recorderCard) {
      const nextQuestion = runtime.state.followUp.questions[runtime.state.followUp.answers.length];
      recorderCard.innerHTML = nextQuestion ? `
        ${buildRecorderMarkup({
          title: "Follow-up answer",
          status: runtime.state.recordingStatus,
          message: runtime.state.recordingMessage,
          transcriptPreview: runtime.state.answerDraft,
          primaryAction: runtime.state.recordingStatus === "recording" ? "stop-answer-recording" : "start-answer-recording",
          primaryLabel: runtime.state.recordingStatus === "recording" ? "Stop Recording" : "Record Answer",
          secondaryAction: "load-demo-answer",
          secondaryLabel: "Load Demo Answer",
          showSecondary: runtime.config.qaMode
        })}
        <textarea class="answer-input" id="followupAnswerInput" placeholder="Type or refine your answer here.">${runtime.state.answerDraft}</textarea>
        <div class="stack-row"><button class="btn btn-primary" data-action="submit-followup-answer">Save Answer</button></div>
      ` : `<p class="muted">No more questions pending.</p>`;
    }
  }

  function renderFeedback() {
    const root = document.getElementById("feedbackContent");
    if (!root) return;
    if (!runtime.state.feedback) {
      root.innerHTML = `<div class="info-card"><p class="muted">Final feedback will appear here after the follow-up exchange.</p></div>`;
      return;
    }
    const feedback = runtime.state.feedback;
    root.innerHTML = `
      <div class="score-hero">
        <section class="info-card">
          <div class="score-ring"><strong>${feedback.overallScore}</strong></div>
          <p class="section-label">Overall score</p>
        </section>
        <section class="info-card">
          <p class="section-label">Category scores</p>
          <div class="metric-grid">
            ${Object.keys(feedback.categoryScores).map(function toScore(key) {
              return `<div class="metric-card"><p class="section-label">${key}</p><div class="metric-value">${feedback.categoryScores[key]}</div></div>`;
            }).join("")}
          </div>
        </section>
      </div>
      <div class="feedback-grid">
        <section class="feedback-card"><p class="section-label">Strengths</p><div class="detail-list">${feedback.strengths.map(function toItem(item) { return `<p>${item}</p>`; }).join("")}</div></section>
        <section class="feedback-card"><p class="section-label">Missing information</p><div class="detail-list">${feedback.missingInformation.map(function toItem(item) { return `<p>${item}</p>`; }).join("")}</div></section>
        <section class="feedback-card"><p class="section-label">Critical omissions</p><div class="detail-list">${feedback.criticalOmissions.map(function toItem(item) { return `<p>${item}</p>`; }).join("") || "<p>None after follow-up.</p>"}</div></section>
        <section class="feedback-card"><p class="section-label">Safety issues missed</p><div class="detail-list">${feedback.safetyIssuesMissed.map(function toItem(item) { return `<p>${item}</p>`; }).join("") || "<p>No major safety miss identified.</p>"}</div></section>
        <section class="feedback-card"><p class="section-label">Prioritization problems</p><div class="detail-list">${feedback.prioritizationProblems.map(function toItem(item) { return `<p>${item}</p>`; }).join("")}</div></section>
        <section class="feedback-card"><p class="section-label">Communication clarity</p><p class="muted">${feedback.communicationClarity}</p><p class="section-label">Clinical organization</p><p class="muted">${feedback.clinicalOrganization}</p></section>
      </div>
      <section class="info-card">
        <p class="section-label">Suggested improved handoff</p>
        <p class="muted">${feedback.improvedHandoff}</p>
      </section>
    `;
  }

  function buildRecorderMarkup(config) {
    return `
      <p class="section-label">${config.title}</p>
      <div class="status-pill">${config.status}</div>
      <div class="recorder-visual">${Array.from({ length: 10 }, function createBar() { return "<span></span>"; }).join("")}</div>
      <p class="muted">${config.message}</p>
      ${config.transcriptPreview ? `<div class="thread-card user"><strong>Transcript preview</strong><p>${config.transcriptPreview}</p></div>` : ""}
      <div class="stack-row">
        <button class="btn btn-primary" data-action="${config.primaryAction}">${config.primaryLabel}</button>
        ${config.showSecondary ? `<button class="btn btn-secondary" data-action="${config.secondaryAction}">${config.secondaryLabel}</button>` : ""}
      </div>
    `;
  }

  function syncAutomationHooks() {
    window.render_game_to_text = function renderGameToText() {
      return JSON.stringify({
        step: runtime.state.step,
        selectedDate: runtime.state.selectedDate,
        emrTab: runtime.state.emrTab,
        recordingStatus: runtime.state.recordingStatus,
        transcriptReady: Boolean(runtime.state.handoffTranscript),
        followupQuestions: runtime.state.followUp.questions.length,
        followupAnswers: runtime.state.followUp.answers.length,
        feedbackReady: Boolean(runtime.state.feedback)
      });
    };
    window.advanceTime = function advanceTime(ms) {
      return new Promise(function resolveLater(resolve) {
        window.setTimeout(resolve, Math.min(ms, 50));
      });
    };
  }

  function handleClicks(event) {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;
    const action = actionNode.getAttribute("data-action");
    if (action === "goto") setStep(actionNode.getAttribute("data-target"));
    if (action === "select-date") {
      runtime.state.selectedDate = actionNode.getAttribute("data-date");
      renderApp();
    }
    if (action === "select-tab") {
      runtime.state.emrTab = actionNode.getAttribute("data-tab");
      renderApp();
    }
    if (action === "start-recording") startRecording("handoff");
    if (action === "stop-recording") stopRecording();
    if (action === "load-demo-transcript") {
      runtime.state.handoffTranscript = runtime.scenario.demo.initialTranscript;
      runtime.state.recordingStatus = "ready";
      runtime.state.recordingMessage = "Demo transcript loaded.";
      setStep("confirm");
    }
    if (action === "start-followup") createFollowUp();
    if (action === "start-answer-recording") startRecording("followup");
    if (action === "stop-answer-recording") stopRecording();
    if (action === "submit-followup-answer") saveFollowUpAnswer();
    if (action === "finish-followup") createFeedback();
    if (action === "load-demo-answer") loadDemoAnswer();
    if (action === "run-demo-session") runDemoSession();
    if (action === "qa-jump") setStep(actionNode.getAttribute("data-target"));
    if (action === "retry-session") retrySession();
    if (action === "restart-app") restartSimulation();
  }

  function handleInputs(event) {
    if (event.target.id === "prepNotesInput") runtime.state.prepNotes = event.target.value;
    if (event.target.id === "handoffTranscriptInput") runtime.state.handoffTranscript = event.target.value;
    if (event.target.id === "followupAnswerInput") runtime.state.answerDraft = event.target.value;
  }

  async function startRecording(mode) {
    runtime.media.mode = mode;
    runtime.media.browserTranscript = "";
    runtime.state.recordingStatus = "recording";
    runtime.state.recordingMessage = "Recording in progress. Speak naturally and stop when finished.";
    renderApp();
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      runtime.media.recognition = new Recognition();
      runtime.media.recognition.continuous = true;
      runtime.media.recognition.interimResults = true;
      runtime.media.recognition.onresult = function onResult(resultEvent) {
        runtime.media.browserTranscript = Array.from(resultEvent.results).map(function toChunk(result) {
          return result[0].transcript;
        }).join(" ").trim();
      };
      runtime.media.recognition.start();
    }
    try {
      runtime.media.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      runtime.media.chunks = [];
      runtime.media.recorder = new MediaRecorder(runtime.media.stream);
      runtime.media.recorder.ondataavailable = function onData(chunkEvent) {
        if (chunkEvent.data.size) runtime.media.chunks.push(chunkEvent.data);
      };
      runtime.media.recorder.start();
    } catch (error) {
      if (runtime.media.recognition) runtime.media.recognition.stop();
      runtime.state.recordingStatus = "ready";
      runtime.state.recordingMessage = "Microphone unavailable. Type or load a demo transcript instead.";
      renderApp();
    }
  }

  async function stopRecording() {
    runtime.state.recordingStatus = "processing";
    runtime.state.recordingMessage = "Processing audio...";
    renderApp();

    if (runtime.media.recognition) {
      runtime.media.recognition.stop();
    }

    const audioBlob = await new Promise(function finish(resolve) {
      if (!runtime.media.recorder) {
        resolve(null);
        return;
      }
      runtime.media.recorder.onstop = function onStop() {
        resolve(new Blob(runtime.media.chunks, { type: runtime.media.recorder.mimeType || "audio/webm" }));
      };
      runtime.media.recorder.stop();
    });

    if (runtime.media.stream) {
      runtime.media.stream.getTracks().forEach(function stopTrack(track) { track.stop(); });
    }

    const base64Audio = audioBlob ? await blobToDataUrl(audioBlob) : "";
    const payload = await postSimulationAction("transcribe", {
      audioBase64: base64Audio,
      mimeType: audioBlob && audioBlob.type,
      fileName: runtime.media.mode === "handoff" ? "handoff.webm" : "followup.webm",
      browserTranscript: runtime.media.browserTranscript
    });
    const transcript = payload && payload.transcript ? payload.transcript : runtime.media.browserTranscript;

    runtime.state.recordingStatus = "ready";
    runtime.state.recordingMessage = transcript ? "Transcript ready. Review before submitting." : "No transcript captured. Type manually if needed.";
    if (runtime.media.mode === "handoff") {
      runtime.state.handoffTranscript = transcript;
      setStep("confirm");
      return;
    }
    runtime.state.answerDraft = transcript;
    renderApp();
  }

  function blobToDataUrl(blob) {
    return new Promise(function read(resolve) {
      const reader = new FileReader();
      reader.onloadend = function onLoad() { resolve(reader.result || ""); };
      reader.readAsDataURL(blob);
    });
  }

  async function createFollowUp() {
    const payload = await postSimulationAction("followup", {
      transcript: runtime.state.handoffTranscript
    });
    runtime.state.followUp.opening = payload.opening || "";
    runtime.state.followUp.questions = payload.questions || [];
    runtime.state.followUp.answers = [];
    runtime.state.answerDraft = "";
    setStep("followup");
  }

  function saveFollowUpAnswer() {
    const nextQuestion = runtime.state.followUp.questions[runtime.state.followUp.answers.length];
    if (!nextQuestion || !runtime.state.answerDraft.trim()) return;
    runtime.state.followUp.answers.push({
      id: nextQuestion.id,
      question: nextQuestion.question,
      answer: runtime.state.answerDraft.trim()
    });
    runtime.state.answerDraft = "";
    runtime.state.recordingStatus = "idle";
    runtime.state.recordingMessage = "Ready for the next answer.";
    renderApp();
  }

  function loadDemoAnswer() {
    const nextQuestion = runtime.state.followUp.questions[runtime.state.followUp.answers.length];
    if (!nextQuestion) return;
    runtime.state.answerDraft = runtime.scenario.demo.followUpAnswers[nextQuestion.id] || "I would watch oxygen, renal function, mobility, and pending tests closely on the next shift.";
    renderApp();
  }

  async function createFeedback() {
    const payload = await postSimulationAction("feedback", {
      transcript: runtime.state.handoffTranscript,
      followUpResponses: runtime.state.followUp.answers
    });
    runtime.state.feedback = payload;
    setStep("feedback");
  }

  async function postSimulationAction(action, extraPayload) {
    const response = await fetch("/api/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, extraPayload || {}))
    });
    if (!response.ok) {
      throw new Error(`Simulation API failed with ${response.status}`);
    }
    return response.json();
  }

  function retrySession() {
    runtime.state.handoffTranscript = "";
    runtime.state.recordingStatus = "idle";
    runtime.state.recordingMessage = "Press record and give your shift handoff naturally.";
    runtime.state.followUp = { opening: "", questions: [], answers: [] };
    runtime.state.answerDraft = "";
    runtime.state.feedback = null;
    setStep("record");
  }

  function restartSimulation() {
    runtime.state.selectedDate = runtime.scenario.patient.currentDate;
    runtime.state.emrTab = "overview";
    runtime.state.prepNotes = "";
    retrySession();
    setStep("landing");
  }

  function runDemoSession() {
    runtime.state.handoffTranscript = runtime.scenario.demo.initialTranscript;
    runtime.state.followUp.opening = "I heard your initial handoff. I want to tighten a few points before I take the patient.";
    runtime.state.followUp.questions = window.HANDOFF_SIM_EVAL.pickFollowUpQuestions(runtime.state.handoffTranscript, runtime.scenario, 3).questions;
    runtime.state.followUp.answers = [];
    runtime.state.feedback = null;
    const demoAnswers = runtime.scenario.demo.followUpAnswers;
    const states = [
      function goBriefing() { setStep("briefing"); },
      function goEmr() { setStep("emr"); },
      function goConfirm() { setStep("confirm"); },
      function goFollowupOne() { setStep("followup"); runtime.state.followUp.answers = [{ id: runtime.state.followUp.questions[0].id, answer: demoAnswers[runtime.state.followUp.questions[0].id] || "Demo answer" }]; renderApp(); },
      function goFollowupTwo() {
        runtime.state.followUp.answers = runtime.state.followUp.questions.slice(0, 2).map(function toAnswer(question) {
          return { id: question.id, answer: demoAnswers[question.id] || "Demo answer" };
        });
        renderApp();
      },
      function goFollowupThree() {
        runtime.state.followUp.answers = runtime.state.followUp.questions.map(function toAnswer(question) {
          return { id: question.id, answer: demoAnswers[question.id] || "Demo answer" };
        });
        renderApp();
      },
      function goFeedback() {
        runtime.state.feedback = window.HANDOFF_SIM_EVAL.buildFeedback(runtime.state.handoffTranscript, runtime.state.followUp.answers, runtime.scenario);
        setStep("feedback");
      }
    ];
    states.forEach(function eachStep(fn, index) {
      window.setTimeout(fn, index * 700);
    });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
