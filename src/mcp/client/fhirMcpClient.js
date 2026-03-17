const path = require("path");
const { spawn } = require("child_process");
const { ROOT } = require("../../harness/runtime/loadHandoffEngineApi");

let sharedClient = null;

class FhirMcpClient {
  constructor(options = {}) {
    this.serverPath = options.serverPath || path.join(ROOT, "src", "mcp", "server", "fhirMcpServer.js");
    this.timeoutMs = options.timeoutMs || 30000;
    this.child = null;
    this.messageId = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.initialized = false;
  }

  async start() {
    if (this.child) return this;

    this.child = spawn(process.execPath, [this.serverPath], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.on("data", (chunk) => this.readMessages(chunk));
    this.child.stderr.on("data", () => {});
    this.child.on("exit", () => {
      const error = new Error("FHIR MCP server exited unexpectedly");
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
      this.child = null;
      this.initialized = false;
    });

    await this.request("initialize", {
      protocolVersion: "2026-03-demo",
      clientInfo: {
        name: "ai-handoff-client",
        version: "1.0.0"
      },
      capabilities: {}
    });

    this.notify("notifications/initialized", {});
    this.initialized = true;
    return this;
  }

  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.initialized = false;
  }

  writeMessage(message) {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    this.child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`);
    this.child.stdin.write(payload);
  }

  notify(method, params) {
    if (!this.child) return;
    this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`FHIR MCP request timed out: ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.writeMessage({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
    });
  }

  readMessages(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const headerBlock = this.buffer.slice(0, headerEnd).toString("utf8");
      const contentLengthMatch = headerBlock.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        this.buffer = Buffer.alloc(0);
        throw new Error("FHIR MCP response header missing Content-Length");
      }

      const contentLength = Number.parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) return;

      const payload = this.buffer.slice(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      this.handleResponse(JSON.parse(payload));
    }
  }

  handleResponse(message) {
    if (!message || typeof message.id === "undefined") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message || "FHIR MCP request failed"));
      return;
    }

    pending.resolve(message.result);
  }

  async listTools() {
    await this.start();
    return this.request("tools/list", {});
  }

  async callTool(name, args = {}) {
    await this.start();
    const result = await this.request("tools/call", {
      name,
      arguments: args
    });

    if (result?.structuredContent) {
      return result.structuredContent;
    }

    const text = result?.content?.[0]?.text;
    return text ? JSON.parse(text) : result;
  }

  async listPatients(args = {}) {
    return this.callTool("patients_list", args);
  }

  async getPatientDetail(args = {}) {
    return this.callTool("patient_detail", args);
  }

  async prefetchPatients(args = {}) {
    return this.callTool("patients_prefetch", args);
  }
}

async function getSharedFhirMcpClient() {
  if (!sharedClient) {
    sharedClient = new FhirMcpClient();
  }

  await sharedClient.start();
  return sharedClient;
}

module.exports = {
  FhirMcpClient,
  getSharedFhirMcpClient
};
