const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createPatientDataGateway } = require("../src/mcp/runtime/patientDataGateway");

function jsonResponse(body) {
  return {
    statusCode: 200,
    body: JSON.stringify(body)
  };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fhir-mcp-gateway-"));
  let remoteMode = "success";

  const remoteHandler = async function remoteHandler(event = {}) {
    const query = event.queryStringParameters || {};

    if (remoteMode === "error") {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Remote failed",
          detail: "simulated upstream failure"
        })
      };
    }

    if (query.id) {
      return jsonResponse({
        id: query.id,
        name: "FHIR Test Patient",
        ward: "내과계중환자실",
        department: "감염내과",
        dailyData: {
          "2026-03-17": {}
        },
        source: "smart-health-it-sandbox-synthetic",
        policy: {
          syntheticOnly: true,
          safeForPublicDemo: true
        }
      });
    }

    return jsonResponse({
      patients: [
        {
          id: "remote-1",
          name: "FHIR Test Patient",
          ward: "내과계중환자실",
          department: "감염내과"
        }
      ],
      source: "smart-health-it-sandbox-synthetic",
      policy: {
        syntheticOnly: true,
        safeForPublicDemo: true
      },
      pageInfo: {
        count: 1,
        cursor: "",
        hasNext: true,
        nextCursor: "cursor-2"
      }
    });
  };

  const fallbackHandler = async function fallbackHandler(event = {}) {
    const query = event.queryStringParameters || {};
    if (query.id) {
      return jsonResponse({
        id: query.id,
        name: "Local Demo Patient",
        ward: "N병동",
        department: "신경과",
        source: "local-demo-fallback"
      });
    }

    return jsonResponse({
      patients: [
        {
          id: "local-1",
          name: "Local Demo Patient",
          ward: "N병동",
          department: "신경과"
        }
      ],
      source: "local-demo-fallback",
      pageInfo: {
        count: 1,
        cursor: "",
        hasNext: false,
        nextCursor: ""
      }
    });
  };

  const gateway = createPatientDataGateway({
    remoteHandler,
    fallbackHandler,
    cacheDir: tempDir
  });

  const listFresh = await gateway.listPatients({ count: 1 });
  assert.strictEqual(listFresh.patients[0].id, "remote-1");
  assert.strictEqual(listFresh.mcp.cache, "refreshed");
  assert.strictEqual(listFresh.pageInfo.hasNext, true);

  const detailFresh = await gateway.getPatientDetail("remote-1");
  assert.strictEqual(detailFresh.id, "remote-1");
  assert.ok(["fresh", "refreshed"].includes(detailFresh.mcp.cache));

  remoteMode = "error";

  const listCached = await gateway.listPatients({ count: 1 });
  assert.strictEqual(listCached.patients[0].id, "remote-1");
  assert.ok(["fresh", "stale"].includes(listCached.mcp.cache));

  const detailCached = await gateway.getPatientDetail("remote-1");
  assert.strictEqual(detailCached.id, "remote-1");
  assert.ok(["fresh", "stale"].includes(detailCached.mcp.cache));

  const detailFallback = await gateway.getPatientDetail("local-only");
  assert.strictEqual(detailFallback.id, "local-only");
  assert.strictEqual(detailFallback.source, "local-demo-fallback");
  assert.strictEqual(detailFallback.mcp.fallback, true);

  const unsafeGateway = createPatientDataGateway({
    remoteHandler: async function unsafeRemoteHandler() {
      return jsonResponse({
        patients: [{ id: "unsafe-1", name: "Unsafe Patient" }],
        source: "unknown-upstream",
        pageInfo: {
          count: 1,
          cursor: "",
          hasNext: false,
          nextCursor: ""
        }
      });
    },
    fallbackHandler,
    cacheDir: path.join(tempDir, "unsafe")
  });

  const unsafeFallback = await unsafeGateway.listPatients({ count: 1 });
  assert.strictEqual(unsafeFallback.source, "local-demo-fallback");
  assert.strictEqual(unsafeFallback.mcp.fallback, true);
  assert.match(String(unsafeFallback.mcp.reason || ""), /Unsafe or unknown patient data source rejected/);

  console.log("MCP gateway regression test passed.");
}

main().catch((error) => {
  console.error(`MCP gateway regression test failed: ${error.message}`);
  process.exit(1);
});
