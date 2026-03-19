(function initSimulationEvaluator(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.HANDOFF_SIM_EVAL = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildEvaluatorModule() {
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9.%/+\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function joinTranscript(transcript, followUpResponses) {
    const answers = Array.isArray(followUpResponses)
      ? followUpResponses.map(function toText(item) { return item.answer || item.transcript || ""; })
      : Object.values(followUpResponses || {});
    return [transcript].concat(answers).filter(Boolean).join(" ");
  }

  function scoreTarget(text, target) {
    const matches = (target.groups || []).map(function countGroup(group) {
      return (group || []).some(function hasAlias(alias) {
        return text.includes(normalizeText(alias));
      });
    });
    const matchedGroups = matches.filter(Boolean).length;
    const minGroups = Math.max(1, Number(target.minGroups || 1));
    const covered = matchedGroups >= minGroups;
    const partial = !covered && matchedGroups > 0;
    return {
      id: target.id,
      label: target.label,
      category: target.followUpCategory,
      weight: Number(target.weight || 0),
      critical: Boolean(target.critical),
      covered: covered,
      partial: partial,
      matchedGroups: matchedGroups,
      totalGroups: (target.groups || []).length,
      betterPhrase: target.betterPhrase || ""
    };
  }

  function evaluateCoverage(text, scenario) {
    const normalized = normalizeText(text);
    const targets = (scenario.expectedCoverageTargets || []).map(function eachTarget(target) {
      return scoreTarget(normalized, target);
    });
    const totalWeight = targets.reduce(function sum(total, item) { return total + item.weight; }, 0) || 1;
    const earnedWeight = targets.reduce(function sum(total, item) {
      return total + (item.covered ? item.weight : item.partial ? item.weight * 0.45 : 0);
    }, 0);
    return {
      normalizedText: normalized,
      targets: targets,
      totalWeight: totalWeight,
      earnedWeight: earnedWeight,
      percent: Math.round((earnedWeight / totalWeight) * 100),
      covered: targets.filter(function filterCovered(item) { return item.covered; }),
      partial: targets.filter(function filterPartial(item) { return item.partial; }),
      missed: targets.filter(function filterMissed(item) { return !item.covered; })
    };
  }

  function assessClarity(text) {
    const normalized = normalizeText(text);
    const wordCount = normalized ? normalized.split(" ").length : 0;
    let score = 64;
    if (wordCount >= 100 && wordCount <= 260) score += 16;
    if (/(first|next|then|currently|overnight|pending|watch)/.test(normalized)) score += 10;
    if (/(admitted|came in|hospital day|full code|telemetry)/.test(normalized)) score += 5;
    if (/(um|uh|like like|you know)/.test(normalized)) score -= 6;
    return Math.max(35, Math.min(95, score));
  }

  function assessOrganization(text) {
    const normalized = normalizeText(text);
    let score = 58;
    if (/(admitted|came in|hospital day|this is)/.test(normalized)) score += 12;
    if (/(currently|tonight|overnight|right now)/.test(normalized)) score += 10;
    if (/(pending|follow|watch|next shift|please)/.test(normalized)) score += 10;
    if (/(because|so|therefore|which is why)/.test(normalized)) score += 8;
    return Math.max(35, Math.min(94, score));
  }

  function assessPrioritization(coverage) {
    const criticalTargets = coverage.targets.filter(function onlyCritical(item) { return item.critical; });
    const criticalWeight = criticalTargets.reduce(function sum(total, item) { return total + item.weight; }, 0) || 1;
    const earnedCritical = criticalTargets.reduce(function sum(total, item) {
      return total + (item.covered ? item.weight : item.partial ? item.weight * 0.5 : 0);
    }, 0);
    return Math.round((earnedCritical / criticalWeight) * 100);
  }

  function pickStrengths(coverage) {
    return coverage.covered
      .sort(function byWeight(left, right) { return right.weight - left.weight; })
      .slice(0, 4)
      .map(function toStrength(item) { return item.label; });
  }

  function pickMisses(coverage) {
    return coverage.missed
      .sort(function byCritical(left, right) {
        return Number(right.critical) - Number(left.critical) || right.weight - left.weight;
      })
      .map(function toMissing(item) { return item.label; });
  }

  function pickCriticalOmissions(coverage) {
    return coverage.missed
      .filter(function onlyCritical(item) { return item.critical; })
      .map(function toOmission(item) { return item.label; })
      .slice(0, 4);
  }

  function buildPrioritizationProblems(coverage, text) {
    const issues = [];
    const normalized = normalizeText(text);
    if (!/(oxygen|desat|creatinine|blood pressure|fall|kidney)/.test(normalized)) {
      issues.push("The handoff does not clearly front-load the patient’s active oxygen, renal, and fall-risk priorities.");
    }
    if (coverage.missed.some(function find(item) { return item.id === "pending-work"; })) {
      issues.push("The next-shift tasks are not explicit enough for safe carryover.");
    }
    if (coverage.missed.some(function find(item) { return item.id === "renal-hemodynamic-priority"; })) {
      issues.push("The connection between softer blood pressures, worsening creatinine, and reduced diuresis is missing or too vague.");
    }
    return issues.slice(0, 4);
  }

  function buildSafetyIssues(coverage) {
    return coverage.missed
      .filter(function onlySafety(item) {
        return item.id === "safety-risks" || item.id === "respiratory-priority";
      })
      .map(function toIssue(item) { return item.label; });
  }

  function pickFollowUpQuestions(transcript, scenario, limit) {
    const coverage = evaluateCoverage(transcript, scenario);
    const scoredQuestions = (scenario.followUpQuestionBank || []).map(function score(question) {
      const unresolved = (question.targetIds || []).filter(function unresolvedTarget(targetId) {
        return coverage.missed.some(function missed(item) { return item.id === targetId; });
      });
      return {
        question: question,
        score: unresolved.length * 2 + (unresolved.length ? 1 : 0)
      };
    });
    const selected = scoredQuestions
      .sort(function byScore(left, right) { return right.score - left.score; })
      .slice(0, Math.max(2, limit || 3))
      .map(function extract(item) { return item.question; });
    return {
      opening: "I heard your initial handoff. I want to tighten a few points before I take the patient.",
      questions: selected
    };
  }

  function buildFeedback(transcript, followUpResponses, scenario) {
    const initialCoverage = evaluateCoverage(transcript, scenario);
    const finalText = joinTranscript(transcript, followUpResponses);
    const finalCoverage = evaluateCoverage(finalText, scenario);
    const completeness = finalCoverage.percent;
    const prioritization = assessPrioritization(finalCoverage);
    const clarity = assessClarity(finalText);
    const organization = assessOrganization(finalText);
    const safety = Math.max(0, 100 - buildSafetyIssues(finalCoverage).length * 18);
    const overall = Math.round((completeness * 0.45) + (prioritization * 0.25) + (clarity * 0.12) + (organization * 0.1) + (safety * 0.08));

    return {
      overallScore: overall,
      categoryScores: {
        completeness: completeness,
        prioritization: prioritization,
        clarity: clarity,
        organization: organization,
        safety: safety
      },
      strengths: pickStrengths(finalCoverage),
      missingInformation: pickMisses(finalCoverage).slice(0, 6),
      criticalOmissions: pickCriticalOmissions(finalCoverage),
      prioritizationProblems: buildPrioritizationProblems(finalCoverage, finalText),
      communicationClarity: clarity >= 80 ? "Clear and reasonably concise. The main updates are understandable without extra prompting." : "The handoff is understandable, but the signal-to-noise ratio can improve. Lead earlier with the unstable problems and the concrete next-shift watch items.",
      clinicalOrganization: organization >= 80 ? "The sequence generally works: context, current status, then what the next nurse must do." : "The handoff needs a tighter structure. Move from admission context to current instability, then end with pending tasks and escalation triggers.",
      safetyIssuesMissed: buildSafetyIssues(finalCoverage),
      improvedHandoff: scenario.exemplarHandoff,
      anticipatedFollowUpQuestions: pickFollowUpQuestions(finalText, scenario, 3).questions.map(function toQuestion(item) {
        return item.question;
      }),
      progressDelta: finalCoverage.percent - initialCoverage.percent,
      coverage: {
        initial: initialCoverage,
        final: finalCoverage
      }
    };
  }

  return {
    normalizeText: normalizeText,
    evaluateCoverage: evaluateCoverage,
    buildFeedback: buildFeedback,
    pickFollowUpQuestions: pickFollowUpQuestions
  };
});
