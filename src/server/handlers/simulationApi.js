const { getScenario } = require("../../simulation/scenario");
const {
  buildFeedback,
  pickFollowUpQuestions
} = require("../../simulation/evaluator");
const openaiService = require("../services/openaiSimulationService");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(String(body));
  } catch (error) {
    return {};
  }
}

function sanitizeQuestions(payload, fallback) {
  const fallbackQuestions = fallback.questions || [];
  const questions = Array.isArray(payload && payload.questions) ? payload.questions : [];
  const normalized = questions
    .map(function normalizeQuestion(item, index) {
      return {
        id: item.id || fallbackQuestions[index] && fallbackQuestions[index].id || `followup-${index + 1}`,
        category: item.category || fallbackQuestions[index] && fallbackQuestions[index].category || "follow-up",
        question: item.question || fallbackQuestions[index] && fallbackQuestions[index].question || ""
      };
    })
    .filter(function hasText(item) { return item.question; });
  return {
    opening: payload && payload.opening ? payload.opening : fallback.opening,
    questions: normalized.length ? normalized : fallbackQuestions
  };
}

function sanitizeFeedback(payload, fallback) {
  const safe = payload || {};
  return {
    overallScore: Number.isFinite(Number(safe.overallScore)) ? Number(safe.overallScore) : fallback.overallScore,
    categoryScores: fallback.categoryScores,
    strengths: Array.isArray(safe.strengths) && safe.strengths.length ? safe.strengths : fallback.strengths,
    missingInformation: Array.isArray(safe.missingInformation) && safe.missingInformation.length ? safe.missingInformation : fallback.missingInformation,
    criticalOmissions: Array.isArray(safe.criticalOmissions) ? safe.criticalOmissions : fallback.criticalOmissions,
    prioritizationProblems: Array.isArray(safe.prioritizationProblems) ? safe.prioritizationProblems : fallback.prioritizationProblems,
    communicationClarity: safe.communicationClarity || fallback.communicationClarity,
    clinicalOrganization: safe.clinicalOrganization || fallback.clinicalOrganization,
    safetyIssuesMissed: Array.isArray(safe.safetyIssuesMissed) ? safe.safetyIssuesMissed : fallback.safetyIssuesMissed,
    improvedHandoff: safe.improvedHandoff || fallback.improvedHandoff,
    anticipatedFollowUpQuestions: Array.isArray(safe.anticipatedFollowUpQuestions) && safe.anticipatedFollowUpQuestions.length
      ? safe.anticipatedFollowUpQuestions
      : fallback.anticipatedFollowUpQuestions,
    progressDelta: fallback.progressDelta,
    coverage: fallback.coverage
  };
}

exports.handler = async function handler(event) {
  const method = String(event.httpMethod || "GET").toUpperCase();
  const query = event.queryStringParameters || {};
  const body = parseBody(event.body);
  const scenario = getScenario();

  if (method === "GET") {
    if (String(query.action || "") === "scenario") {
      return jsonResponse(200, {
        ok: true,
        scenario: scenario,
        openaiConfigured: openaiService.isConfigured()
      });
    }

    return jsonResponse(200, {
      ok: true,
      openaiConfigured: openaiService.isConfigured(),
      transcriptionProvider: openaiService.isConfigured() ? "openai" : "browser-or-manual",
      qaMode: true
    });
  }

  if (method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const action = String(body.action || "").trim().toLowerCase();
  if (!action) {
    return jsonResponse(400, { error: "Missing simulation action" });
  }

  try {
    if (action === "transcribe") {
      const browserTranscript = String(body.browserTranscript || body.manualTranscript || "").trim();
      if (openaiService.isConfigured() && body.audioBase64) {
        const transcript = await openaiService.transcribeAudio({
          audioBase64: body.audioBase64,
          mimeType: body.mimeType,
          fileName: body.fileName
        });
        return jsonResponse(200, { ok: true, provider: "openai", transcript: transcript || browserTranscript });
      }

      return jsonResponse(200, {
        ok: true,
        provider: browserTranscript ? "browser-fallback" : "manual",
        transcript: browserTranscript
      });
    }

    if (action === "followup") {
      const transcript = String(body.transcript || "").trim();
      const fallback = pickFollowUpQuestions(transcript, scenario, 3);
      if (openaiService.isConfigured()) {
        try {
          const aiResult = await openaiService.generateFollowUp(transcript, fallback);
          return jsonResponse(200, Object.assign({ ok: true, provider: "openai" }, sanitizeQuestions(aiResult, fallback)));
        } catch (error) {
          return jsonResponse(200, Object.assign({ ok: true, provider: "deterministic", warning: error.message }, sanitizeQuestions(null, fallback)));
        }
      }
      return jsonResponse(200, Object.assign({ ok: true, provider: "deterministic" }, sanitizeQuestions(null, fallback)));
    }

    if (action === "feedback") {
      const transcript = String(body.transcript || "").trim();
      const followUpResponses = Array.isArray(body.followUpResponses) ? body.followUpResponses : [];
      const fallback = buildFeedback(transcript, followUpResponses, scenario);
      if (openaiService.isConfigured()) {
        try {
          const aiResult = await openaiService.generateFeedback(transcript, followUpResponses, fallback);
          return jsonResponse(200, Object.assign({ ok: true, provider: "openai" }, sanitizeFeedback(aiResult, fallback)));
        } catch (error) {
          return jsonResponse(200, Object.assign({ ok: true, provider: "deterministic", warning: error.message }, fallback));
        }
      }
      return jsonResponse(200, Object.assign({ ok: true, provider: "deterministic" }, fallback));
    }

    return jsonResponse(400, { error: `Unsupported simulation action: ${action}` });
  } catch (error) {
    return jsonResponse(500, {
      error: "Simulation request failed",
      detail: error.message
    });
  }
};

module.exports = {
  handler: exports.handler
};
