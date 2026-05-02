const { getStore } = require("@netlify/blobs");

function store() {
  return getStore({
    name: "procesos-historial",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
  });
}

exports.handler = async (event) => {
  const s = store();
  const key = "radicados.json";

  let radicados = [];
  try {
    radicados = (await s.get(key, { type: "json" })) || [];
  } catch {}

  const method = event.httpMethod;

  if (method === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify(radicados)
    };
  }

  const body = event.body ? JSON.parse(event.body) : {};

  if (method === "POST") {
    const nuevo = {
      numero: body.numero,
      cliente: body.cliente || "",
      juzgado: body.juzgado || "",
      tipo: body.tipo || "",
      observaciones: body.observaciones || ""
    };

    if (!nuevo.numero) {
      return { statusCode: 400, body: "Falta número de radicado" };
    }

    const existe = radicados.some(r => r.numero === nuevo.numero);
    if (!existe) radicados.push(nuevo);

    await s.setJSON(key, radicados);
    return { statusCode: 200, body: JSON.stringify(radicados) };
  }

  if (method === "PUT") {
    radicados = radicados.map(r =>
      r.numero === body.numero ? { ...r, ...body } : r
    );

    await s.setJSON(key, radicados);
    return { statusCode: 200, body: JSON.stringify(radicados) };
  }

  if (method === "DELETE") {
    radicados = radicados.filter(r => r.numero !== body.numero);

    await s.setJSON(key, radicados);
    return { statusCode: 200, body: JSON.stringify(radicados) };
  }

  return { statusCode: 405, body: "Método no permitido" };
};