const twilio = require("twilio");
const { blobGet, blobSetJSON } = require("./blobs-helper");

const SITE_URL = "https://consultaprocesos.netlify.app";
const BLOQUEO_MS = 90 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fechaColombia() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bogota"
  });
}

async function fetchRama(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Referer": "https://consultaprocesos.ramajudicial.gov.co/",
      "Origin": "https://consultaprocesos.ramajudicial.gov.co"
    }
  });

  if (res.status === 403) {
    const error = new Error("BLOQUEO_RAMA_403");
    error.code = "BLOQUEO_RAMA_403";
    throw error;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function consultarProceso(numero) {
  const urlProceso =
    `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(numero)}&SoloActivos=false&pagina=1`;

  const dataProceso = await fetchRama(urlProceso);
  const procesos = dataProceso.procesos || [];

  if (procesos.length === 0) {
    return {
      numeroRadicacion: numero,
      sujetoProc: "No encontrado",
      fechaActuacion: "",
      actuacion: "No encontrado",
      anotacion: "",
      fechaInicial: "",
      fechaFinal: "",
      fechaRegistro: ""
    };
  }

  const proceso = procesos[0];

  await sleep(250);

  const urlActuaciones =
    `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;

  const dataAct = await fetchRama(urlActuaciones);
  const ultima = (dataAct.actuaciones || [])[0] || {};

  return {
    numeroRadicacion: numero,
    idProceso: proceso.idProceso,
    sujetoProc: proceso.sujetosProcesales || "",
    fechaActuacion: ultima.fechaActuacion || "",
    actuacion: ultima.actuacion || "Sin actuaciones",
    anotacion: ultima.anotacion || "",
    fechaInicial: ultima.fechaInicial || "",
    fechaFinal: ultima.fechaFinal || "",
    fechaRegistro: ultima.fechaRegistro || ""
  };
}

function claveActuacion(p) {
  return [
    p.fechaActuacion || "",
    p.actuacion || "",
    p.anotacion || "",
    p.fechaRegistro || ""
  ].join(" | ");
}

function clasificarAlerta(p) {
  const texto = `${p.actuacion || ""} ${p.anotacion || ""}`.toLowerCase();

  if (texto.includes("remate")) return "🔥 PRIORIDAD: revisar remate.";
  if (texto.includes("traslado")) return "⚠️ Revisar término de traslado.";
  if (texto.includes("sentencia")) return "🔴 Revisar eventual recurso.";
  if (texto.includes("liquidación") || texto.includes("liquidacion")) return "⚠️ Revisar liquidación.";
  if (texto.includes("recurso")) return "⚠️ Revisar recurso.";
  if (texto.includes("audiencia")) return "🔴 Revisar audiencia.";

  return "📄 Nueva actuación. Revisar.";
}

function generarMensaje({ novedades, errores, sinNovedad, total }) {
  const fecha = new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota"
  });

  let msg = `📅 Informe diario de procesos – ${fecha}\n\n`;
  msg += `📌 Procesos consultados: ${total}\n`;
  msg += `🔴 Novedades: ${novedades.length}\n`;
  msg += `🟢 Sin novedades: ${sinNovedad}\n`;
  msg += `⚠️ No consultados: ${errores.length}\n\n`;

  novedades.slice(0, 10).forEach((p, i) => {
    msg += `${i + 1}. Radicado: ${p.numeroRadicacion}\n`;
    msg += `Fecha: ${p.fechaActuacion || "Sin fecha"}\n`;
    msg += `Actuación: ${p.actuacion || "Sin actuación"}\n`;
    msg += `Alerta: ${clasificarAlerta(p)}\n\n`;
  });

  msg += `📎 Informe completo PDF:\n${SITE_URL}/.netlify/functions/informe-pdf\n`;

  return msg;
}

async function enviarWhatsApp(mensaje) {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log(mensaje);
    return;
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: process.env.WHATSAPP_TO,
    body: mensaje
  });
}

function logInfo(evento, datos = {}) {
  console.log(JSON.stringify({
    fn: "agente-step",
    evento,
    ts: new Date().toISOString(),
    ...datos
  }));
}

exports.handler = async (event = {}) => {
  try {
  const params = event.queryStringParameters || {};

  const limite = parseInt(params.limite || "4", 10);
  const reset = params.reset === "1";
  const enviar = params.enviar !== "0";
  const fecha = fechaColombia();

  logInfo("inicio", { limite, reset, enviar, fecha });

  const radicadosRaw =
    (await blobGet("radicados.json", { type: "json" })) || [];

  const mapa = new Map();

  radicadosRaw.forEach((r, index) => {
    if (!r.numero) return;

    const numero = String(r.numero).trim();

    if (!mapa.has(numero)) {
      mapa.set(numero, {
        ...r,
        numero,
        orden: r.orden ?? index + 1
      });
    }
  });

  const radicados = Array.from(mapa.values()).sort(
    (a, b) => Number(a.orden || 0) - Number(b.orden || 0)
  );

  logInfo("radicados_cargados", { total: radicados.length });

  let estado =
    (await blobGet("estado-agente.json", { type: "json" })) || null;

  if (reset || !estado || estado.fecha !== fecha) {
    logInfo("reinicio_dia", { fechaAnterior: estado?.fecha || null });
    estado = {
      fecha,
      desde: 0,
      todos: [],
      errores: [],
      bloqueadoHasta: null,
      terminado: false,
      whatsappEnviado: false
    };
  }

  if (estado.terminado && estado.fecha === fecha && !reset) {
    logInfo("ya_terminado", { procesados: estado.todos?.length || 0 });
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        terminado: true,
        mensaje: "El agente ya terminó hoy. No se reejecuta ni reenvía WhatsApp."
      })
    };
  }

  if (
    estado.bloqueadoHasta &&
    Date.now() < new Date(estado.bloqueadoHasta).getTime()
  ) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        ok: false,
        bloqueado: true,
        desde: estado.desde,
        total: radicados.length,
        bloqueadoHasta: estado.bloqueadoHasta
      })
    };
  }

  const bloque = radicados.slice(estado.desde, estado.desde + limite);

  logInfo("procesando_lote", {
    desde: estado.desde,
    limite,
    enLote: bloque.length,
    total: radicados.length
  });

  for (const r of bloque) {
    try {
      logInfo("consultando", { numero: r.numero, cliente: r.cliente || "" });
      const resultado = await consultarProceso(r.numero);

      estado.todos.push({
        ...r,
        ...resultado
      });

      await sleep(700);
    } catch (error) {
      if (error.code === "BLOQUEO_RAMA_403") {
        estado.bloqueadoHasta = new Date(
          Date.now() + BLOQUEO_MS
        ).toISOString();

        await blobSetJSON("estado-agente.json", estado);

        return {
          statusCode: 429,
          body: JSON.stringify({
            ok: false,
            bloqueado: true,
            desde: estado.desde,
            total: radicados.length,
            bloqueadoHasta: estado.bloqueadoHasta
          })
        };
      }

      estado.errores.push({
        ...r,
        numeroRadicacion: r.numero,
        error: error.message
      });

      await sleep(800);
    }
  }

  estado.desde += bloque.length;
  estado.bloqueadoHasta = null;

  if (estado.desde < radicados.length) {
    await blobSetJSON("estado-agente.json", estado);

    logInfo("lote_guardado", {
      desde: estado.desde,
      total: radicados.length,
      procesados: estado.todos.length,
      errores: estado.errores.length
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        terminado: false,
        desde: estado.desde,
        total: radicados.length,
        procesados: estado.todos.length,
        errores: estado.errores.length
      })
    };
  }

  const historial =
    (await blobGet("historial.json", { type: "json" })) || {};

  const nuevoHistorial = {};
  const novedades = [];
  let sinNovedad = 0;

  estado.todos.forEach(p => {
    const claveNueva = claveActuacion(p);
    const claveAnterior = historial[p.numeroRadicacion];

    nuevoHistorial[p.numeroRadicacion] = claveNueva;

    if (!claveAnterior || claveAnterior !== claveNueva) {
      novedades.push(p);
    } else {
      sinNovedad++;
    }
  });

  estado.terminado = true;

  await blobSetJSON("historial.json", nuevoHistorial);

  await blobSetJSON("ultimo-reporte.json", {
    fecha: new Date().toISOString(),
    todos: estado.todos,
    novedades,
    errores: estado.errores,
    sinNovedad,
    historial: nuevoHistorial
  });

  const mensaje = generarMensaje({
    novedades,
    errores: estado.errores,
    sinNovedad,
    total: estado.todos.length
  });

  if (enviar && !estado.whatsappEnviado) {
    logInfo("enviando_whatsapp", { novedades: novedades.length });
    await enviarWhatsApp(mensaje);
    estado.whatsappEnviado = true;
  }

  await blobSetJSON("estado-agente.json", estado);

  logInfo("dia_completado", {
    total: estado.todos.length,
    novedades: novedades.length,
    errores: estado.errores.length,
    whatsapp: estado.whatsappEnviado
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      terminado: true,
      mensaje
    })
  };
  } catch (error) {
    console.error("ERROR agente-step:", error);

    const esBlobs = error?.name === "BlobsInternalError" || /503/.test(error?.message || "");

    return {
      statusCode: esBlobs ? 503 : 500,
      body: JSON.stringify({
        ok: false,
        error: error.message,
        reintentar: esBlobs
      })
    };
  }
};