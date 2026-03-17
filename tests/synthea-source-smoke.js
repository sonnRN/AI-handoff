const path = require("path");
const patientsMcpHandler = require("../src/server/handlers/patientsMcpApi").handler;

async function main() {
  const fixtureDir = path.join(__dirname, "fixtures", "synthea-fhir");
  const previousDisableRemote = process.env.AI_HANDOFF_DISABLE_REMOTE_FHIR;
  const previousSyntheaDir = process.env.AI_HANDOFF_SYNTHEA_DIR;

  process.env.AI_HANDOFF_DISABLE_REMOTE_FHIR = "true";
  process.env.AI_HANDOFF_SYNTHEA_DIR = fixtureDir;

  try {
    const listResponse = await patientsMcpHandler({
      queryStringParameters: {
        count: "10",
        source: "synthea"
      }
    });
    const listPayload = JSON.parse(listResponse.body);

    if (!Array.isArray(listPayload.patients) || listPayload.patients.length !== 2) {
      throw new Error("Synthea MCP source did not return the expected synthetic patients");
    }

    if (String(listPayload.source) !== "synthea-local-file") {
      throw new Error("Synthea MCP source label is missing");
    }

    if (String(listPayload.mcp?.sourceAdapter || "") !== "synthea-local") {
      throw new Error("Synthea MCP source adapter metadata is missing");
    }

    const detailResponse = await patientsMcpHandler({
      queryStringParameters: {
        id: String(listPayload.patients[0].id),
        source: "synthea"
      }
    });
    const detailPayload = JSON.parse(detailResponse.body);

    if (!detailPayload.dailyData || !Object.keys(detailPayload.dailyData).length) {
      throw new Error("Synthea patient detail did not build dailyData");
    }

    if (detailPayload.policy?.sourceAdapter !== "synthea-local") {
      throw new Error("Synthea detail policy metadata is missing");
    }

    console.log("Synthea source smoke test passed.");
    console.log(`Patients: ${listPayload.patients.map((patient) => patient.name).join(", ")}`);
  } finally {
    if (typeof previousDisableRemote === "undefined") delete process.env.AI_HANDOFF_DISABLE_REMOTE_FHIR;
    else process.env.AI_HANDOFF_DISABLE_REMOTE_FHIR = previousDisableRemote;

    if (typeof previousSyntheaDir === "undefined") delete process.env.AI_HANDOFF_SYNTHEA_DIR;
    else process.env.AI_HANDOFF_SYNTHEA_DIR = previousSyntheaDir;
  }
}

main().catch((error) => {
  console.error(`Synthea source smoke test failed: ${error.message}`);
  process.exit(1);
});
