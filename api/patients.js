const { handler } = require("../src/server/handlers/patientsApi");
const { toVercelHandler } = require("../src/server/adapters/toVercelHandler");

module.exports = toVercelHandler(handler);
