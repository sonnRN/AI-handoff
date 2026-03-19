const { getSharedFhirMcpClient } = require("../../mcp/client/fhirMcpClient");
const { createPatientDataGateway } = require("../../mcp/runtime/patientDataGateway");
const { createSyntheticFallbackHandler, isRemoteFhirDisabled } = require("../../mcp/runtime/syntheticFallbackHandler");
const { BUILD_INFO } = require("../buildInfo");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60"
    },
    body: JSON.stringify(body)
  };
}

function parseCount(value, fallback = 8) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 80));
}

exports.handler = async function handler(event) {
  try {
    const query = event.queryStringParameters || {};
    const forceRefresh = String(query.refresh || "") === "1";
    const provider = await getProvider();
    const source = typeof query.source === "string" ? query.source : "";

    if (query.id) {
      const detail = withConnectionMode(await provider.getPatientDetail({
        id: String(query.id),
        source,
        forceRefresh
      }), provider.connectionMode, provider.connectionReason);
      return jsonResponse(200, detail);
    }

    if (String(query.prefetch || "") === "1") {
      const prefetched = withConnectionMode(await provider.prefetchPatients({
        count: parseCount(query.count, 8),
        pages: Math.max(1, Number.parseInt(String(query.pages || 1), 10) || 1),
        cursor: typeof query.cursor === "string" ? query.cursor : "",
        source,
        forceRefresh
      }), provider.connectionMode, provider.connectionReason);
      return jsonResponse(200, prefetched);
    }

    const page = withConnectionMode(await provider.listPatients({
      count: parseCount(query.count, 8),
      cursor: typeof query.cursor === "string" ? query.cursor : "",
      source,
      forceRefresh
    }), provider.connectionMode, provider.connectionReason);
    return jsonResponse(200, page);
  } catch (error) {
    return jsonResponse(500, {
      error: "FHIR MCP 환자 데이터를 가져오지 못했습니다.",
      detail: error.message
    });
  }
};

async function getProvider() {
  if (isRemoteFhirDisabled()) {
    const gateway = createPatientDataGateway({
      fallbackHandler: createSyntheticFallbackHandler()
    });
    return {
      connectionMode: "ci-fallback",
      connectionReason: "Remote FHIR disabled by environment",
      listPatients: async (args) => gateway.listPatients(args),
      getPatientDetail: async (args) => gateway.getPatientDetail(args.id, args),
      prefetchPatients: async (args) => gateway.prefetchPatients(args)
    };
  }

  try {
    const client = await getSharedFhirMcpClient();
    return {
      connectionMode: "server",
      connectionReason: "",
      listPatients: async (args) => client.listPatients(args),
      getPatientDetail: async (args) => client.getPatientDetail(args),
      prefetchPatients: async (args) => client.prefetchPatients(args)
    };
  } catch (error) {
    const gateway = createPatientDataGateway({
      fallbackHandler: createSyntheticFallbackHandler()
    });
    return {
      connectionMode: "direct-fallback",
      connectionReason: error.message,
      listPatients: async (args) => gateway.listPatients(args),
      getPatientDetail: async (args) => gateway.getPatientDetail(args.id, args),
      prefetchPatients: async (args) => gateway.prefetchPatients(args)
    };
  }
}

function withConnectionMode(payload, mode, reason) {
  return {
    ...payload,
    runtime: {
      build: BUILD_INFO.build,
      version: BUILD_INFO.version,
      runtime: BUILD_INFO.runtime,
      cacheTtlMs: BUILD_INFO.cacheTtlMs,
      fetchTimeoutMs: BUILD_INFO.fetchTimeoutMs
    },
    mcp: {
      ...(payload.mcp || {}),
      build: BUILD_INFO.build,
      version: BUILD_INFO.version,
      connectionMode: mode,
      connectionReason: reason || "",
      sourceAdapter: payload?.policy?.sourceAdapter || "",
      cacheTtlMs: BUILD_INFO.cacheTtlMs,
      fetchTimeoutMs: BUILD_INFO.fetchTimeoutMs
    }
  };
}
