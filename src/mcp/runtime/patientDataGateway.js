const fs = require("fs");
const os = require("os");
const path = require("path");
const { ROOT } = require("../../harness/runtime/loadHandoffEngineApi");
const { resolvePatientSourceHandler, DEFAULT_SOURCE } = require("../../server/handlers/patientSourceResolver");
const {
  assertAllowedPublicPayload,
  isAllowedPublicPayloadSource
} = require("./publicDataPolicy");

const DEFAULT_LIST_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DETAIL_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CACHE_DIR = getDefaultCacheDir();
const CACHE_SCHEMA_VERSION = "20260319-five-ward-rich-v3";

let sharedGateway = null;

function getUpstreamPatientsHandler() {
  return resolvePatientSourceHandler(DEFAULT_SOURCE).handler;
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
  return Math.max(1, Math.min(parsed, 80));
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function getDefaultCacheDir() {
  if (String(process.env.VERCEL || "") === "1") {
    return path.join(os.tmpdir(), "fhir-mcp");
  }

  return path.join(ROOT, ".cache", "fhir-mcp");
}

function cacheFilePath(cacheDir, type, key) {
  return path.join(
    cacheDir,
    type,
    `${CACHE_SCHEMA_VERSION}__${encodeURIComponent(String(key || "default"))}.json`
  );
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
  try {
    ensureDir(path.dirname(cachePath));
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
  }
}

function getSafeCachedPayload(cachedEntry) {
  if (!cachedEntry || !cachedEntry.payload) return null;
  if (!isAllowedPublicPayloadSource(cachedEntry.payload.source)) return null;
  if (!hasRequiredPatientFields(cachedEntry.payload)) return null;
  return cachedEntry;
}

function hasRequiredPatientFields(payload) {
  if (Array.isArray(payload?.patients) && payload.patients.length) {
    return payload.patients.every((patient) => patient?.ward && patient?.department);
  }

  if (payload && payload.id) {
    return Boolean(payload.ward) && Boolean(payload.department);
  }

  return true;
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
      cachedAt: metadata.cachedAt || "",
      cacheVersion: CACHE_SCHEMA_VERSION
    }
  };
}

function createPatientDataGateway(options = {}) {
  const remoteHandlerResolver = typeof options.remoteHandlerResolver === "function"
    ? options.remoteHandlerResolver
    : (requestedSource) => {
        if (options.remoteHandler) {
          return {
            source: String(requestedSource || DEFAULT_SOURCE),
            handler: options.remoteHandler
          };
        }
        return resolvePatientSourceHandler(requestedSource);
      };
  const fallbackHandler = typeof options.fallbackHandler === "function" ? options.fallbackHandler : null;
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const listTtlMs = options.listTtlMs || DEFAULT_LIST_TTL_MS;
  const detailTtlMs = options.detailTtlMs || DEFAULT_DETAIL_TTL_MS;
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  async function warmDetailCache(patientSummaries = [], source = DEFAULT_SOURCE) {
    const warmedAt = new Date(now()).toISOString();
    const { handler: remoteHandler } = remoteHandlerResolver(source);
    const uniqueIds = Array.from(new Set(
      (patientSummaries || [])
        .map((patient) => String(patient?.id || "").trim())
        .filter(Boolean)
    ));

    for (const id of uniqueIds) {
      const detailCachePath = cacheFilePath(cacheDir, "details", `${source}__${id}`);
      const cachedDetail = getSafeCachedPayload(readCache(detailCachePath, detailTtlMs, now));
      if (cachedDetail && cachedDetail.fresh) continue;

      try {
        const response = await remoteHandler({ queryStringParameters: { id, source } });
        const payload = assertAllowedPublicPayload(parseHandlerPayload(response));
        const enriched = withGatewayMetadata(payload, {
          cache: "refreshed",
          fallback: false,
          upstream: payload.source || "fhir-api",
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
    const requestedSource = String(params.source || DEFAULT_SOURCE);
    const { source, handler: remoteHandler } = remoteHandlerResolver(requestedSource);
    const queryStringParameters = { count: String(count), source };
    if (cursor) queryStringParameters.cursor = cursor;

    const cachePath = cacheFilePath(cacheDir, "lists", `${source}__${count}__${cursor || "start"}`);
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
        upstream: payload.source || source,
        cachedAt: new Date(now()).toISOString()
      });
      writeCache(cachePath, enriched);
      Promise.resolve()
        .then(() => warmDetailCache((payload.patients || []).slice(0, 12), source))
        .catch(() => {});
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
    const requestedSource = String(params.source || DEFAULT_SOURCE);
    const { source, handler: remoteHandler } = remoteHandlerResolver(requestedSource);
    const queryStringParameters = { id: String(id), source };
    const cachePath = cacheFilePath(cacheDir, "details", `${source}__${id}`);
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
        upstream: payload.source || source,
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
        source: params.source,
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
