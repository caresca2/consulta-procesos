const PDFDocument = require("pdfkit");
const { getStore } = require("@netlify/blobs");
const path = require("path");

function getBlobStore() {
  return getStore({
    name: "procesos-historial",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
  });
}

function generarPDFBuffer(reporte) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 30
    });
    
    const fontPath = path.join(__dirname, "fonts", "Roboto-Regular.ttf");
    doc.registerFont("Roboto", fontPath);

    doc.font("Roboto");
    
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fecha = new Date(reporte.fecha).toLocaleString("es-CO", {
      timeZone: "America/Bogota"
    });

    doc.fontSize(16).text("INFORME COMPLETO DE PROCESOS", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Fecha de generación: ${fecha}`);
    doc.text(`Novedades: ${reporte.novedades?.length || 0}`);
    doc.text(`No consultados: ${reporte.errores?.length || 0}`);
    doc.moveDown();

    const procesos = reporte.novedades || [];

    doc.fontSize(9).text("PROCESOS CON NOVEDAD", { underline: true });
    doc.moveDown(0.5);

    if (procesos.length === 0) {
      doc.text("No se registraron novedades.");
    } else {
      procesos.forEach((p, index) => {
        doc.fontSize(8);
        doc.text(`${index + 1}. Radicado: ${p.numeroRadicacion}`);
        doc.text(`Sujetos: ${p.sujetoProc || "No registrado"}`);
        doc.text(`Fecha actuación: ${p.fechaActuacion || "Sin fecha"}`);
        doc.text(`Actuación: ${p.actuacion || "Sin actuación"}`);
        doc.text(`Anotación: ${p.anotacion || "Sin anotación"}`);
        doc.moveDown(0.5);

        if (doc.y > 500) {
          doc.addPage();
        }
      });
    }

    if (reporte.errores && reporte.errores.length > 0) {
      doc.addPage();
      doc.fontSize(10).text("PROCESOS NO CONSULTADOS", { underline: true });
      doc.moveDown();

      reporte.errores.forEach((e, index) => {
        doc.fontSize(8).text(`${index + 1}. ${e.numeroRadicacion}: ${e.error}`);
      });
    }

    doc.end();
  });
}

exports.handler = async () => {
  try {
    const store = getBlobStore();

    const reporte = await store.get("ultimo-reporte.json", {
      type: "json"
    });

    if (!reporte) {
      return {
        statusCode: 404,
        body: "No existe todavía un reporte generado."
      };
    }

    const pdfBuffer = await generarPDFBuffer(reporte);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=informe-procesos.pdf"
      },
      body: pdfBuffer.toString("base64"),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Error generando PDF: ${error.message}`
    };
  }
};