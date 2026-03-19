const { handler } = require("../src/server/handlers/simulationApi");

function withCors(res, headers = {}) {
  const merged = Object.assign(
    {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    headers
  );

  Object.entries(merged).forEach(function setHeader(entry) {
    res.setHeader(entry[0], entry[1]);
  });
}

function normalizeQuery(query = {}) {
  return Object.fromEntries(
    Object.entries(query).map(function normalize(entry) {
      return [entry[0], Array.isArray(entry[1]) ? String(entry[1][0] || "") : String(entry[1] || "")];
    })
  );
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body;

  return new Promise(function collect(resolve, reject) {
    const chunks = [];
    req.on("data", function onData(chunk) {
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", function onEnd() {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

module.exports = async function simulationRoute(req, res) {
  if (String(req.method || "GET").toUpperCase() === "OPTIONS") {
    withCors(res);
    res.status(204).end();
    return;
  }

  const response = await handler({
    httpMethod: req.method,
    queryStringParameters: normalizeQuery(req.query || {}),
    headers: req.headers || {},
    body: await readBody(req)
  });

  withCors(res, response.headers || {});
  res.status(response.statusCode || 200).send(response.body || "");
};
