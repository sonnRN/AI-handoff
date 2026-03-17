const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE_ROOT = path.join(ROOT, ".cache", "fhir-mcp");
const LIST_CACHE = path.join(CACHE_ROOT, "lists", "20__start.json");
const OUTPUT_DIR = path.join(ROOT, "public-demo-data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "patients-bundle.json");

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main() {
  if (!fs.existsSync(LIST_CACHE)) {
    throw new Error("FHIR list cache is missing. Warm the MCP gateway first.");
  }

  const listPayload = readJson(LIST_CACHE);
  const patients = Array.isArray(listPayload.patients) ? listPayload.patients : [];

  if (!patients.length) {
    throw new Error("FHIR list cache did not contain any patients.");
  }

  const detailsById = {};

  for (const patient of patients) {
    const id = String(patient.id || "").trim();
    if (!id) continue;

    const detailFile = path.join(CACHE_ROOT, "details", `${encodeURIComponent(id)}.json`);
    if (!fs.existsSync(detailFile)) {
      throw new Error(`FHIR detail cache is missing for patient ${id}`);
    }

    detailsById[id] = readJson(detailFile);
  }

  const output = {
    source: "github-pages-public-demo-snapshot",
    generatedAt: new Date().toISOString(),
    policy: {
      syntheticOnly: true,
      safeForPublicDemo: true
    },
    patients,
    detailsById
  };

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`Public demo bundle created: ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log(`Patient count: ${patients.length}`);
}

try {
  main();
} catch (error) {
  console.error(`Failed to build public demo bundle: ${error.message}`);
  process.exit(1);
}
