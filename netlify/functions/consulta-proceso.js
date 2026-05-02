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
        console.log(`⚠️ 403 detectado, reintento ${i + 1}`);
        await sleep(1500 + (i * 1000)); // espera progresiva
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    }
  
    throw new Error("Bloqueado por la Rama (403 persistente)");
  }
  
  exports.handler = async (event) => {
    try {
      const numero = event.queryStringParameters.numero;
  
      if (!numero) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Falta número de radicado" })
        };
      }
  
      // 🔹 PAUSA base para evitar bloqueo
      await sleep(300);
  
      const urlProceso = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(numero)}&SoloActivos=false&pagina=1`;
  
      const resProceso = await fetchConRetry(urlProceso);
      const dataProceso = await resProceso.json();
      const procesos = dataProceso.procesos || [];
  
      if (procesos.length === 0) {
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            numeroRadicacion: numero,
            sujetoProc: "No encontrado",
            actuacion: "No encontrado"
          })
        };
      }
  
      const proceso = procesos[0];
  
      // 🔹 pequeña pausa entre endpoints
      await sleep(300);
  
      const urlActuaciones = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;
  
      const resActuaciones = await fetchConRetry(urlActuaciones);
      const dataActuaciones = await resActuaciones.json();
  
      const actuaciones = dataActuaciones.actuaciones || [];
      const ultima = actuaciones[0] || {};
  
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          numeroRadicacion: numero,
          idProceso: proceso.idProceso,
          sujetoProc: proceso.sujetosProcesales || "",
          fechaActuacion: ultima.fechaActuacion || "",
          actuacion: ultima.actuacion || "Sin actuaciones",
          anotacion: ultima.anotacion || "",
          fechaInicial: ultima.fechaInicial || "",
          fechaFinal: ultima.fechaFinal || "",
          fechaRegistro: ultima.fechaRegistro || ""
        })
      };
  
    } catch (error) {
      console.error("ERROR:", error.message);
  
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: error.message
        })
      };
    }
  };