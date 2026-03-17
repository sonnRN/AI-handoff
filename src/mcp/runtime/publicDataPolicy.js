const DEFAULT_PUBLIC_SYNTHETIC_FHIR_BASE_URL = "https://r4.smarthealthit.org";
const ALLOWED_PUBLIC_SYNTHETIC_FHIR_BASE_URLS = Object.freeze([
  DEFAULT_PUBLIC_SYNTHETIC_FHIR_BASE_URL
]);
const ALLOWED_PUBLIC_PAYLOAD_SOURCES = Object.freeze([
  "smart-health-it-sandbox-synthetic",
  "local-demo-fallback",
  "synthea-local-file"
]);

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getConfiguredPublicFhirBaseUrl() {
  return normalizeBaseUrl(process.env.PUBLIC_SAFE_FHIR_BASE_URL || DEFAULT_PUBLIC_SYNTHETIC_FHIR_BASE_URL);
}

function assertAllowedPublicFhirBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  if (!ALLOWED_PUBLIC_SYNTHETIC_FHIR_BASE_URLS.includes(normalized)) {
    throw new Error("Only approved public synthetic FHIR sources are allowed in this demo");
  }
  return normalized;
}

function getPublicSafeFhirBaseUrl() {
  return assertAllowedPublicFhirBaseUrl(getConfiguredPublicFhirBaseUrl());
}

function isAllowedPublicPayloadSource(source) {
  return ALLOWED_PUBLIC_PAYLOAD_SOURCES.includes(String(source || ""));
}

function assertAllowedPublicPayload(payload) {
  const source = String(payload?.source || "");
  if (!isAllowedPublicPayloadSource(source)) {
    throw new Error(`Unsafe or unknown patient data source rejected: ${source || "unknown"}`);
  }
  return payload;
}

function buildPublicDataPolicyMetadata(overrides = {}) {
  return {
    syntheticOnly: true,
    safeForPublicDemo: true,
    allowedExternalBaseUrls: [...ALLOWED_PUBLIC_SYNTHETIC_FHIR_BASE_URLS],
    sourceClass: "public-synthetic-demo",
    ...overrides
  };
}

module.exports = {
  DEFAULT_PUBLIC_SYNTHETIC_FHIR_BASE_URL,
  ALLOWED_PUBLIC_SYNTHETIC_FHIR_BASE_URLS,
  ALLOWED_PUBLIC_PAYLOAD_SOURCES,
  getPublicSafeFhirBaseUrl,
  assertAllowedPublicFhirBaseUrl,
  isAllowedPublicPayloadSource,
  assertAllowedPublicPayload,
  buildPublicDataPolicyMetadata
};
