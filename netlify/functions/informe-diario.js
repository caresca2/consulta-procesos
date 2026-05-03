const { schedule } = require("@netlify/functions");
const agente = require("./agente-step");

// Corre cada 10 minutos entre 8:30 a.m. y 10:50 a.m. Colombia.
// Colombia UTC-5 = 13:30 a 15:50 UTC.
exports.handler = schedule("*/10 13-15 * * *", async () => {
  return agente.handler({
    queryStringParameters: {
      limite: "4",
      enviar: "1"
    }
  });
});