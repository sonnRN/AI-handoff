const { getSharedPatientDataGateway } = require("../runtime/patientDataGateway");

const gateway = getSharedPatientDataGateway();
const PROTOCOL_VERSION = "2026-03-demo";

function writeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

function sendResult(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, error) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: error.message || String(error)
    }
  });
}

function buildToolResponse(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data)
      }
    ],
    structuredContent: data
  };
}

function listTools() {
  return {
    tools: [
      {
        name: "patients_list",
        description: "FHIR 환자 목록을 안정적으로 조회하고 페이지 정보를 반환한다.",
        inputSchema: {
          type: "object",
          properties: {
            count: { type: "number" },
            cursor: { type: "string" },
            source: { type: "string" },
            forceRefresh: { type: "boolean" }
          }
        }
      },
      {
        name: "patient_detail",
        description: "FHIR 환자 상세 데이터를 조회하고 캐시/폴백 메타데이터를 함께 반환한다.",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
            source: { type: "string" },
            forceRefresh: { type: "boolean" }
          }
        }
      },
      {
        name: "patients_prefetch",
        description: "여러 페이지의 FHIR 환자 목록을 미리 수집해 캐시를 예열한다.",
        inputSchema: {
          type: "object",
          properties: {
            count: { type: "number" },
            pages: { type: "number" },
            cursor: { type: "string" },
            source: { type: "string" },
            forceRefresh: { type: "boolean" }
          }
        }
      }
    ]
  };
}

async function handleToolCall(name, args = {}) {
  if (name === "patients_list") {
    return gateway.listPatients(args);
  }
  if (name === "patient_detail") {
    return gateway.getPatientDetail(args.id, args);
  }
  if (name === "patients_prefetch") {
    return gateway.prefetchPatients(args);
  }

  throw new Error(`Unsupported MCP tool: ${name}`);
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;

  const { id, method, params } = message;

  try {
    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: {
          name: "local-fhir-mcp",
          version: "1.0.0"
        },
        capabilities: {
          tools: {}
        }
      });
      return;
    }

    if (method === "notifications/initialized") {
      return;
    }

    if (method === "ping") {
      sendResult(id, {});
      return;
    }

    if (method === "tools/list") {
      sendResult(id, listTools());
      return;
    }

    if (method === "tools/call") {
      const data = await handleToolCall(params?.name, params?.arguments || {});
      sendResult(id, buildToolResponse(data));
      return;
    }

    throw new Error(`Unsupported MCP method: ${method}`);
  } catch (error) {
    sendError(id, error);
  }
}

let buffer = Buffer.alloc(0);

function readMessages(chunk) {
  buffer = Buffer.concat([buffer, chunk]);

  while (buffer.length) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const headerBlock = buffer.slice(0, headerEnd).toString("utf8");
    const contentLengthMatch = headerBlock.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = Buffer.alloc(0);
      throw new Error("MCP header missing Content-Length");
    }

    const contentLength = Number.parseInt(contentLengthMatch[1], 10);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) return;

    const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
    buffer = buffer.slice(messageEnd);
    handleMessage(JSON.parse(payload)).catch((error) => {
      sendError(null, error);
    });
  }
}

process.stdin.on("data", (chunk) => {
  try {
    readMessages(chunk);
  } catch (error) {
    sendError(null, error);
  }
});

process.stdin.resume();
