const { getScenario, buildTranscriptionPrompt } = require("../../simulation/scenario");

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const DEFAULT_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
const DEFAULT_SIM_MODEL = process.env.OPENAI_SIM_MODEL || "gpt-4o-mini";

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function authorizationHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
  };
}

function parseBase64Audio(input) {
  const value = String(input || "");
  const payload = value.includes(",") ? value.split(",").pop() : value;
  return Buffer.from(payload || "", "base64");
}

async function transcribeAudio(options = {}) {
  if (!isConfigured()) {
    throw new Error("OpenAI API key is not configured");
  }

  const scenario = getScenario();
  const bytes = parseBase64Audio(options.audioBase64);
  const file = new File([bytes], options.fileName || "handoff.webm", {
    type: options.mimeType || "audio/webm"
  });
  const form = new FormData();
  form.append("file", file);
  form.append("model", options.model || DEFAULT_TRANSCRIBE_MODEL);
  form.append("response_format", "text");
  form.append("prompt", buildTranscriptionPrompt(scenario));

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: authorizationHeaders(),
    body: form
  });

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed: ${response.status} ${await response.text()}`);
  }

  return (await response.text()).trim();
}

async function createStructuredJsonResponse(options = {}) {
  if (!isConfigured()) {
    throw new Error("OpenAI API key is not configured");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: Object.assign(
      {
        "Content-Type": "application/json"
      },
      authorizationHeaders()
    ),
    body: JSON.stringify({
      model: options.model || DEFAULT_SIM_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: JSON.stringify(options.payload) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.schemaName,
          strict: true,
          schema: options.schema
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI structured response failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const content = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : "";
  if (!content) {
    throw new Error("OpenAI returned no structured content");
  }
  return JSON.parse(content);
}

async function generateFollowUp(transcript, fallback) {
  const scenario = getScenario();
  return createStructuredJsonResponse({
    schemaName: "simulation_follow_up",
    payload: {
      scenario: {
        title: scenario.title,
        receiverRole: scenario.receiverRole,
        patient: {
          name: scenario.patient.name,
          admissionReason: scenario.patient.admissionReason,
          codeStatus: scenario.patient.codeStatus,
          currentDate: scenario.patient.currentDate,
          currentShiftSummary: scenario.shiftHistory[scenario.shiftHistory.length - 1].summary,
          expectedCoverageTargets: scenario.expectedCoverageTargets
        }
      },
      learnerTranscript: transcript,
      deterministicQuestions: fallback.questions
    },
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["opening", "questions"],
      properties: {
        opening: { type: "string" },
        questions: {
          type: "array",
          minItems: 2,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "category", "question"],
            properties: {
              id: { type: "string" },
              category: { type: "string" },
              question: { type: "string" }
            }
          }
        }
      }
    },
    systemPrompt: [
      "You are the receiving telemetry nurse in a nursing handoff simulation.",
      "Use only the scenario facts provided.",
      "Ask focused follow-up questions that close important nursing handoff gaps.",
      "Return JSON only."
    ].join(" ")
  });
}

async function generateFeedback(transcript, followUpResponses, fallback) {
  const scenario = getScenario();
  return createStructuredJsonResponse({
    schemaName: "simulation_feedback",
    payload: {
      scenario: {
        title: scenario.title,
        patient: {
          name: scenario.patient.name,
          admissionReason: scenario.patient.admissionReason,
          codeStatus: scenario.patient.codeStatus,
          expectedCoverageTargets: scenario.expectedCoverageTargets,
          exemplarHandoff: scenario.exemplarHandoff
        }
      },
      learnerTranscript: transcript,
      followUpResponses: followUpResponses,
      deterministicFeedback: fallback
    },
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "overallScore",
        "strengths",
        "missingInformation",
        "criticalOmissions",
        "prioritizationProblems",
        "communicationClarity",
        "clinicalOrganization",
        "safetyIssuesMissed",
        "improvedHandoff",
        "anticipatedFollowUpQuestions"
      ],
      properties: {
        overallScore: { type: "integer", minimum: 0, maximum: 100 },
        strengths: { type: "array", maxItems: 5, items: { type: "string" } },
        missingInformation: { type: "array", maxItems: 6, items: { type: "string" } },
        criticalOmissions: { type: "array", maxItems: 4, items: { type: "string" } },
        prioritizationProblems: { type: "array", maxItems: 4, items: { type: "string" } },
        communicationClarity: { type: "string" },
        clinicalOrganization: { type: "string" },
        safetyIssuesMissed: { type: "array", maxItems: 4, items: { type: "string" } },
        improvedHandoff: { type: "string" },
        anticipatedFollowUpQuestions: { type: "array", maxItems: 4, items: { type: "string" } }
      }
    },
    systemPrompt: [
      "You are grading a serious nursing handoff simulation.",
      "Use only the scenario facts and do not invent chart details.",
      "Keep the feedback concrete, clinically grounded, and concise.",
      "Return JSON only."
    ].join(" ")
  });
}

module.exports = {
  isConfigured,
  transcribeAudio,
  generateFollowUp,
  generateFeedback
};
