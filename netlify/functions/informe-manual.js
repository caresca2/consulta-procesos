const { schedule } = require("@netlify/functions");
const { getStore } = require("@netlify/blobs");
const twilio = require("twilio");

const RADICADOS = [
  "11001310301020170045000"
  // agrega aquí tus otros radicados
];


async function realizarConsultaAPI(numeroRadicacion) {
  const numeroRadicacionP = encodeURIComponent(numeroRadicacion);
  const apiUrl = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${numeroRadicacionP}&SoloActivos=false&pagina=1`;

  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Error consulta proceso: ${response.status}`);
  return response.json();
}

async function consultarActuaciones(idProceso) {
  const idProcesoP = encodeURIComponent(idProceso);
  const apiUrl = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${idProcesoP}?pagina=1`;

  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Error actuaciones: ${response.status}`);
  return response.json();
}

async function consultarProceso(numeroRadicacion) {
  const respuestaAPI = await realizarConsultaAPI(numeroRadicacion);
  const procesos = respuestaAPI.procesos || [];

  if (procesos.length === 0) {
    return {
      numeroRadicacion,
      estado: "NO_ENCONTRADO"
    };
  }

  const proceso = procesos[0];
  const segundaConsulta = await consultarActuaciones(proceso.idProceso);
  const actuaciones = segundaConsulta.actuaciones || [];
  const ultima = actuaciones[0];

  if (!ultima) {
    return {
      numeroRadicacion,
      idProceso: proceso.idProceso,
      sujetoProc: proceso.sujetosProcesales,
      estado: "SIN_ACTUACIONES"
    };
  }

  return {
    numeroRadicacion,
    idProceso: proceso.idProceso,
    sujetoProc: proceso.sujetosProcesales,
    fechaActuacion: ultima.fechaActuacion,
    actuacion: ultima.actuacion,
    anotacion: ultima.anotacion,
    fechaInicial: ultima.fechaInicial,
    fechaFinal: ultima.fechaFinal,
    fechaRegistro: ultima.fechaRegistro
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

function generarMensaje(novedades, errores, sinNovedad) {
  const fecha = new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota"
  });

  let msg = `📅 Informe diario de procesos – ${fecha}\n\n`;

  if (novedades.length === 0) {
    msg += `🟢 Sin novedades en ${sinNovedad} proceso(s).\n`;
  } else {
    msg += `🔴 Novedades encontradas: ${novedades.length}\n\n`;

    novedades.forEach((p, i) => {
      msg += `${i + 1}. Radicado: ${p.numeroRadicacion}\n`;
      msg += `Sujetos: ${p.sujetoProc || "No registrado"}\n`;
      msg += `Fecha actuación: ${p.fechaActuacion || "Sin fecha"}\n`;
      msg += `Actuación: ${p.actuacion || "Sin actuación"}\n`;
      if (p.anotacion) msg += `Anotación: ${p.anotacion}\n`;
      msg += `Alerta: ${clasificarAlerta(p)}\n\n`;
    });

    msg += `🟢 Sin novedades: ${sinNovedad} proceso(s).\n`;
  }

  if (errores.length > 0) {
    msg += `\n⚠️ No consultados: ${errores.length}\n`;
    errores.forEach(e => {
      msg += `- ${e.numeroRadicacion}: ${e.error}\n`;
    });
  }

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

async function ejecutarAgente() {
  const store = getStore("procesos-historial");

  let historial = {};
  try {
    historial = (await store.get("historial.json", { type: "json" })) || {};
  } catch {
    historial = {};
  }

  const nuevoHistorial = {};
  const novedades = [];
  const errores = [];
  let sinNovedad = 0;

  for (const radicado of RADICADOS) {
    try {
      const resultado = await consultarProceso(radicado);
      const claveNueva = claveActuacion(resultado);
      const claveAnterior = historial[radicado];

      nuevoHistorial[radicado] = claveNueva;

      if (!claveAnterior || claveAnterior !== claveNueva) {
        novedades.push(resultado);
      } else {
        sinNovedad++;
      }
    } catch (error) {
      errores.push({
        numeroRadicacion: radicado,
        error: error.message
      });
    }
  }

  await store.setJSON("historial.json", nuevoHistorial);

  const mensaje = generarMensaje(novedades, errores, sinNovedad);
  await enviarWhatsApp(mensaje);

  return mensaje;
}

exports.handler = async () => {

    const mensaje = await ejecutarAgente();
  
    return {
  
      statusCode: 200,
  
      body: mensaje
  
    };
  
  };