const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createEngineSandbox } = require("./createEngineSandbox");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const ENGINE_FILES = [
  "script.js",
  "stage2-overrides.js",
  "stage2-period-overrides.js",
  "handoff-engine.js"
];

function loadHandoffEngineApi(options = {}) {
  const sandbox = createEngineSandbox(options);
  vm.createContext(sandbox);

  for (const file of ENGINE_FILES) {
    const fullPath = path.join(ROOT, file);
    const content = fs.readFileSync(fullPath, "utf8");
    vm.runInContext(content, sandbox, { filename: file });
  }

  return {
    api: sandbox.window.handoffAppApi,
    sandbox
  };
}

module.exports = {
  loadHandoffEngineApi,
  ROOT,
  ENGINE_FILES
};
