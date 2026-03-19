const assert = require("assert");
const { getScenario } = require("../src/simulation/scenario");
const { handler } = require("../src/server/handlers/simulationApi");

async function main() {
  const scenario = getScenario();

  const config = JSON.parse((await handler({
    httpMethod: "GET",
    queryStringParameters: {}
  })).body);
  assert.strictEqual(config.ok, true);

  const followup = JSON.parse((await handler({
    httpMethod: "POST",
    body: JSON.stringify({
      action: "followup",
      transcript: scenario.demo.initialTranscript
    }),
    queryStringParameters: {}
  })).body);
  assert.strictEqual(followup.ok, true);
  assert.ok(Array.isArray(followup.questions));
  assert.ok(followup.questions.length >= 2);

  const feedback = JSON.parse((await handler({
    httpMethod: "POST",
    body: JSON.stringify({
      action: "feedback",
      transcript: scenario.demo.initialTranscript,
      followUpResponses: Object.entries(scenario.demo.followUpAnswers).map((entry) => ({
        id: entry[0],
        answer: entry[1]
      }))
    }),
    queryStringParameters: {}
  })).body);
  assert.strictEqual(feedback.ok, true);
  assert.ok(Number.isFinite(feedback.overallScore));
  assert.ok(typeof feedback.improvedHandoff === "string" && feedback.improvedHandoff.length > 40);

  console.log("Simulation API smoke test passed.");
}

main().catch((error) => {
  console.error(`Simulation API smoke test failed: ${error.message}`);
  process.exit(1);
});
