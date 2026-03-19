function resolveDefaultApiBase() {
  const host = String(window.location.hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return "";
  }

  return "https://ai-handoff.vercel.app";
}

window.AI_HANDOFF_RUNTIME_CONFIG = Object.assign(
  {
    apiBase: resolveDefaultApiBase()
  },
  window.AI_HANDOFF_RUNTIME_CONFIG || {}
);
