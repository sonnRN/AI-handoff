const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function main() {
  const indexHtml = read("index.html");
  const algorithmDemoHtml = read("algorithm-demo.html");
  const scriptSource = read("script.js");
  const gatewaySource = read(path.join("src", "mcp", "runtime", "patientDataGateway.js"));

  assert(!/src="patients\.js"/i.test(indexHtml), "index.html should not load local patients.js at runtime");
  assert(!/src="patients\.js"/i.test(algorithmDemoHtml), "algorithm-demo.html should not load local patients.js at runtime");
  assert(!/const localPatients\b/.test(scriptSource), "script.js should not keep a local patients runtime fallback");
  assert(/api\/patients-mcp/.test(scriptSource), "script.js should keep the MCP API as the primary source");
  assert(!/public-demo-data\/patients-bundle\.json/.test(scriptSource), "script.js should not include a static patient bundle fallback");
  assert(/const fallbackHandler = typeof options\.fallbackHandler === "function" \? options\.fallbackHandler : null;/.test(gatewaySource), "patientDataGateway should require an explicit fallback handler");
  assert(!/createLocalFallbackHandler/.test(gatewaySource), "patientDataGateway should not create a built-in local demo fallback");

  console.log("MCP runtime wiring smoke test passed.");
}

try {
  main();
} catch (error) {
  console.error(`MCP runtime wiring smoke test failed: ${error.message}`);
  process.exit(1);
}
