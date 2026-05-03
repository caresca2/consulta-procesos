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
      actuacion: "No encontrado"
    };
  }

  const proceso = procesos[0];

  await sleep(200);

  const urlAct =
    `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;

  const dataAct = await fetchRama(urlAct);
  const ultima = (dataAct.actuaciones || [])[0] || {};

  return {
    numeroRadicacion: numero,
    idProceso: proceso.idProceso,
    sujetoProc: proceso.sujetosProcesales || "",
    fechaActuacion: ultima.fechaActuacion || "",
    actuacion: ultima.actuacion || "Sin actuaciones",
    anotacion: ultima.anotacion || "",
    fechaRegistro: ultima.fechaRegistro || ""
  };
}

exports.handler = async (event) => {
  try {
    const store = getBlobStore();

    const radicados =
      (await store.get("radicados.json", { type: "json" })) || [];

    const desde = parseInt(event.queryStringParameters?.desde || "0");
    const limite = parseInt(event.queryStringParameters?.limite || "4");

    const bloque = radicados.slice(desde, desde + limite);

    const resultados = [];
    const errores = [];

    for (const r of bloque) {
      try {
        const resultado = await consultarProceso(r.numero);

        resultados.push({
          ...r,
          resultado
        });

        await sleep(600);

      } catch (error) {

        if (error.code === "BLOQUEO_RAMA_403") {
          return {
            statusCode: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
              ok: false,
              bloqueado: true,
              desde
            })
          };
        }

        errores.push({
          ...r,
          error: error.message
        });

        await sleep(800);
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
        resultados,
        errores,
        siguienteDesde: desde + limite,
        hayMas: desde + limite < radicados.length
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};