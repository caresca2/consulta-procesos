const { getStore } = require("@netlify/blobs");

// =========================
// UTILIDADES
// =========================

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

// =========================
// FETCH CON RETRY (ANTI 403)
// =========================

async function fetchConRetry(url, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://consultaprocesos.ramajudicial.gov.co/",
        "Origin": "https://consultaprocesos.ramajudicial.gov.co"
      }
    });

    if (res.ok) return res;

    if (res.status === 403) {
      console.log(`⚠️ 403 detectado, reintento ${i + 1}`);
      await sleep(2000 + (i * 1500));
      continue;
    }

    throw new Error(`HTTP ${res.status}`);
  }

  throw new Error("Bloqueado por la Rama (403 persistente)");
}

// =========================
// CONSULTA INDIVIDUAL
// =========================

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
      actuacion: "No encontrado"
    };
  }

  const proceso = procesos[0];

  // pausa entre endpoints
  await sleep(300);

  const urlActuaciones =
    `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;

  const resActuaciones = await fetchConRetry(urlActuaciones);
  const dataActuaciones = await resActuaciones.json();

  const actuaciones = dataActuaciones.actuaciones || [];
  const ultima = actuaciones[0] || {};

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

// =========================
// HANDLER PRINCIPAL
// =========================

exports.handler = async () => {
  try {
    const store = getBlobStore();

    const radicadosOriginales =
      (await store.get("radicados.json", { type: "json" })) || [];

    // =========================
    // LIMPIAR DUPLICADOS + ORDEN
    // =========================

    const mapa = new Map();

    radicadosOriginales.forEach((r, index) => {
      if (r.numero) {
        const numero = r.numero.trim();

        if (!mapa.has(numero)) {
          mapa.set(numero, {
            ...r,
            numero,
            orden: r.orden ?? index + 1
          });
        }
      }
    });

    const radicados = Array.from(mapa.values())
      .sort((a, b) => a.orden - b.orden);

    // =========================
    // CONSULTA EN LOTE
    // =========================

    const resultados = [];
    const errores = [];

    for (const r of radicados) {
      try {
        const resultado = await consultarProceso(r.numero);

        resultados.push({
          ...r,
          resultado
        });

        // pausa entre procesos
        await sleep(900);

      } catch (error) {
        console.log(`❌ Error en ${r.numero}:`, error.message);

        errores.push({
          ...r,
          error: error.message
        });

        // pausa mayor si falla
        await sleep(2000);
      }
    }

    // =========================
    // RESPUESTA
    // =========================

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: true,
        total: radicados.length,
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