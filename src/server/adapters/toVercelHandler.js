function normalizeQuery(query = {}) {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => {
      if (Array.isArray(value)) return [key, String(value[0] || "")];
      return [key, String(value || "")];
    })
  );
}

function withCors(res, headers = {}) {
  const merged = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...headers
  };

  Object.entries(merged).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function toVercelHandler(serverHandler) {
  return async function vercelHandler(req, res) {
    if (String(req.method || "GET").toUpperCase() === "OPTIONS") {
      withCors(res);
      res.status(204).end();
      return;
    }

    const response = await serverHandler({
      queryStringParameters: normalizeQuery(req.query || {})
    });

    withCors(res, response.headers || {});
    res.status(response.statusCode || 200).send(response.body || "");
  };
}

module.exports = {
  toVercelHandler
};
