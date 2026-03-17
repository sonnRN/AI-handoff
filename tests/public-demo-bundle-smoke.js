const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const bundleFile = path.join(ROOT, "public-demo-data", "patients-bundle.json");

function main() {
  assert(fs.existsSync(bundleFile), "public demo bundle file is missing");
  const payload = JSON.parse(fs.readFileSync(bundleFile, "utf8"));

  assert.strictEqual(payload.source, "github-pages-public-demo-snapshot");
  assert(payload.policy && payload.policy.syntheticOnly === true);
  assert(payload.policy && payload.policy.safeForPublicDemo === true);
  assert(Array.isArray(payload.patients) && payload.patients.length === 20, "public demo bundle must contain 20 patients");

  for (const patient of payload.patients) {
    const detail = payload.detailsById?.[String(patient.id)];
    assert(detail, `missing detail for patient ${patient.id}`);
    assert(detail.dailyData, `missing dailyData for patient ${patient.id}`);
  }

  console.log("Public demo bundle smoke test passed.");
}

try {
  main();
} catch (error) {
  console.error(`Public demo bundle smoke test failed: ${error.message}`);
  process.exit(1);
}
