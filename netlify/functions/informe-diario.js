const agente = require("./agente-step");
const { blobGet, isRetryableBlobError } = require("./blobs-helper");

function horaColombia() {
  const now = new Date();

  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const hora = parseInt(partes.find(p => p.type === "hour").value, 10);
  const minuto = parseInt(partes.find(p => p.type === "minute").value, 10);

  return { hora, minuto };
}

function fechaColombia() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bogota"
  });
}

function logInfo(evento, datos = {}) {
  console.log(JSON.stringify({
    fn: "informe-diario",
    evento,
    ts: new Date().toISOString(),
    ...datos
  }));
}

function respuesta(statusCode, datos) {
  logInfo("respuesta", { statusCode, ...datos });
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  };
}

exports.handler = async () => {
  try {
    logInfo("inicio");

    const { hora, minuto } = horaColombia();
    const fecha = fechaColombia();

    const horaInicio = parseInt(process.env.AGENTE_HORA_INICIO || "8", 10);
    const minutoInicio = parseInt(process.env.AGENTE_MINUTO_INICIO || "0", 10);

    if (hora < horaInicio || (hora === horaInicio && minuto < minutoInicio)) {
      return respuesta(200, {
        accion: "esperando_hora",
        mensaje: "Aún no inicia",
        horaActual: hora,
        minutoActual: minuto,
        horaInicio,
        minutoInicio,
        fecha
      });
    }

    const estado = await blobGet("estado-agente.json", { type: "json" });

    const esNuevoDia = !estado || estado.fecha !== fecha;

    if (!esNuevoDia && estado.terminado) {
      return respuesta(200, {
        accion: "ya_terminado",
        mensaje: "El agente ya terminó hoy",
        fecha,
        desde: estado.desde,
        procesados: estado.todos?.length || 0
      });
    }

    const limite = process.env.AGENTE_LIMITE || "2";

    logInfo("ejecutando_agente", {
      esNuevoDia,
      limite,
      estadoDesde: estado?.desde ?? 0,
      estadoProcesados: estado?.todos?.length ?? 0
    });

    const resultado = await agente.handler({
      queryStringParameters: {
        limite,
        enviar: "1",
        reset: esNuevoDia ? "1" : "0"
      }
    });

    let cuerpo = {};
    try {
      cuerpo = JSON.parse(resultado.body || "{}");
    } catch {
      cuerpo = { raw: resultado.body };
    }

    return respuesta(resultado.statusCode || 200, {
      accion: "agente_ejecutado",
      esNuevoDia,
      limite,
      fecha,
      horaActual: hora,
      minutoActual: minuto,
      agente: cuerpo
    });
  } catch (error) {
    console.error("ERROR informe-diario:", error);

    if (isRetryableBlobError(error)) {
      return respuesta(503, {
        accion: "blobs_no_disponible",
        mensaje: "Netlify Blobs temporalmente no disponible; se reintentará en la próxima corrida",
        error: error.message
      });
    }

    return respuesta(500, {
      accion: "error",
      error: error.message
    });
  }
};
