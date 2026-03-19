const assert = require("assert");
const { startHttpServer } = require("../src/server/httpServer");

function jsonResponse(body) {
  return {
    statusCode: 200,
    headers: {
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

async function main() {
  const { server, port } = await startHttpServer({
    port: 0,
    patientsHandler: async ({ queryStringParameters }) => {
      return jsonResponse({
        source: "stub-patients",
        patients: [{ id: queryStringParameters.id || "patient-1", name: "Synthetic Stub" }]
      });
    },
    patientsMcpHandler: async ({ queryStringParameters }) => {
      if (queryStringParameters.id) {
        return jsonResponse({
          id: queryStringParameters.id,
          name: "Synthetic Stub Detail",
          dailyData: {
            "2026-03-17": {
              vital: {},
              orders: {},
              handover: {}
            }
          },
          mcp: {
            transport: "local-fhir-mcp"
          },
          runtime: {
            build: "stub-build",
            version: "stub-version"
          }
        });
      }

      return jsonResponse({
        source: "stub-mcp",
        patients: [{ id: "patient-1", name: "Synthetic Stub" }],
        mcp: {
          transport: "local-fhir-mcp"
        },
        runtime: {
          build: "stub-build",
          version: "stub-version"
        }
      });
    }
  });

  try {
    const appShell = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(appShell.status, 200);
    const shellHtml = await appShell.text();
    assert.ok(shellHtml.includes("Nursing Handoff Simulation"));

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(health.status, 200);
    const healthJson = await health.json();
    assert.strictEqual(healthJson.ok, true);
    assert.ok(healthJson.build);
    assert.ok(healthJson.version);

    const list = await fetch(`http://127.0.0.1:${port}/api/patients-mcp?count=1`);
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.headers.get("access-control-allow-origin"), "*");
    const listJson = await list.json();
    assert.strictEqual(listJson.patients.length, 1);
    assert.ok(listJson.runtime?.build);

    const detail = await fetch(`http://127.0.0.1:${port}/api/patients-mcp?id=patient-1`);
    assert.strictEqual(detail.status, 200);
    const detailJson = await detail.json();
    assert.strictEqual(detailJson.id, "patient-1");
    assert.ok(detailJson.runtime?.build);

    console.log("HTTP server smoke test passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`HTTP server smoke test failed: ${error.message}`);
  process.exit(1);
});
