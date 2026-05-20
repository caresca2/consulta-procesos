function formatearFecha(valor) {
  if (!valor) return "";
  const texto = String(valor).trim();
  if (texto.includes("T")) return texto.split("T")[0];
  return texto.length >= 10 ? texto.slice(0, 10) : texto;
}

function parseFechaActuacion(valor) {
  const parte = formatearFecha(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parte)) return null;
  const [y, m, d] = parte.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function hoyColombia() {
  const parte = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bogota"
  });
  const [y, m, d] = parte.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function esActuacionReciente(fechaValor, dias = 8) {
  const fecha = parseFechaActuacion(fechaValor);
  if (!fecha) return false;

  const hoy = hoyColombia();
  const diffDias = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));
  return diffDias >= 0 && diffDias <= dias;
}

function clasesFilaActuacion(claseAlerta, fechaActuacion) {
  const clases = [];
  if (claseAlerta) clases.push(claseAlerta);
  if (esActuacionReciente(fechaActuacion)) clases.push("alerta-reciente");
  return clases.join(" ");
}

document.addEventListener("DOMContentLoaded", () => {
	const consultarButton = document.getElementById("consultarButton");
	const cargarArchivoButton = document.getElementById("cargarArchivoButton");
	const numeroArea = document.getElementById("numeroRadicacion");
	const resultTableBody = document.querySelector("#resultTable tbody");
	const misProcesosBody = document.querySelector("#misProcesosTable tbody");
	const actualizarMisProcesosBtn = document.getElementById("actualizarMisProcesos");
	const filtroClienteInput = document.getElementById("filtroCliente");
	const limpiarFiltroClienteBtn = document.getElementById("limpiarFiltroCliente");
  
	let contador = 1;
	let radicadoEditando = null;
  
	document.querySelectorAll(".tab-button").forEach(button => {
	  button.addEventListener("click", () => {
		document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
		document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
		button.classList.add("active");
		document.getElementById(button.dataset.tab).classList.add("active");
	  });
	});
  
	consultarButton.addEventListener("click", async () => {
	  const numeros = numeroArea.value.trim().split("\n").filter(n => n.trim() !== "");
  
	  if (numeros.length === 0) {
		alert("Por favor, ingresa al menos un número de radicación.");
		return;
	  }
  
	  resultTableBody.innerHTML = "";
	  contador = 1;
  
	  for (const numeroRadicacion of numeros) {
		try {
		  const resultado = await consultarProceso(numeroRadicacion);
		  agregarFilaConsulta({ numero: contador++, ...resultado });
		} catch (error) {
		  console.error(error);
		  alert(`Error al consultar: ${numeroRadicacion}`);
		}
	  }
	});
  
	cargarArchivoButton.addEventListener("change", (event) => {
	  const file = event.target.files[0];
  
	  if (file && file.type === "text/plain") {
		const reader = new FileReader();
		reader.onload = (e) => {
		  numeroArea.value = e.target.result;
		};
		reader.readAsText(file);
	  } else {
		alert("Archivo inválido");
	  }
	});
  
	// Consulta vía Netlify Function para evitar CORS
	async function consultarProceso(numeroRadicacion) {
	  const res = await fetch(`/.netlify/functions/consulta-proceso?numero=${encodeURIComponent(numeroRadicacion)}`);
  
	  if (!res.ok) {
		let msg = "Error consultando proceso";
		try {
		  const error = await res.json();
		  msg = error.error || msg;
		} catch {}
		throw new Error(msg);
	  }
  
	  return res.json();
	}
  
	// Actuaciones completas vía Netlify Function
	async function consultarActuacionesCompletas(numeroRadicacion) {
	  const res = await fetch(`/.netlify/functions/actuaciones-proceso?numero=${encodeURIComponent(numeroRadicacion)}`);
  
	  if (!res.ok) {
		let msg = "Error consultando actuaciones";
		try {
		  const error = await res.json();
		  msg = error.error || msg;
		} catch {}
		throw new Error(msg);
	  }
  
	  return res.json();
	}
  
	function agregarFilaConsulta(data) {
	  const row = document.createElement("tr");
  
	  const link = document.createElement("a");
	  link.href = "#";
	  link.textContent = data.numeroRadicacion;
	  link.addEventListener("click", (e) => {
		e.preventDefault();
		abrirVentanaActuaciones(data.numeroRadicacion);
	  });
  
	  if (esActuacionReciente(data.fechaActuacion)) {
		row.classList.add("alerta-reciente");
	  }

	  row.innerHTML = `
		<td>${data.numero}</td>
		<td></td>
		<td>${data.sujetoProc || ""}</td>
		<td class="celda-fecha">${formatearFecha(data.fechaActuacion)}</td>
		<td>${data.actuacion || ""}</td>
		<td>${data.anotacion || ""}</td>
		<td>${data.fechaInicial || ""}</td>
		<td>${data.fechaFinal || ""}</td>
		<td>${data.fechaRegistro || ""}</td>
	  `;
  
	  row.cells[1].appendChild(link);
	  resultTableBody.appendChild(row);
	}
  
	async function cargarRadicadosGuardados() {
	  const res = await fetch("/.netlify/functions/radicados");
	  if (!res.ok) throw new Error("No se pudieron cargar los radicados");
	  return res.json();
	}
  
	function aplicarFiltroCliente() {
	  const filtro = (filtroClienteInput?.value || "").toLowerCase().trim();
  
	  document.querySelectorAll("#misProcesosTable tbody tr").forEach(tr => {
		const cliente = tr.dataset.cliente || "";
		tr.style.display = cliente.includes(filtro) ? "" : "none";
	  });
	}
	async function actualizarMisProcesos() {
		misProcesosBody.innerHTML = "";
		actualizarMisProcesosBtn.disabled = true;
	  
		let desde = 0;
		const limite = 4;
		let hayMas = true;
		let numero = 1;
	  
		try {
		  while (hayMas) {
			actualizarMisProcesosBtn.textContent = `Consultando procesos ${desde + 1} a ${desde + limite}...`;
	  
			const res = await fetch(`/.netlify/functions/consulta-lote?desde=${desde}&limite=${limite}`);
	  
			if (res.status === 429) {
			  actualizarMisProcesosBtn.textContent = `Bloqueo temporal en proceso ${desde + 1}. Esperando 90 segundos...`;
			  await new Promise(resolve => setTimeout(resolve, 90000));
			  continue;
			}
	  
			if (!res.ok) {
			  const txt = await res.text();
			  throw new Error(txt);
			}
	  
			const data = await res.json();
	  
			(data.resultados || []).forEach(item => {
			  const r = item;
			  const resultado = item.resultado || {};
			  const alerta = clasificarActuacion(resultado.actuacion, resultado.anotacion);
	  
			  const tr = document.createElement("tr");
			  tr.className = clasesFilaActuacion(alerta.claseFila, resultado.fechaActuacion);
			  tr.dataset.cliente = (r.cliente || "").toLowerCase();
	  
			  tr.innerHTML = `
				<td>${r.orden || numero++}</td>
				<td><a href="#" class="ver-actuaciones" data-radicado="${r.numero}">${r.numero}</a></td>
				<td>${r.cliente || ""}</td>
				<td>${r.juzgado || ""}</td>
				<td>${r.tipo || ""}</td>
				<td class="celda-sujetos">${resultado.sujetoProc || ""}</td>
				<td class="celda-fecha">${formatearFecha(resultado.fechaActuacion)}</td>
				<td>${resultado.actuacion || ""} ${alerta.badge}</td>
				<td>${resultado.anotacion || ""}</td>
				<td class="celda-fecha">${formatearFecha(resultado.fechaRegistro)}</td>
			  `;
	  
			  misProcesosBody.appendChild(tr);
			});
	  
			(data.errores || []).forEach(item => {
			  const tr = document.createElement("tr");
			  tr.dataset.cliente = (item.cliente || "").toLowerCase();
	  
			  tr.innerHTML = `
				<td>${item.orden || numero++}</td>
				<td>${item.numero}</td>
				<td>${item.cliente || ""}</td>
				<td>${item.juzgado || ""}</td>
				<td>${item.tipo || ""}</td>
				<td colspan="5">Error consultando: ${item.error}</td>
			  `;
	  
			  misProcesosBody.appendChild(tr);
			});
	  
			aplicarFiltroCliente();
	  
			desde = Number(data.siguienteDesde || desde + limite);
			hayMas = Boolean(data.hayMas);
	  
			await new Promise(resolve => setTimeout(resolve, 2500));
		  }
		} catch (error) {
		  console.error("Error consultando lote:", error);
		  alert("Error consultando lote: " + error.message);
		}
	  
		actualizarMisProcesosBtn.textContent = "Actualizar mis procesos";
		actualizarMisProcesosBtn.disabled = false;
	  }
  
	if (actualizarMisProcesosBtn) {
	  actualizarMisProcesosBtn.addEventListener("click", actualizarMisProcesos);
	}

	async function ejecutarAgenteManual(reset = false) {
	  const ejecutarBtn = document.getElementById("ejecutarAgenteBtn");
	  const reiniciarBtn = document.getElementById("reiniciarAgenteBtn");
	  const status = document.getElementById("agenteStatus");

	  if (reset && !confirm("¿Reiniciar el agente de hoy y volver a consultar todos los procesos?")) {
		return;
	  }

	  if (ejecutarBtn) ejecutarBtn.disabled = true;
	  if (reiniciarBtn) reiniciarBtn.disabled = true;
	  if (status) status.textContent = "Ejecutando agente (un lote)...";

	  const params = new URLSearchParams({ enviar: "1", limite: "4" });
	  if (reset) params.set("reset", "1");

	  try {
		const res = await fetch(`/.netlify/functions/informe-manual?${params}`);
		const data = await res.json();

		if (!res.ok) {
		  if (status) status.textContent = `Error: ${data.error || res.status}`;
		  return;
		}

		if (data.terminado) {
		  if (status) status.textContent = "Agente terminó hoy. Revisa WhatsApp.";
		} else if (data.bloqueado) {
		  if (status) {
			status.textContent = `Bloqueo temporal Rama. Progreso ${data.desde}/${data.total}. Reintenta en 1–2 min.`;
		  }
		} else if (data.ok) {
		  if (status) {
			status.textContent = `Lote OK: ${data.procesados ?? 0}/${data.total ?? "?"} procesos. El cron sigue cada 5 min hasta terminar.`;
		  }
		} else {
		  if (status) status.textContent = data.mensaje || JSON.stringify(data);
		}
	  } catch (error) {
		if (status) status.textContent = `Error: ${error.message}`;
	  } finally {
		if (ejecutarBtn) ejecutarBtn.disabled = false;
		if (reiniciarBtn) reiniciarBtn.disabled = false;
	  }
	}

	const ejecutarAgenteBtn = document.getElementById("ejecutarAgenteBtn");
	const reiniciarAgenteBtn = document.getElementById("reiniciarAgenteBtn");

	if (ejecutarAgenteBtn) {
	  ejecutarAgenteBtn.addEventListener("click", () => ejecutarAgenteManual(false));
	}

	if (reiniciarAgenteBtn) {
	  reiniciarAgenteBtn.addEventListener("click", () => ejecutarAgenteManual(true));
	}
  
	if (filtroClienteInput) {
	  filtroClienteInput.addEventListener("input", aplicarFiltroCliente);
	}
  
	if (limpiarFiltroClienteBtn) {
	  limpiarFiltroClienteBtn.addEventListener("click", () => {
		filtroClienteInput.value = "";
		aplicarFiltroCliente();
	  });
	}
  
	function abrirVentanaActuaciones(numeroRadicacion) {
	  const modal = window.open("", "_blank", "width=900,height=650");
  
	  modal.document.write(`
		<html>
		<head>
		  <title>Actuaciones ${numeroRadicacion}</title>
		</head>
		<body>
		  <h2>Actuaciones: ${numeroRadicacion}</h2>
		  <p>Cargando...</p>
		  <table border="1" cellspacing="0" cellpadding="5">
			<thead>
			  <tr>
				<th>Fecha</th>
				<th>Actuación</th>
				<th>Anotación</th>
				<th>Inicial</th>
				<th>Final</th>
				<th>Registro</th>
			  </tr>
			</thead>
			<tbody id="tabla"></tbody>
		  </table>
		</body>
		</html>
	  `);
  
	  consultarActuacionesCompletas(numeroRadicacion)
		.then(data => {
		  const tbody = modal.document.getElementById("tabla");
		  const p = modal.document.querySelector("p");
		  if (p) p.remove();
  
		  (data.actuaciones || []).forEach(a => {
			const tr = modal.document.createElement("tr");
			tr.innerHTML = `
			  <td>${a.fechaActuacion || ""}</td>
			  <td>${a.actuacion || ""}</td>
			  <td>${a.anotacion || ""}</td>
			  <td>${a.fechaInicial || ""}</td>
			  <td>${a.fechaFinal || ""}</td>
			  <td>${a.fechaRegistro || ""}</td>
			`;
			tbody.appendChild(tr);
		  });
		})
		.catch(error => {
		  modal.document.body.innerHTML += `<p>Error: ${error.message}</p>`;
		});
	}
  
	async function cargarCrudRadicados() {
	  const data = await cargarRadicadosGuardados();
  
	  const tbody = document.getElementById("tablaRadicados");
	  if (!tbody) return;
  
	  tbody.innerHTML = "";
  
	  data.forEach(r => {
		const tr = document.createElement("tr");
  
		tr.innerHTML = `
		  <td>${r.numero}</td>
		  <td>${r.cliente || ""}</td>
		  <td>${r.juzgado || ""}</td>
		  <td>${r.tipo || ""}</td>
		  <td>${r.observaciones || ""}</td>
		  <td>
			<button type="button" class="editar-radicado" data-numero="${r.numero}">
			  Editar
			</button>
			<button type="button" class="eliminar-radicado" data-numero="${r.numero}">
			  Eliminar
			</button>
		  </td>
		`;
  
		tbody.appendChild(tr);
	  });
	}
  
	async function guardarRadicadoCrud() {
	  const data = {
		numero: document.getElementById("crudNumero").value.trim(),
		cliente: document.getElementById("crudCliente").value.trim(),
		juzgado: document.getElementById("crudJuzgado").value.trim(),
		tipo: document.getElementById("crudTipo").value.trim(),
		observaciones: document.getElementById("crudObservaciones").value.trim()
	  };
  
	  if (!data.numero) {
		alert("Ingresa el número de radicado");
		return;
	  }
  
	  const metodo = radicadoEditando ? "PUT" : "POST";
  
	  await fetch("/.netlify/functions/radicados", {
		method: metodo,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data)
	  });
  
	  radicadoEditando = null;
  
	  document.getElementById("crudNumero").value = "";
	  document.getElementById("crudCliente").value = "";
	  document.getElementById("crudJuzgado").value = "";
	  document.getElementById("crudTipo").value = "";
	  document.getElementById("crudObservaciones").value = "";
  
	  const btnGuardar = document.getElementById("guardarRadicado");
	  btnGuardar.textContent = "Guardar radicado";
  
	  await cargarCrudRadicados();
	}
  
	async function editarRadicado(numero) {
	  const data = await cargarRadicadosGuardados();
	  const r = data.find(x => x.numero === numero);
  
	  if (!r) {
		alert("No se encontró el radicado");
		return;
	  }
  
	  document.getElementById("crudNumero").value = r.numero;
	  document.getElementById("crudCliente").value = r.cliente || "";
	  document.getElementById("crudJuzgado").value = r.juzgado || "";
	  document.getElementById("crudTipo").value = r.tipo || "";
	  document.getElementById("crudObservaciones").value = r.observaciones || "";
  
	  radicadoEditando = numero;
  
	  const btnGuardar = document.getElementById("guardarRadicado");
	  btnGuardar.textContent = "Actualizar radicado";
	}
  
	async function eliminarRadicado(numero) {
	  await fetch("/.netlify/functions/radicados", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ numero })
	  });
  
	  await cargarCrudRadicados();
	}
  
	const btnGuardar = document.getElementById("guardarRadicado");
  
	if (btnGuardar) {
	  btnGuardar.addEventListener("click", guardarRadicadoCrud);
	}
  
	document.addEventListener("click", (e) => {
	  if (e.target.classList.contains("ver-actuaciones")) {
		e.preventDefault();
		abrirVentanaActuaciones(e.target.dataset.radicado);
	  }
  
	  if (e.target.classList.contains("eliminar-radicado")) {
		eliminarRadicado(e.target.dataset.numero);
	  }
  
	  if (e.target.classList.contains("editar-radicado")) {
		editarRadicado(e.target.dataset.numero);
	  }
	});
  
	cargarCrudRadicados();
  });
  
  function clasificarActuacion(actuacion = "", anotacion = "") {
	const texto = `${actuacion} ${anotacion}`.toLowerCase();
  
	if (texto.includes("remate")) {
	  return {
		claseFila: "alerta-remate",
		badge: '<span class="badge badge-remate">REMATE</span>'
	  };
	}
  
	if (texto.includes("traslado")) {
	  return {
		claseFila: "alerta-traslado",
		badge: '<span class="badge badge-traslado">TRASLADO</span>'
	  };
	}
  
	if (texto.includes("audiencia")) {
	  return {
		claseFila: "alerta-audiencia",
		badge: '<span class="badge badge-audiencia">AUDIENCIA</span>'
	  };
	}
  
	return {
	  claseFila: "",
	  badge: '<span class="badge badge-normal">NORMAL</span>'
	};
  }