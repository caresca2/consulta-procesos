exports.handler = async (event) => {
    try {
      const numero = event.queryStringParameters.numero;
  
      if (!numero) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Falta número de radicado" })
        };
      }
  
      const urlProceso = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(numero)}&SoloActivos=false&pagina=1`;
  
      const resProceso = await fetch(urlProceso);
      if (!resProceso.ok) {
        throw new Error(`Error consulta proceso: ${resProceso.status}`);
      }
  
      const dataProceso = await resProceso.json();
      const procesos = dataProceso.procesos || [];
  
      if (procesos.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            numeroRadicacion: numero,
            sujetoProc: "No encontrado",
            actuacion: "No encontrado"
          })
        };
      }
  
      const proceso = procesos[0];
  
      const urlActuaciones = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(proceso.idProceso)}?pagina=1`;
  
      const resActuaciones = await fetch(urlActuaciones);
      if (!resActuaciones.ok) {
        throw new Error(`Error actuaciones: ${resActuaciones.status}`);
      }
  
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
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: error.message })
      };
    }
  };