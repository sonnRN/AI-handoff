const http = require("http");
const { URL } = require("url");
const { handler: patientsHandler } = require("./handlers/patientsApi");
const { handler: patientsMcpHandler } = require("./handlers/patientsMcpApi");
const { BUILD_INFO } = require("./buildInfo");

function buildCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...buildCorsHeaders(),
    ...extraHeaders
  });
  res.end(payload);
}

function parseQuery(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function createHttpServer(options = {}) {
  const routePatients = options.patientsHandler || patientsHandler;
  const routePatientsMcp = options.patientsMcpHandler || patientsMcpHandler;

  return http.createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (method === "OPTIONS") {
      res.writeHead(204, buildCorsHeaders());
      res.end();
      return;
    }

    if (method !== "GET") {
      sendJson(res, 405, {
        error: "Method not allowed"
      });
      return;
    }

    if (url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "ai-handoff-remote-mcp",
        timestamp: new Date().toISOString(),
        build: BUILD_INFO.build,
        version: BUILD_INFO.version,
        runtime: BUILD_INFO.runtime
      });
      return;
    }

    if (url.pathname === "/api/config") {
      sendJson(res, 200, {
        ok: true,
        apiBaseHint: "",
        routes: ["/health", "/api/patients", "/api/patients-mcp"]
      });
      return;
    }

    const queryStringParameters = parseQuery(url);

    try {
      if (url.pathname === "/api/patients") {
        const response = await routePatients({ queryStringParameters });
        sendJson(res, response.statusCode || 200, response.body || "{}", response.headers || {});
        return;
      }

      if (url.pathname === "/api/patients-mcp") {
        const response = await routePatientsMcp({ queryStringParameters });
        sendJson(res, response.statusCode || 200, response.body || "{}", response.headers || {});
        return;
      }

      sendJson(res, 404, {
        error: "Not found",
        path: url.pathname
      });
    } catch (error) {
      sendJson(res, 500, {
        error: "Remote server request failed",
        detail: error.message
      });
    }
  });
}

function startHttpServer(options = {}) {
  const port = Number.parseInt(String(options.port || process.env.PORT || 8787), 10);
  const server = createHttpServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      resolve({ server, port });
    });
  });
}

if (require.main === module) {
  startHttpServer()
    .then(({ port }) => {
      process.stdout.write(`AI handoff remote server listening on ${port}\n`);
    })
    .catch((error) => {
      process.stderr.write(`Failed to start remote server: ${error.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  createHttpServer,
  startHttpServer
};
