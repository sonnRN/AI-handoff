const patientsMcpHandler = require("../src/server/handlers/patientsMcpApi.js").handler;

async function main() {
  const listResponse = await patientsMcpHandler({
    queryStringParameters: {
      count: "20"
    }
  });
  const listPayload = JSON.parse(listResponse.body);

  if (!Array.isArray(listPayload.patients) || !listPayload.patients.length) {
    throw new Error("MCP patient list did not return any patients");
  }

  const departmentSet = new Set((listPayload.patients || []).map((patient) => patient.department).filter(Boolean));
  if (departmentSet.size < 4) {
    throw new Error("MCP patient list is not distributed across enough departments");
  }

  if (!listPayload.mcp || listPayload.mcp.transport !== "local-fhir-mcp") {
    throw new Error("MCP metadata is missing from the patient list payload");
  }

  if (!["server", "direct-fallback", "ci-fallback"].includes(String(listPayload.mcp.connectionMode || ""))) {
    throw new Error("MCP connection mode is missing from the patient list payload");
  }

  const sampleId = listPayload.patients[0].id;
  const detailResponse = await patientsMcpHandler({
    queryStringParameters: {
      id: String(sampleId)
    }
  });
  const detailPayload = JSON.parse(detailResponse.body);

  if (detailPayload.error) {
    throw new Error(detailPayload.detail || detailPayload.error);
  }

  if (String(detailPayload.id) !== String(sampleId)) {
    throw new Error("MCP patient detail id does not match the requested patient");
  }

  if (!detailPayload.mcp || detailPayload.mcp.transport !== "local-fhir-mcp") {
    throw new Error("MCP metadata is missing from the patient detail payload");
  }

  if (!detailPayload.runtime || !detailPayload.runtime.build || !detailPayload.runtime.version) {
    throw new Error("Runtime metadata is missing from the patient detail payload");
  }

  if (!detailPayload.policy || detailPayload.policy.safeForPublicDemo !== true || detailPayload.policy.syntheticOnly !== true) {
    throw new Error("Public-safe synthetic policy metadata is missing from the patient detail payload");
  }

  console.log("MCP patient smoke test passed.");
  console.log(`Patient source: ${detailPayload.source}`);
  console.log(`Cache mode: ${detailPayload.mcp.cache}`);
  console.log(`Connection mode: ${detailPayload.mcp.connectionMode}`);
  console.log(`Departments: ${Array.from(departmentSet).sort().join(", ")}`);
}

main().catch((error) => {
  console.error(`MCP patient smoke test failed: ${error.message}`);
  process.exit(1);
});
