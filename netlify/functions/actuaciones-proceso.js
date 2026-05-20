function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      await sleep(1500 + i * 1000);
      continue;
    }

    throw new Error(`HTTP ${res.status}`);
  }

  throw new Error("Bloqueado por la Rama (403 persistente)");
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    const numero = event.queryStringParameters?.numero?.trim();

    if (!numero) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Falta número de radicado" })
      };
    }

    await sleep(300);

    const urlProceso =
      `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(numero)}&SoloActivos=false&pagina=1`;

    const resProceso = await fetchConRetry(urlProceso);
    const dataProceso = await resProceso.json();
    const procesos = dataProceso.procesos || [];

    if (procesos.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ numeroRadicacion: numero, actuaciones: [] })
      };
    }

    const proceso = procesos[0];

    await sleep(300);

    const urlActuaciones =
      `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;

    const resActuaciones = await fetchConRetry(urlActuaciones);
    const dataActuaciones = await resActuaciones.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        numeroRadicacion: numero,
        idProceso: proceso.idProceso,
        actuaciones: dataActuaciones.actuaciones || []
      })
    };
  } catch (error) {
    console.error("ERROR actuaciones-proceso:", error.message);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
