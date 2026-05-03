const { schedule } = require("@netlify/functions");
const agente = require("./agente-step");

function horaColombia() {
  const now = new Date();

  const hora = parseInt(
    new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Bogota"
    }).format(now),
    10
  );

  const minuto = parseInt(
    new Intl.DateTimeFormat("es-CO", {
      minute: "numeric",
      timeZone: "America/Bogota"
    }).format(now),
    10
  );

  return { hora, minuto };
}

exports.handler = schedule("*/5 * * * *", async () => {
  const { hora, minuto } = horaColombia();

  const horaInicio = parseInt(process.env.AGENTE_HORA_INICIO || "8", 10);
  const minutoInicio = parseInt(process.env.AGENTE_MINUTO_INICIO || "0", 10);

  // No inicia antes de la hora configurada
  if (hora < horaInicio || (hora === horaInicio && minuto < minutoInicio)) {
    return {
      statusCode: 200,
      body: "Aún no inicia"
    };
  }

  // Una vez llegó la hora de inicio, corre cada 5 minutos hasta terminar
  return agente.handler({
    queryStringParameters: {
      limite: process.env.AGENTE_LIMITE || "4",
      enviar: "1"
    }
  });
});