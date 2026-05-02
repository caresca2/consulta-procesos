document.addEventListener("DOMContentLoaded", () => {
	const consultarButton = document.getElementById("consultarButton");
	const cargarArchivoButton = document.getElementById("cargarArchivoButton");
	const numeroArea = document.getElementById("numeroRadicacion");
	const resultTableBody = document.querySelector("#resultTable tbody");
	const misProcesosBody = document.querySelector("#misProcesosTable tbody");
	const actualizarMisProcesosBtn = document.getElementById("actualizarMisProcesos");
  
	let contador = 1;
  
	// =========================
	// PESTAÑAS
	// =========================
  
	document.querySelectorAll(".tab-button").forEach(button => {
	  button.addEventListener("click", () => {
		document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
		document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  
		button.classList.add("active");
		document.getElementById(button.dataset.tab).classList.add("active");
	  });
	});
  
	// =========================
	// CONSULTA MANUAL
	// =========================
  
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
  
		  agregarFilaConsulta({
			numero: contador++,
			...resultado
		  });
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
  
	// =========================
	// API RAMA JUDICIAL
	// =========================
  
	async function realizarConsultaAPI(numeroRadicacion) {
	  const url = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(numeroRadicacion)}&SoloActivos=false&pagina=1`;
	  const res = await fetch(url);
	  if (!res.ok) throw new Error(res.status);
	  return res.json();
	}
  
	async function consultarActuaciones(idProceso) {
	  const url = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${encodeURIComponent(idProceso)}?pagina=1`;
	  const res = await fetch(url);
	  if (!res.ok) throw new Error(res.status);
	  return res.json();
	}
  
	async function consultarProceso(numeroRadicacion) {
	  const respuestaAPI = await realizarConsultaAPI(numeroRadicacion);
	  const procesos = respuestaAPI.procesos || [];
  
	  if (procesos.length === 0) {
		return {
		  numeroRadicacion,
		  sujetoProc: "No encontrado",
		  fechaActuacion: "",
		  actuacion: "No encontrado",
		  anotacion: "",
		  fechaInicial: "",
		  fechaFinal: "",
		  fechaRegistro: ""
		};
	  }
  
	  const proceso = procesos[0];
	  const segundaConsulta = await consultarActuaciones(proceso.idProceso);
	  const actuaciones = segundaConsulta.actuaciones || [];
	  const ultima = actuaciones[0] || {};
  
	  return {
		numeroRadicacion,
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
  
	// =========================
	// TABLA CONSULTA MANUAL
	// =========================
  
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
		<td>${data.sujetoProc}</td>
		<td>${data.fechaActuacion}</td>
		<td>${data.actuacion}</td>
		<td>${data.anotacion}</td>
		<td>${data.fechaInicial}</td>
		<td>${data.fechaFinal}</td>
		<td>${data.fechaRegistro}</td>
	  `;
  
	  row.cells[1].appendChild(link);
	  resultTableBody.appendChild(row);
	}
  
	// =========================
	// MIS PROCESOS
	// =========================
  
	async function cargarRadicadosGuardados() {
	  const res = await fetch("/.netlify/functions/radicados");
	  if (!res.ok) throw new Error("No se pudieron cargar los radicados");
	  return res.json();
	}
  
	async function actualizarMisProcesos() {
	  const radicados = await cargarRadicadosGuardados();
  
	  misProcesosBody.innerHTML = "";
  
	  if (radicados.length === 0) {
		alert("No tienes procesos guardados.");
		return;
	  }
  
	  actualizarMisProcesosBtn.textContent = "Consultando...";
	  actualizarMisProcesosBtn.disabled = true;
  
	  let numero = 1;
  
	  for (const r of radicados) {
		try {
		  const resultado = await consultarProceso(r.numero);
  
		  const tr = document.createElement("tr");
		  const alerta = clasificarActuacion(resultado.actuacion, resultado.anotacion);
		  tr.className = alerta.claseFila;

		  tr.innerHTML = `
			<td>${numero++}</td>
			<td><a href="#" class="ver-actuaciones" data-radicado="${r.numero}">${r.numero}</a></td>
			<td>${r.cliente || ""}</td>
			<td>${r.juzgado || ""}</td>
			<td>${r.tipo || ""}</td>
			<td>${resultado.sujetoProc || ""}</td>
			<td>${resultado.fechaActuacion || ""}</td>
			<td>${alerta.badge}<br>${resultado.actuacion || ""}</td>
			<td>${resultado.anotacion || ""}</td>
			<td>${resultado.fechaRegistro || ""}</td>
		  `;
  
		  misProcesosBody.appendChild(tr);
		} catch (error) {
		  const tr = document.createElement("tr");
		  tr.innerHTML = `
			<td>${numero++}</td>
			<td>${r.numero}</td>
			<td>${r.cliente || ""}</td>
			<td>${r.juzgado || ""}</td>
			<td>${r.tipo || ""}</td>
			<td colspan="5">Error consultando: ${error.message}</td>
		  `;
		  misProcesosBody.appendChild(tr);
		}
	  }
  
	  actualizarMisProcesosBtn.textContent = "Actualizar mis procesos";
	  actualizarMisProcesosBtn.disabled = false;
	}
  
	if (actualizarMisProcesosBtn) {
	  actualizarMisProcesosBtn.addEventListener("click", actualizarMisProcesos);
	}
  
	// =========================
	// MODAL ACTUACIONES
	// =========================
  
	function abrirVentanaActuaciones(numeroRadicacion) {
	  const modal = window.open("", "_blank", "width=900,height=650");
  
	  modal.document.write(`
		<html>
		<head>
		  <title>Actuaciones ${numeroRadicacion}</title>
		</head>
		<body>
		  <h2>Actuaciones: ${numeroRadicacion}</h2>
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
  
	  realizarConsultaAPI(numeroRadicacion)
		.then(async res => {
		  const tbody = modal.document.getElementById("tabla");
  
		  for (const proceso of res.procesos || []) {
			const data = await consultarActuaciones(proceso.idProceso);
  
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
		  }
		})
		.catch(error => {
		  modal.document.body.innerHTML += `<p>Error: ${error.message}</p>`;
		});
	}
  
	document.addEventListener("click", (e) => {
	  if (e.target.classList.contains("ver-actuaciones")) {
		e.preventDefault();
		abrirVentanaActuaciones(e.target.dataset.radicado);
	  }
	});
  
	// =========================
	// GESTOR CRUD
	// =========================
  
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
  
	  await fetch("/.netlify/functions/radicados", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data)
	  });
  
	  document.getElementById("crudNumero").value = "";
	  document.getElementById("crudCliente").value = "";
	  document.getElementById("crudJuzgado").value = "";
	  document.getElementById("crudTipo").value = "";
	  document.getElementById("crudObservaciones").value = "";
  
	  await cargarCrudRadicados();
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
	  if (e.target.classList.contains("eliminar-radicado")) {
		eliminarRadicado(e.target.dataset.numero);
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