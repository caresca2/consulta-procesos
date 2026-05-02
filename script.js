document.addEventListener('DOMContentLoaded', () => {

	const consultarButton = document.getElementById('consultarButton');
	const cargarArchivoButton = document.getElementById('cargarArchivoButton');
	const numeroArea = document.getElementById('numeroRadicacion');
	const resultTableBody = document.querySelector('#resultTable tbody');
  
	let contador = 1;
  
	// =========================
	// CONSULTA PROCESOS
	// =========================
  
	consultarButton.addEventListener('click', async () => {
	  const numeros = numeroArea.value.trim().split('\n').filter(n => n.trim() !== '');
  
	  if (numeros.length === 0) {
		alert('Por favor, ingresa al menos un número de radicación.');
		return;
	  }
  
	  resultTableBody.innerHTML = '';
	  contador = 1;
  
	  for (const numeroRadicacion of numeros) {
		try {
		  const respuestaAPI = await realizarConsultaAPI(numeroRadicacion);
		  const procesos = respuestaAPI.procesos || [];
  
		  for (const proceso of procesos) {
			const idProceso = proceso.idProceso;
			const sujetoProc = proceso.sujetosProcesales;
  
			const segundaConsulta = await consultarActuaciones(idProceso);
			const actuaciones = segundaConsulta.actuaciones || [];
  
			if (actuaciones.length > 0) {
			  const act = actuaciones[0];
  
			  agregarFila({
				numero: contador++,
				numeroRadicacion,
				sujetoProc,
				...act
			  });
			}
		  }
  
		} catch (error) {
		  console.error(error);
		  alert(`Error al consultar: ${numeroRadicacion}`);
		}
	  }
	});
  
	// =========================
	// CARGAR TXT
	// =========================
  
	cargarArchivoButton.addEventListener('change', (event) => {
	  const file = event.target.files[0];
  
	  if (file && file.type === 'text/plain') {
		const reader = new FileReader();
  
		reader.onload = (e) => {
		  numeroArea.value = e.target.result;
		};
  
		reader.readAsText(file);
	  } else {
		alert('Archivo inválido');
	  }
	});
  
	// =========================
	// API CONSULTAS
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
  
	// =========================
	// TABLA RESULTADOS
	// =========================
  
	function agregarFila(data) {
	  const row = document.createElement('tr');
  
	  const link = document.createElement('a');
	  link.href = '#';
	  link.textContent = data.numeroRadicacion;
  
	  link.addEventListener('click', () => {
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
	// MODAL ACTUACIONES
	// =========================
  
	function abrirVentanaActuaciones(numeroRadicacion) {
	  const modal = window.open("", "_blank", "width=800,height=600");
  
	  modal.document.write(`
		<h2>Actuaciones: ${numeroRadicacion}</h2>
		<table border="1">
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
	  `);
  
	  realizarConsultaAPI(numeroRadicacion)
		.then(async res => {
		  const tbody = modal.document.getElementById("tabla");
  
		  for (const proceso of res.procesos) {
			const data = await consultarActuaciones(proceso.idProceso);
  
			data.actuaciones.forEach(a => {
			  const tr = modal.document.createElement("tr");
  
			  tr.innerHTML = `
				<td>${a.fechaActuacion}</td>
				<td>${a.actuacion}</td>
				<td>${a.anotacion}</td>
				<td>${a.fechaInicial}</td>
				<td>${a.fechaFinal}</td>
				<td>${a.fechaRegistro}</td>
			  `;
  
			  tbody.appendChild(tr);
			});
		  }
		});
	}
  
	// =========================
	// CRUD RADICADOS
	// =========================
  
	async function cargarCrudRadicados() {
	  const res = await fetch("/.netlify/functions/radicados");
	  const data = await res.json();
  
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
		alert("Ingresa el número");
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
  
	  cargarCrudRadicados();
	}
  
	async function eliminarRadicado(numero) {
	  await fetch("/.netlify/functions/radicados", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ numero })
	  });
  
	  cargarCrudRadicados();
	}
  
	// =========================
	// EVENTOS CRUD
	// =========================
  
	const btnGuardar = document.getElementById("guardarRadicado");
  
	if (btnGuardar) {
	  btnGuardar.addEventListener("click", guardarRadicadoCrud);
	}
  
	document.addEventListener("click", (e) => {
	  if (e.target.classList.contains("eliminar-radicado")) {
		eliminarRadicado(e.target.dataset.numero);
	  }
	});
  
	// cargar al iniciar
	cargarCrudRadicados();
  
  });