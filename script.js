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
  
	  row.innerHTML = `
		<td>${data.numero}</td>
		<td></td>
		<td>${data.sujetoProc || ""}</td>
		<td>${data.fechaActuacion || ""}</td>
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
	  
		actualizarMisProcesosBtn.textContent = "Consultando...";
		actualizarMisProcesosBtn.disabled = true;
	  
		let desde = 0;
		const limite = 8;
		let numero = 1;
		let hayMas = true;
	  
		try {
		  while (hayMas) {
			actualizarMisProcesosBtn.textContent = `Consultando bloque ${desde + 1} a ${desde + limite}...`;
	  
			const res = await fetch(`/.netlify/functions/consulta-lote?desde=${desde}&limite=${limite}`);
	  
			if (!res.ok) {
			  const txt = await res.text();
			  throw new Error(txt);
			}
	  
			const data = await res.json();
	  
			data.resultados.forEach(item => {
			  const r = item;
			  const resultado = item.resultado;
	  
			  const tr = document.createElement("tr");
			  const alerta = clasificarActuacion(resultado.actuacion, resultado.anotacion);
	  
			  tr.className = alerta.claseFila;
			  tr.dataset.cliente = (r.cliente || "").toLowerCase();
	  
			  tr.innerHTML = `
				<td>${r.orden || numero++}</td>
				<td><a href="#" class="ver-actuaciones" data-radicado="${r.numero}">${r.numero}</a></td>
				<td>${r.cliente || ""}</td>
				<td>${r.juzgado || ""}</td>
				<td>${r.tipo || ""}</td>
				<td>${resultado.sujetoProc || ""}</td>
				<td>${resultado.fechaActuacion || ""}</td>
				<td>${resultado.actuacion || ""} ${alerta.badge}</td>
				<td>${resultado.anotacion || ""}</td>
				<td>${resultado.fechaRegistro || ""}</td>
			  `;
	  
			  misProcesosBody.appendChild(tr);
			});
	  
			data.errores.forEach(item => {
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
	  
			hayMas = data.hayMas;
			desde = data.siguienteDesde;
		  }
		} catch (error) {
		  alert("Error consultando lote: " + error.message);
		}
	  
		actualizarMisProcesosBtn.textContent = "Actualizar mis procesos";
		actualizarMisProcesosBtn.disabled = false;
	  }
  
	if (actualizarMisProcesosBtn) {
	  actualizarMisProcesosBtn.addEventListener("click", actualizarMisProcesos);
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