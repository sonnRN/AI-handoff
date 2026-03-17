const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const tests = [
  { label: "mcp runtime wiring", command: ["node", "tests/mcp-runtime-wiring-smoke.js"] },
  { label: "mcp gateway regression", command: ["node", "tests/mcp-gateway-regression.js"] },
  { label: "mcp patient smoke", command: ["node", "tests/mcp-patients-smoke.js"] },
  { label: "emr patient list 20", command: ["node", "tests/emr-patient-list-20-smoke.js"] },
  { label: "stage2 regression", command: ["node", "tests/stage2-summary-regression.js"] },
  { label: "fhir smoke", command: ["node", "tests/fhir-stage12-smoke.js"] },
  { label: "fhir batch", command: ["node", "tests/fhir-stage12-batch.js", "5"] },
  { label: "render smoke", command: ["node", "tests/emr-render-smoke.js"] }
];

for (const test of tests) {
  process.stdout.write(`\n[run] ${test.label}\n`);
  const result = spawnSync(test.command[0], test.command.slice(1), {
    cwd: ROOT,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.stderr.write(`\n[fail] ${test.label}\n`);
    process.exit(result.status || 1);
  }

  process.stdout.write(`[pass] ${test.label}\n`);
}

process.stdout.write("\nAll harness tests passed.\n");
