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
      await sleep(2000 + i * 1500);
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
      actuacion: "No encontrado"
    };
  }

  const proceso = procesos[0];

  await sleep(350);

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

exports.handler = async () => {
  try {
    const store = getBlobStore();
    const radicados = (await store.get("radicados.json", { type: "json" })) || [];

    const resultados = [];
    const errores = [];

    for (const r of radicados) {
      try {
        const resultado = await consultarProceso(r.numero);

        resultados.push({
          ...r,
          resultado
        });

        await sleep(900);
      } catch (error) {
        errores.push({
          ...r,
          error: error.message
        });

        await sleep(2000);
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
        resultados,
        errores
      })
    };

  } catch (error) {
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