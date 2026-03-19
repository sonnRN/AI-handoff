const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { handler: patientsHandler } = require("./handlers/patientsApi");
const { handler: patientsMcpHandler } = require("./handlers/patientsMcpApi");
const { handler: simulationHandler } = require("./handlers/simulationApi");
const { BUILD_INFO } = require("./buildInfo");

const STATIC_ROOT = path.resolve(__dirname, "..", "..");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function buildCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function resolveStaticFile(pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(safePath).replace(/^(\.\.[\\/])+/, "");
  const absolutePath = path.resolve(STATIC_ROOT, `.${normalized}`);
  if (!absolutePath.startsWith(STATIC_ROOT)) return null;
  return absolutePath;
}

function serveStaticFile(res, pathname) {
  const absolutePath = resolveStaticFile(pathname);
  if (!absolutePath || !fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return false;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType
  });
  fs.createReadStream(absolutePath).pipe(res);
  return true;
}

function createHttpServer(options = {}) {
  const routePatients = options.patientsHandler || patientsHandler;
  const routePatientsMcp = options.patientsMcpHandler || patientsMcpHandler;
  const routeSimulation = options.simulationHandler || simulationHandler;

  return http.createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (method === "OPTIONS") {
      res.writeHead(204, buildCorsHeaders());
      res.end();
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
        if (method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }
        const response = await routePatients({ queryStringParameters });
        sendJson(res, response.statusCode || 200, response.body || "{}", response.headers || {});
        return;
      }

      if (url.pathname === "/api/patients-mcp") {
        if (method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }
        const response = await routePatientsMcp({ queryStringParameters });
        sendJson(res, response.statusCode || 200, response.body || "{}", response.headers || {});
        return;
      }

      if (url.pathname === "/api/simulation") {
        const body = method === "POST" ? await readBody(req) : "";
        const response = await routeSimulation({
          httpMethod: method,
          queryStringParameters,
          headers: req.headers || {},
          body
        });
        sendJson(res, response.statusCode || 200, response.body || "{}", response.headers || {});
        return;
      }

      if (method === "GET" && serveStaticFile(res, url.pathname)) {
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
