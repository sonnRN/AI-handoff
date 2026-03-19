const BUILD_INFO = {
  build: "mcp-dynamic-20260319-4",
  version: "0.4.0",
  runtime: "dynamic-mcp-synthetic-fhir",
  cacheTtlMs: {
    list: 5 * 60 * 1000,
    detail: 30 * 60 * 1000
  },
  fetchTimeoutMs: Math.max(1000, Number.parseInt(String(process.env.FHIR_FETCH_TIMEOUT_MS || "8000"), 10) || 8000)
};

module.exports = {
  BUILD_INFO
};
