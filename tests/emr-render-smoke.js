const assert = require("assert");
const { fetchPatientList } = require("../src/harness/runtime/fetchFhirPatients");
const { loadHandoffEngineApi } = require("../src/harness/runtime/loadHandoffEngineApi");

async function main() {
  const { handler, patients } = await fetchPatientList({ count: 1 });
  const sample = patients[0];
  const detail = JSON.parse((await handler({ queryStringParameters: { id: sample.id } })).body);

  if (detail.error) {
    throw new Error(detail.detail || detail.error);
  }

  const { api } = loadHandoffEngineApi();
  const dates = Object.keys(detail.dailyData || {}).sort();
  assert(dates.length > 0, "dailyData dates missing");

  const startData = detail.dailyData[dates[0]];
  const endData = detail.dailyData[dates[dates.length - 1]];
  const html = api.generateNarrativeSBAR(detail, startData, endData, dates);
  const chipCount = (html.match(/class="longitudinal-chip"/g) || []).length;
  const renderedDates = html.match(/\d{4}-\d{2}-\d{2}/g) || [];

  assert(/class="longitudinal-panel"/.test(html));
  assert(chipCount >= 3, "longitudinal range chips missing");
  assert(renderedDates.length >= 3, "rendered narrative is missing range dates");
  assert(!/\((disorder|finding|situation|procedure)\)/i.test(html));
  assert(/S - Situation/.test(html));
  assert(/B - Background/.test(html));
  assert(/A - Assessment/.test(html));
  assert(/R - Recommendation/.test(html));

  console.log("EMR render smoke test passed.");
  console.log(`Patient: ${detail.name} (${detail.id})`);
}

main().catch((error) => {
  console.error(`EMR render smoke test failed: ${error.message}`);
  process.exit(1);
});
