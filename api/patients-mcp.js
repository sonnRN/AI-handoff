const { handler } = require("../src/server/handlers/patientsMcpApi");
const { toVercelHandler } = require("../src/server/adapters/toVercelHandler");

module.exports = toVercelHandler(handler);
