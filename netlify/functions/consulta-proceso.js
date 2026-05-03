const { getStore } = require("@netlify/blobs");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBlobStore() {
  return getStore({
    name: "procesos-historial",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
  });
}

// ⚠️ MENOS RETRY = MENOS TIMEOUT
async function fetchConRetry(url, intentos = 1) {
  for (let i = 0; i < intentos; i++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": "https://consultaprocesos.ramajudicial.gov.co/",
        "Origin": "https://consultaprocesos.ramajudicial.gov.co"
      }
    });

    if (res.ok) return res;

    if (res.status === 403) {
      console.log("⚠️ 403 detectado");
      await sleep(1500);
      continue;
    }

    throw new Error(`HTTP ${res.status}`);
  }

  throw new Error("403 persistente");
}

async function consultarProceso(numero) {
  const urlProceso =
    `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(numero)}&SoloActivos=false&pagina=1`;

  const resProceso = await fetchConRetry(urlProceso);
  const dataProceso = await resProceso.json();

  const procesos = dataProceso.procesos || [];

  if (procesos.length === 0) {
    return {
      numeroRadicacion: numero,
      sujetoProc: "No encontrado",
      actuacion: "No encontrado",
      fechaActuacion: "",
      anotacion: "",
      fechaInicial: "",
      fechaFinal: "",
      fechaRegistro: ""
    };
  }

  const proceso = procesos[0];

  // ⚠️ PAUSA CORTA ENTRE CONSULTAS
  await sleep(250);

  const urlActuaciones =
    `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;

  const resActuaciones = await fetchConRetry(urlActuaciones);
  const dataActuaciones = await resActuaciones.json();

  const ultima = (dataActuaciones.actuaciones || [])[0] || {};

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

exports.handler = async (event) => {
  try {
    const store = getBlobStore();

    const radicadosOriginales =
      (await store.get("radicados.json", { type: "json" })) || [];

    // LIMPIAR DUPLICADOS
    const mapa = new Map();

    radicadosOriginales.forEach((r, index) => {
      if (r.numero) {
        const numero = String(r.numero).trim();

        if (!mapa.has(numero)) {
          mapa.set(numero, {
            ...r,
            numero,
            orden: r.orden ?? index + 1
          });
        }
      }
    });

    const radicados = Array.from(mapa.values()).sort((a, b) =>
      Number(a.orden || 0) - Number(b.orden || 0)
    );

    // ⚠️ BLOQUE PEQUEÑO
    const desde = parseInt(event.queryStringParameters?.desde || "0", 10);
    const limite = parseInt(event.queryStringParameters?.limite || "4", 10);

    const radicadosBloque = radicados.slice(desde, desde + limite);

    const resultados = [];
    const errores = [];

    for (const r of radicadosBloque) {
      try {
        const resultado = await consultarProceso(r.numero);

        resultados.push({
          ...r,
          resultado
        });

        // ⚠️ PAUSA ENTRE PROCESOS
        await sleep(700);

      } catch (error) {
        console.log("❌ Error:", r.numero, error.message);

        errores.push({
          ...r,
          error: error.message
        });

        await sleep(1200);
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: true,
        total: radicados.length,
        desde,
        limite,
        procesados: radicadosBloque.length,
        hayMas: desde + limite < radicados.length,
        siguienteDesde: desde + limite,
        resultados,
        errores
      })
    };

  } catch (error) {
    console.error("🔥 ERROR GLOBAL:", error.message);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};