const { BUILD_INFO } = require("../src/server/buildInfo");

module.exports = async function healthHandler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");

  if (String(req.method || "GET").toUpperCase() === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    ok: true,
    service: "ai-handoff-vercel",
    timestamp: new Date().toISOString(),
    build: BUILD_INFO.build,
    version: BUILD_INFO.version,
    runtime: BUILD_INFO.runtime
  });
};
