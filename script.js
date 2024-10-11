document.addEventListener('DOMContentLoaded', () => {
    const consultarButton = document.getElementById('consultarButton');
    const cargarArchivoButton = document.getElementById('cargarArchivoButton');
    const numeroArea = document.getElementById('numeroRadicacion');
    const resultTableBody = document.querySelector('#resultTable tbody');
    let contador = 1;

    consultarButton.addEventListener('click', async () => {
        const numeros = numeroArea.value.trim().split('\n').filter(n => n.trim() !== '');
        if (numeros.length === 0) {
            alert('Por favor, ingresa al menos un número de radicación.');
            return;
        }

        // Limpiar la tabla antes de agregar nuevos datos
        resultTableBody.innerHTML = '';
        contador = 1;

        for (const numeroRadicacion of numeros) {
            try {
                const respuestaAPI = await realizarConsultaAPI(numeroRadicacion);
                const procesos = respuestaAPI.procesos;

                procesos.forEach(async (proceso) => {
                    const idProceso = proceso.idProceso;
                    const sujetoProc = proceso.sujetosProcesales;

                    const segundaConsulta = await construirUrlSegundaConsulta(idProceso);
                    const actuaciones = segundaConsulta.actuaciones;

                    if (actuaciones.length > 0) {
                        const { fechaActuacion, actuacion, anotacion, fechaInicial, fechaFinal, fechaRegistro } = actuaciones[0];
                        agregarFila({
                            numero: contador++,
                            numeroRadicacion,
                            sujetoProc,
                            fechaActuacion,
                            actuacion,
                            anotacion,
                            fechaInicial,
                            fechaFinal,
                            fechaRegistro
                        });
                    }
                });
            } catch (error) {
                console.error('Error al realizar la consulta a la API:', error);
                alert(`Error al consultar el número de radicación: ${numeroRadicacion}`);
            }
        }
    });

    cargarArchivoButton.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && file.type === 'text/plain') {
            const reader = new FileReader();
            reader.onload = (e) => {
                numeroArea.value = e.target.result;
            };
            reader.readAsText(file);
        } else {
            alert('Por favor, selecciona un archivo de texto válido.');
        }
    });

    async function realizarConsultaAPI(numeroRadicacion) {
        const numeroRadicacionP = encodeURIComponent(numeroRadicacion);
        const apiUrl = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion?numero=${numeroRadicacionP}&SoloActivos=false&pagina=1`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

    async function construirUrlSegundaConsulta(idProceso) {
        const idProcesoP = encodeURIComponent(idProceso);
        const apiUrl = `https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/${idProcesoP}?pagina=1`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

	function agregarFila(data) {
	    const row = document.createElement('tr');

	    // Crear hipervínculo para el número de radicación
	    const radicacionLink = document.createElement('a');
	    radicacionLink.href = '#';
	    radicacionLink.textContent = data.numeroRadicacion;
	    radicacionLink.addEventListener('click', () => {
	        abrirVentanaActuaciones(data.numeroRadicacion);
	    });

	    // Crear una fila de tabla con el hipervínculo
	    row.innerHTML = `
	        <td>${data.numero}</td>
	        <td></td> <!-- Aquí irá el hipervínculo del número de radicación -->
	        <td>${data.sujetoProc}</td>
	        <td>${data.fechaActuacion}</td>
	        <td>${data.actuacion}</td>
	        <td>${data.anotacion}</td>
	        <td>${data.fechaInicial}</td>
	        <td>${data.fechaFinal}</td>
	        <td>${data.fechaRegistro}</td>
	    `;
	    
	    // Insertar el hipervínculo en la celda
	    row.cells[1].appendChild(radicacionLink);

	    resultTableBody.appendChild(row);
	}

	function abrirVentanaActuaciones(numeroRadicacion) {
	    // Crear una ventana modal o nueva ventana
	    const modal = window.open("", "_blank", "width=800,height=600");

	    modal.document.write(`
	        <html>
	        <head>
	            <title>Actuaciones para ${numeroRadicacion}</title>
	        </head>
	        <body>
	            <h2>Actuaciones del Número de Radicación: ${numeroRadicacion}</h2>
	            <table border="1">
	                <thead>
	                    <tr>
	                        <th>Fecha Actuación</th>
	                        <th>Actuación</th>
	                        <th>Anotación</th>
	                        <th>Fecha Inicial</th>
	                        <th>Fecha Final</th>
	                        <th>Fecha Registro</th>
	                    </tr>
	                </thead>
	                <tbody id="actuacionesTableBody">
	                    <!-- Aquí se llenarán las actuaciones -->
	                </tbody>
	            </table>
	        </body>
	        </html>
	    `);

	    // Obtener las actuaciones con una nueva consulta
	    realizarConsultaAPI(numeroRadicacion)
	        .then((respuestaAPI) => {
	            const actuacionesTableBody = modal.document.getElementById('actuacionesTableBody');
	            const procesos = respuestaAPI.procesos;

	            procesos.forEach(async (proceso) => {
	                const idProceso = proceso.idProceso;

	                const segundaConsulta = await construirUrlSegundaConsulta(idProceso);
	                const actuaciones = segundaConsulta.actuaciones;

	                actuaciones.forEach((actuacion) => {
	                    const row = modal.document.createElement('tr');
	                    row.innerHTML = `
	                        <td>${actuacion.fechaActuacion}</td>
	                        <td>${actuacion.actuacion}</td>
	                        <td>${actuacion.anotacion}</td>
	                        <td>${actuacion.fechaInicial}</td>
	                        <td>${actuacion.fechaFinal}</td>
	                        <td>${actuacion.fechaRegistro}</td>
	                    `;
	                    actuacionesTableBody.appendChild(row);
	                });
	            });
	        })
	        .catch((error) => {
	            console.error('Error al realizar la consulta a la API:', error);
	            modal.document.write(`<p>Error al obtener las actuaciones para ${numeroRadicacion}</p>`);
	        });
	}
});
