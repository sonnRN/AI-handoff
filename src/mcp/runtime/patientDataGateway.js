const fs = require("fs");
const path = require("path");
const { ROOT } = require("../../harness/runtime/loadHandoffEngineApi");
const {
  assertAllowedPublicPayload,
  isAllowedPublicPayloadSource
} = require("./publicDataPolicy");

const DEFAULT_LIST_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DETAIL_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CACHE_DIR = path.join(ROOT, ".cache", "fhir-mcp");

let sharedGateway = null;

function getUpstreamPatientsHandler() {
  return require(path.join(ROOT, "src", "server", "handlers", "patientsApi.js")).handler;
}

function parseHandlerPayload(response) {
  if (!response || typeof response.body !== "string") {
    throw new Error("Patient handler returned an invalid response");
  }

  const payload = JSON.parse(response.body);
  if (payload.error) {
    throw new Error(payload.detail || payload.error);
  }

  return payload;
}

function normalizeCount(value, fallback) {
  const parsed = Number.parseInt(String(value || fallback || 8), 10);
  if (!Number.isFinite(parsed)) return fallback || 8;
  return Math.max(1, Math.min(parsed, 50));
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function cacheFilePath(cacheDir, type, key) {
  return path.join(cacheDir, type, `${encodeURIComponent(String(key || "default"))}.json`);
}

function readCache(cachePath, ttlMs, now) {
  try {
    const stat = fs.statSync(cachePath);
    const ageMs = Math.max(0, now() - stat.mtimeMs);
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return {
      payload,
      fresh: ageMs <= ttlMs,
      ageMs
    };
  } catch (error) {
    return null;
  }
}

function writeCache(cachePath, payload) {
  ensureDir(path.dirname(cachePath));
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
}

function getSafeCachedPayload(cachedEntry) {
  if (!cachedEntry || !cachedEntry.payload) return null;
  return isAllowedPublicPayloadSource(cachedEntry.payload.source) ? cachedEntry : null;
}

function withGatewayMetadata(payload, metadata = {}) {
  return {
    ...payload,
    mcp: {
      transport: "local-fhir-mcp",
      cache: metadata.cache || "none",
      fallback: Boolean(metadata.fallback),
      reason: metadata.reason || "",
      upstream: metadata.upstream || "",
      cachedAt: metadata.cachedAt || ""
    }
  };
}

function createPatientDataGateway(options = {}) {
  const remoteHandler = options.remoteHandler || getUpstreamPatientsHandler();
  const fallbackHandler = typeof options.fallbackHandler === "function" ? options.fallbackHandler : null;
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const listTtlMs = options.listTtlMs || DEFAULT_LIST_TTL_MS;
  const detailTtlMs = options.detailTtlMs || DEFAULT_DETAIL_TTL_MS;
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  async function warmDetailCache(patientSummaries = []) {
    const warmedAt = new Date(now()).toISOString();
    const uniqueIds = Array.from(new Set(
      (patientSummaries || [])
        .map((patient) => String(patient?.id || "").trim())
        .filter(Boolean)
    ));

    for (const id of uniqueIds) {
      const detailCachePath = cacheFilePath(cacheDir, "details", id);
      const cachedDetail = getSafeCachedPayload(readCache(detailCachePath, detailTtlMs, now));
      if (cachedDetail && cachedDetail.fresh) continue;

      try {
        const response = await remoteHandler({ queryStringParameters: { id } });
        const payload = assertAllowedPublicPayload(parseHandlerPayload(response));
        const enriched = withGatewayMetadata(payload, {
          cache: "refreshed",
          fallback: false,
          upstream: "fhir-api",
          cachedAt: warmedAt
        });
        writeCache(detailCachePath, enriched);
      } catch (error) {
      }
    }
  }

  async function listPatients(params = {}) {
    const count = normalizeCount(params.count, 8);
    const cursor = typeof params.cursor === "string" ? params.cursor : "";
    const forceRefresh = params.forceRefresh === true;
    const queryStringParameters = { count: String(count) };
    if (cursor) queryStringParameters.cursor = cursor;

    const cachePath = cacheFilePath(cacheDir, "lists", `${count}__${cursor || "start"}`);
    const cached = getSafeCachedPayload(readCache(cachePath, listTtlMs, now));

    if (!forceRefresh && cached && cached.fresh) {
      return withGatewayMetadata(cached.payload, {
        cache: "fresh",
        fallback: false,
        upstream: "cache",
        cachedAt: new Date(now() - cached.ageMs).toISOString()
      });
    }

    try {
      const response = await remoteHandler({ queryStringParameters });
      const payload = assertAllowedPublicPayload(parseHandlerPayload(response));
      const enriched = withGatewayMetadata(payload, {
        cache: "refreshed",
        fallback: false,
        upstream: "fhir-api",
        cachedAt: new Date(now()).toISOString()
      });
      writeCache(cachePath, enriched);
      await warmDetailCache(payload.patients || []);
      return enriched;
    } catch (remoteError) {
      if (cached) {
        return withGatewayMetadata(cached.payload, {
          cache: "stale",
          fallback: false,
          reason: remoteError.message,
          upstream: "cache",
          cachedAt: new Date(now() - cached.ageMs).toISOString()
        });
      }

      if (fallbackHandler) {
        const fallbackPayload = assertAllowedPublicPayload(parseHandlerPayload(await fallbackHandler({ queryStringParameters })));
        return withGatewayMetadata(fallbackPayload, {
          cache: "none",
          fallback: true,
          reason: remoteError.message,
          upstream: "custom-fallback"
        });
      }

      throw new Error(`FHIR MCP upstream unavailable: ${remoteError.message}`);
    }
  }

  async function getPatientDetail(id, params = {}) {
    if (!id) {
      throw new Error("Patient id is required");
    }

    const forceRefresh = params.forceRefresh === true;
    const queryStringParameters = { id: String(id) };
    const cachePath = cacheFilePath(cacheDir, "details", id);
    const cached = getSafeCachedPayload(readCache(cachePath, detailTtlMs, now));

    if (!forceRefresh && cached && cached.fresh) {
      return withGatewayMetadata(cached.payload, {
        cache: "fresh",
        fallback: false,
        upstream: "cache",
        cachedAt: new Date(now() - cached.ageMs).toISOString()
      });
    }

    try {
      const response = await remoteHandler({ queryStringParameters });
      const payload = assertAllowedPublicPayload(parseHandlerPayload(response));
      const enriched = withGatewayMetadata(payload, {
        cache: "refreshed",
        fallback: false,
        upstream: "fhir-api",
        cachedAt: new Date(now()).toISOString()
      });
      writeCache(cachePath, enriched);
      return enriched;
    } catch (remoteError) {
      if (cached) {
        return withGatewayMetadata(cached.payload, {
          cache: "stale",
          fallback: false,
          reason: remoteError.message,
          upstream: "cache",
          cachedAt: new Date(now() - cached.ageMs).toISOString()
        });
      }

      if (fallbackHandler) {
        const fallbackPayload = assertAllowedPublicPayload(parseHandlerPayload(await fallbackHandler({ queryStringParameters })));
        return withGatewayMetadata(fallbackPayload, {
          cache: "none",
          fallback: true,
          reason: remoteError.message,
          upstream: "custom-fallback"
        });
      }

      throw new Error(`FHIR MCP upstream unavailable: ${remoteError.message}`);
    }
  }

  async function prefetchPatients(params = {}) {
    const count = normalizeCount(params.count, 8);
    const pages = Math.max(1, Number.parseInt(String(params.pages || 1), 10) || 1);
    const aggregated = [];
    let cursor = typeof params.cursor === "string" ? params.cursor : "";
    let pageInfo = null;

    for (let index = 0; index < pages; index += 1) {
      const page = await listPatients({
        count,
        cursor,
        forceRefresh: params.forceRefresh === true
      });
      aggregated.push(...(page.patients || []));
      pageInfo = page.pageInfo || null;
      cursor = pageInfo?.nextCursor || "";
      if (!pageInfo?.hasNext || !cursor) break;
    }

    return {
      patients: aggregated,
      source: "local-fhir-mcp",
      pageInfo: {
        requestedPages: pages,
        fetchedPatients: aggregated.length,
        nextCursor: pageInfo?.nextCursor || "",
        hasNext: Boolean(pageInfo?.hasNext)
      },
      mcp: {
        transport: "local-fhir-mcp",
        cache: "mixed",
        fallback: false,
        reason: ""
      }
    };
  }

  return {
    listPatients,
    getPatientDetail,
    prefetchPatients
  };
}

function getSharedPatientDataGateway() {
  if (!sharedGateway) {
    sharedGateway = createPatientDataGateway();
  }

  return sharedGateway;
}

module.exports = {
  createPatientDataGateway,
  getSharedPatientDataGateway,
  DEFAULT_CACHE_DIR,
  DEFAULT_LIST_TTL_MS,
  DEFAULT_DETAIL_TTL_MS
};
