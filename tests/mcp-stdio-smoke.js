const { FhirMcpClient } = require("../src/mcp/client/fhirMcpClient");

async function main() {
  const client = new FhirMcpClient();

  try {
    const tools = await client.listTools();
    const toolNames = (tools.tools || []).map((tool) => tool.name);

    if (!toolNames.includes("patients_list") || !toolNames.includes("patient_detail")) {
      throw new Error("Expected MCP patient tools are missing");
    }

    const page = await client.listPatients({ count: 2 });
    if (!Array.isArray(page.patients) || !page.patients.length) {
      throw new Error("MCP stdio list did not return any patients");
    }

    const detail = await client.getPatientDetail({ id: String(page.patients[0].id) });
    if (!detail || String(detail.id) !== String(page.patients[0].id)) {
      throw new Error("MCP stdio detail did not match the requested patient");
    }

    if (!detail.policy || detail.policy.safeForPublicDemo !== true) {
      throw new Error("MCP stdio detail is missing public-safe policy metadata");
    }

    console.log("MCP stdio smoke test passed.");
    console.log(`Patient source: ${detail.source}`);
  } finally {
    client.stop();
  }
}

main().catch((error) => {
  console.error(`MCP stdio smoke test failed: ${error.message}`);
  process.exit(1);
});
