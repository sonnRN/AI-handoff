const assert = require("assert");
const { toVercelHandler } = require("../src/server/adapters/toVercelHandler");

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = String(payload || "");
      this.ended = true;
      return this;
    },
    end(payload = "") {
      this.body = String(payload || "");
      this.ended = true;
      return this;
    }
  };
}

async function main() {
  const handler = toVercelHandler(async ({ queryStringParameters }) => ({
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      ok: true,
      id: queryStringParameters.id || ""
    })
  }));

  const optionsRes = createResponseRecorder();
  await handler({ method: "OPTIONS", query: {} }, optionsRes);
  assert.strictEqual(optionsRes.statusCode, 204);
  assert.strictEqual(optionsRes.headers["access-control-allow-origin"], "*");

  const getRes = createResponseRecorder();
  await handler({ method: "GET", query: { id: "patient-1" } }, getRes);
  assert.strictEqual(getRes.statusCode, 200);
  assert.strictEqual(getRes.headers["content-type"], "application/json; charset=utf-8");
  assert.strictEqual(getRes.headers["access-control-allow-origin"], "*");
  assert.deepStrictEqual(JSON.parse(getRes.body), {
    ok: true,
    id: "patient-1"
  });

  console.log("Vercel adapter smoke test passed.");
}

main().catch((error) => {
  console.error(`Vercel adapter smoke test failed: ${error.message}`);
  process.exit(1);
});
