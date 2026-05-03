const { schedule } = require("@netlify/functions");
const agente = require("./agente-step");
const { getStore } = require("@netlify/blobs");

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

function getStoreProcesos() {
  return getStore({
    name: "procesos-historial",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
  });
}

function fechaColombia() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bogota"
  });
}

exports.handler = schedule("*/5 * * * *", async () => {

  const { hora, minuto } = horaColombia();

  const horaInicio = parseInt(process.env.AGENTE_HORA_INICIO || "8", 10);
  const minutoInicio = parseInt(process.env.AGENTE_MINUTO_INICIO || "0", 10);

  // ⛔ Antes de la hora
  if (hora < horaInicio || (hora === horaInicio && minuto < minutoInicio)) {

    return {
      statusCode: 200,
      body: JSON.stringify({
        mensaje: "Aún no inicia",
        horaActual: hora,
        minutoActual: minuto,
        horaInicio,
        minutoInicio
      })
    };
  }

  // 🔍 Verificar si ya terminó hoy
  const store = getStoreProcesos();
  const estado = await store.get("estado-agente.json", { type: "json" });
  const fecha = fechaColombia();

  if (estado?.terminado && estado?.fecha === fecha) {
    return {
        statusCode: 200,
        body: JSON.stringify({
          mensaje: "Pasó validación de hora",
          horaActual: hora,
          minutoActual: minuto,
          horaInicio,
          minutoInicio,
          estadoTerminado: estado?.terminado,
          fechaEstado: estado?.fecha,
          fechaActual: fecha
        })
      };
  }

  // 🚀 Ejecutar agente
  return agente.handler({
    queryStringParameters: {
      limite: process.env.AGENTE_LIMITE || "4",
      enviar: "1"
    }
  });
});