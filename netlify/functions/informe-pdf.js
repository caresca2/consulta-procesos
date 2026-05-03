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

function texto(valor, max = 60) {
  const t = String(valor || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

function generarPDFBuffer(reporte) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 25
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

    const todos = reporte.todos || [];
    const novedades = reporte.novedades || [];
    const errores = reporte.errores || [];

    const novedadesSet = new Set(
      novedades.map(p => p.numeroRadicacion || p.numero)
    );

    const erroresSet = new Set(
      errores.map(e => e.numeroRadicacion || e.numero)
    );

    doc.fontSize(16).text("INFORME COMPLETO DE PROCESOS", { align: "center" });
    doc.moveDown(0.4);

    doc.fontSize(9);
    doc.text(`Fecha de generación: ${fecha}`);
    doc.text(`Procesos consultados: ${todos.length}`);
    doc.text(`Novedades: ${novedades.length}`);
    doc.text(`Sin novedades: ${reporte.sinNovedad || 0}`);
    doc.text(`No consultados: ${errores.length}`);

    doc.moveDown(0.5);

    doc.fontSize(8).text("Convenciones:", { continued: true });
    doc.fillColor("#b00020").text("  Rojo = novedad", { continued: true });
    doc.fillColor("#8a5a00").text("  Amarillo = error/no consultado", { continued: false });
    doc.fillColor("black");

    doc.moveDown(0.6);

    const startX = doc.x;
    let y = doc.y;

    const cols = [
      { title: "No.", w: 28 },
      { title: "Radicado", w: 118 },
      { title: "Cliente", w: 135 },
      { title: "Juzgado", w: 70 },
      { title: "Fecha", w: 62 },
      { title: "Actuación", w: 145 },
      { title: "Anotación", w: 190 },
      { title: "Estado", w: 65 }
    ];

    const rowH = 34;

    function drawHeader() {
      let x = startX;
      doc.rect(startX, y, cols.reduce((s, c) => s + c.w, 0), 20)
        .fill("#eeeeee")
        .stroke();

      doc.fillColor("black").fontSize(7);

      cols.forEach(c => {
        doc.text(c.title, x + 3, y + 6, {
          width: c.w - 6,
          height: 12
        });
        x += c.w;
      });

      y += 20;
    }

    function drawRow(values, estado) {
      if (y + rowH > doc.page.height - 30) {
        doc.addPage();
        y = doc.y;
        drawHeader();
      }

      const totalW = cols.reduce((s, c) => s + c.w, 0);

      let bg = "#ffffff";
      if (estado === "NOVEDAD") bg = "#ffe0e0";
      if (estado === "ERROR") bg = "#fff2cc";

      doc.rect(startX, y, totalW, rowH).fill(bg).stroke("#dddddd");

      let x = startX;
      doc.fillColor("black").fontSize(6.5);

      values.forEach((v, i) => {
        doc.text(v, x + 3, y + 4, {
          width: cols[i].w - 6,
          height: rowH - 8
        });
        x += cols[i].w;
      });

      y += rowH;
    }

    drawHeader();

    todos.forEach((p, index) => {
      const numero = p.numeroRadicacion || p.numero || "";
      const esNovedad = novedadesSet.has(numero);
      const esError = erroresSet.has(numero);

      const estado = esError ? "ERROR" : esNovedad ? "NOVEDAD" : "SIN CAMBIO";

      drawRow([
        String(p.orden || index + 1),
        texto(numero, 30),
        texto(p.cliente || p.sujetoProc || "", 45),
        texto(p.juzgado || "", 22),
        texto(p.fechaActuacion || "", 15),
        texto(p.actuacion || "", 40),
        texto(p.anotacion || "", 58),
        estado
      ], estado);
    });

    errores.forEach((e, index) => {
      const numero = e.numeroRadicacion || e.numero || "";

      if (todos.some(p => (p.numeroRadicacion || p.numero) === numero)) return;

      drawRow([
        String(e.orden || todos.length + index + 1),
        texto(numero, 30),
        texto(e.cliente || "", 45),
        texto(e.juzgado || "", 22),
        "",
        "No consultado",
        texto(e.error || "", 58),
        "ERROR"
      ], "ERROR");
    });

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