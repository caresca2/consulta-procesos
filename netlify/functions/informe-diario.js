const { schedule } = require("@netlify/functions");
const agente = require("./agente-step");

function horaColombia() {
  const now = new Date();

  const hora = parseInt(
    new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Bogota"
    }).format(now)
  );

  const minuto = parseInt(
    new Intl.DateTimeFormat("es-CO", {
      minute: "numeric",
      timeZone: "America/Bogota"
    }).format(now)
  );

  return { hora, minuto };
}

exports.handler = schedule("*/5 * * * *", async () => {

  const { hora, minuto } = horaColombia();

  const horaInicio = parseInt(process.env.AGENTE_HORA_INICIO || "8");
  const horaFin = parseInt(process.env.AGENTE_HORA_FIN || "10");
  const minutoInicio = parseInt(process.env.AGENTE_MINUTO_INICIO || "0");

  // ⛔ Antes de la hora de inicio
  if (hora < horaInicio || (hora === horaInicio && minuto < minutoInicio)) {
    return { statusCode: 200, body: "Aún no inicia" };
  }

  // ⛔ Después de la hora fin
  if (hora > horaFin) {
    return { statusCode: 200, body: "Fuera de ventana" };
  }

  // 🚀 Ejecutar agente
  return agente.handler({
    queryStringParameters: {
      limite: process.env.AGENTE_LIMITE || "4",
      enviar: "1"
    }
  });
});