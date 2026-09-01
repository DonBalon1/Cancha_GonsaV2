const FILTRO_HISTORICO = "historico";
const LIMITE_JUGADORES_EVOLUCION = 8;
const SELECCION_INICIAL_JUGADORES = 5;
const MIN_PJ_JUGADORES_GRAFICOS = 5;

const MESES_CORTOS = [
	"ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
	"JUL", "AGO", "SEP", "OCT", "NOV", "DIC"
];

const METRICAS_JUGADOR = [
	{ key: "partidosJugados", label: "PJ" },
	{ key: "goles", label: "Goles" },
	{ key: "puntos", label: "Puntos" },
	{ key: "ganados", label: "Victorias" },
	{ key: "perdidos", label: "Derrotas" },
	{ key: "empatados", label: "Empates" },
	{ key: "puntosPorPartido", label: "Puntos por partido", decimals: 2 },
	{ key: "golesPorPartido", label: "Goles por partido", decimals: 2 },
	{ key: "diferenciaGol", label: "Diferencia de gol" }
];

const METRICAS_HISTOGRAMA_JUGADOR = METRICAS_JUGADOR.filter(
	(item) => !["ganados", "perdidos", "empatados"].includes(item.key)
);

const METRICAS_HISTOGRAMA_CLASE_ENTERA = new Set([
	"partidosJugados",
	"goles",
	"puntos",
	"diferenciaGol"
]);

const METRICAS_EVOLUCION = [
	{ key: "golesAcumulados", label: "Goles acumulados" },
	{ key: "puntosAcumulados", label: "Puntos acumulados" },
	{ key: "victoriasAcumuladas", label: "Victorias acumuladas" },
	{ key: "derrotasAcumuladas", label: "Derrotas acumuladas" },
	{ key: "empatesAcumulados", label: "Empates acumulados" },
	{ key: "pjAcumulados", label: "PJ acumulados" },
	{ key: "ranking", label: "Posicion en el ranking" }
];

const METRICAS_PARTIDOS = [
	{ key: "golesTotales", label: "Goles totales del partido" },
	{ key: "diferenciaGol", label: "Diferencia de gol del partido" }
];

const PALETA_LINEAS = [
	"#53b8ff", "#7ce7a2", "#f4c430", "#ff8b7a",
	"#b69bff", "#6ce5d8", "#ff7ec5", "#a8b4d8"
];

const estadoGraficos = {
	filasCrudas: [],
	filasNormalizadas: [],
	aniosDisponibles: [],
	anioActivo: FILTRO_HISTORICO,
	datosAnio: null,
	scatterX: "partidosJugados",
	scatterY: "goles",
	scatterTrend: false,
	highlightJugador: "",
	evolucionMetrica: "golesAcumulados",
	histJugadorMetrica: "goles",
	histPartidoMetrica: "golesTotales",
	jugadoresSeleccionados: new Set(),
	charts: {}
};

function normalizarTexto(valor) {
	return String(valor ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

function normalizarEntero(valor) {
	const numero = Number.parseInt(String(valor ?? "0").trim(), 10);
	return Number.isNaN(numero) ? 0 : numero;
}

function parsearFecha(valor) {
	if (!valor) {
		return new Date(0);
	}
	const partes = String(valor).trim().split("/");
	if (partes.length === 3) {
		const [dia, mes, anio] = partes.map((fragmento) => Number.parseInt(fragmento, 10));
		return new Date(anio, mes - 1, dia);
	}
	const fecha = new Date(valor);
	return Number.isNaN(fecha.getTime()) ? new Date(0) : fecha;
}

function formatearFechaCorta(fecha) {
	if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) {
		return "--";
	}
	const dia = String(fecha.getDate()).padStart(2, "0");
	const mes = String(fecha.getMonth() + 1).padStart(2, "0");
	const anio = String(fecha.getFullYear()).slice(-2);
	return `${dia}/${mes}/${anio}`;
}

function obtenerAnio(fecha) {
	if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) {
		return null;
	}
	return fecha.getFullYear();
}

function formatearNumero(valor, decimales = 0) {
	if (!Number.isFinite(valor)) {
		return "0";
	}
	return decimales > 0 ? valor.toFixed(decimales) : String(Math.round(valor));
}

function normalizarFilaCruda(fila) {
	const fecha = parsearFecha(fila.Fecha || fila.fecha || "");
	return {
		partidoId: String(fila.partido_id || fila.partidoId || fila.Partido || "").trim(),
		fecha,
		anio: obtenerAnio(fecha),
		equipo: String(fila.Equipo || fila.equipo || "").trim(),
		jugador: String(fila.Jugador || fila.jugador || "").trim(),
		resultado: normalizarTexto(fila.Resultado || fila.resultado || ""),
		goles: normalizarEntero(fila.Goles || fila.goles),
		autogoles: normalizarEntero(fila.Autogoles || fila.autogoles),
		puntos: normalizarEntero(fila.Puntos || fila.puntos)
	};
}

function obtenerAniosDisponibles(filas) {
	return Array.from(new Set(filas.map((fila) => fila.anio).filter((anio) => anio !== null)))
		.sort((a, b) => b - a);
}

function compararPorFechaYPartido(a, b) {
	if (a.fecha.getTime() !== b.fecha.getTime()) {
		return a.fecha - b.fecha;
	}
	return normalizarEntero(a.partidoId) - normalizarEntero(b.partidoId);
}

function ordenarJugadoresTabla(lista) {
	return [...lista].sort((a, b) => {
		if (b.puntos !== a.puntos) {
			return b.puntos - a.puntos;
		}
		if (b.puntosPorPartido !== a.puntosPorPartido) {
			return b.puntosPorPartido - a.puntosPorPartido;
		}
		if (b.diferenciaGol !== a.diferenciaGol) {
			return b.diferenciaGol - a.diferenciaGol;
		}
		if (b.goles !== a.goles) {
			return b.goles - a.goles;
		}
		return a.jugador.localeCompare(b.jugador, "es", { sensitivity: "base" });
	});
}

function agregarPosicionPorPuntos(estadisticasOrdenadas) {
	let puntosAnteriores = null;
	let posicionActual = 0;

	return estadisticasOrdenadas.map((jugador) => {
		if (jugador.puntos !== puntosAnteriores) {
			posicionActual += 1;
			puntosAnteriores = jugador.puntos;
		}
		return {
			...jugador,
			posicionTabla: posicionActual
		};
	});
}

function construirPartidosConResumen(filas) {
	const partidosMap = new Map();

	filas.forEach((fila) => {
		if (!fila.partidoId || !fila.jugador) {
			return;
		}

		if (!partidosMap.has(fila.partidoId)) {
			partidosMap.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				rows: [],
				equipos: new Map(),
				totalGoles: 0,
				diferenciaGol: 0
			});
		}

		const partido = partidosMap.get(fila.partidoId);
		partido.rows.push(fila);
		if (!partido.equipos.has(fila.equipo)) {
			partido.equipos.set(fila.equipo, { goles: 0, autogoles: 0 });
		}
		const equipo = partido.equipos.get(fila.equipo);
		equipo.goles += fila.goles;
		equipo.autogoles += fila.autogoles;
	});

	const partidos = Array.from(partidosMap.values()).sort(compararPorFechaYPartido);

	partidos.forEach((partido) => {
		partido.totalGoles = partido.rows.reduce((acc, fila) => acc + fila.goles + fila.autogoles, 0);
		const equipos = Array.from(partido.equipos.entries());

		if (equipos.length >= 2) {
			const [equipoA, equipoB] = equipos;
			const golesA = equipoA[1].goles + equipoB[1].autogoles;
			const golesB = equipoB[1].goles + equipoA[1].autogoles;
			partido.diferenciaGol = Math.abs(golesA - golesB);
		}
	});

	return partidos;
}

function construirEstadisticasJugadores(filas, partidos) {
	const partidosMap = new Map(partidos.map((partido) => [partido.partidoId, partido]));
	const jugadores = new Map();

	filas.forEach((fila) => {
		if (!fila.jugador || !fila.partidoId) {
			return;
		}

		const partido = partidosMap.get(fila.partidoId);
		const equipos = partido ? Array.from(partido.equipos.entries()) : [];
		const actual = equipos.find(([nombreEquipo]) => nombreEquipo === fila.equipo);
		const rival = equipos.find(([nombreEquipo]) => nombreEquipo !== fila.equipo);
		let diferencia = fila.goles;

		if (actual && rival) {
			const golesFavor = actual[1].goles + rival[1].autogoles;
			const golesContra = rival[1].goles + actual[1].autogoles;
			diferencia = golesFavor - golesContra;
		}

		if (!jugadores.has(fila.jugador)) {
			jugadores.set(fila.jugador, {
				jugador: fila.jugador,
				partidosJugados: 0,
				goles: 0,
				puntos: 0,
				ganados: 0,
				empatados: 0,
				perdidos: 0,
				diferenciaGol: 0,
				puntosPorPartido: 0,
				golesPorPartido: 0
			});
		}

		const jugador = jugadores.get(fila.jugador);
		jugador.partidosJugados += 1;
		jugador.goles += fila.goles;
		jugador.puntos += fila.puntos;
		jugador.diferenciaGol += diferencia;

		if (fila.resultado === "ganador") {
			jugador.ganados += 1;
		} else if (fila.resultado === "empate") {
			jugador.empatados += 1;
		} else {
			jugador.perdidos += 1;
		}
	});

	const estadisticas = Array.from(jugadores.values()).map((jugador) => ({
		...jugador,
		puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
		golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0
	}));

	return agregarPosicionPorPuntos(ordenarJugadoresTabla(estadisticas));
}

function calcularDatosAnio(filas) {
	const partidos = construirPartidosConResumen(filas);
	const estadisticasJugadores = construirEstadisticasJugadores(filas, partidos);
	const golesTotales = partidos.reduce((acc, partido) => acc + partido.totalGoles, 0);

	const golesMes = new Array(12).fill(0);
	const partidosMes = new Array(12).fill(0);

	partidos.forEach((partido) => {
		const mes = partido.fecha.getMonth();
		if (mes >= 0 && mes < 12) {
			golesMes[mes] += partido.totalGoles;
			partidosMes[mes] += 1;
		}
	});

	const promedioMes = golesMes.map((goles, idx) => (partidosMes[idx] ? goles / partidosMes[idx] : 0));

	return {
		filas,
		partidos,
		estadisticasJugadores,
		golesTotales,
		golesMes,
		partidosMes,
		promedioMes
	};
}

function filtrarPorAnio(anio) {
	if (anio === FILTRO_HISTORICO) {
		return estadoGraficos.filasNormalizadas;
	}
	return estadoGraficos.filasNormalizadas.filter((fila) => fila.anio === Number(anio));
}

function obtenerMetricaJugador(jugador, key) {
	return Number(jugador?.[key] ?? 0);
}

function obtenerEtiquetaMetrica(lista, key) {
	const item = lista.find((metrica) => metrica.key === key);
	return item ? item.label : key;
}

function destruirChartSiExiste(id) {
	if (estadoGraficos.charts[id]) {
		estadoGraficos.charts[id].destroy();
		estadoGraficos.charts[id] = null;
	}
}

function crearChart(idCanvas, config) {
	destruirChartSiExiste(idCanvas);
	const ctx = document.getElementById(idCanvas);
	if (!ctx) {
		return null;
	}
	const chart = new Chart(ctx, config);
	estadoGraficos.charts[idCanvas] = chart;
	return chart;
}

function inicializarOpcionesSelectores() {
	const scatterX = document.getElementById("js-scatter-x");
	const scatterY = document.getElementById("js-scatter-y");
	const temporal = document.getElementById("js-temporal-variable");
	const histJugador = document.getElementById("js-player-hist-variable");
	const histPartido = document.getElementById("js-match-hist-variable");

	scatterX.innerHTML = METRICAS_JUGADOR.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
	scatterY.innerHTML = METRICAS_JUGADOR.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
	temporal.innerHTML = METRICAS_EVOLUCION.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
	histJugador.innerHTML = METRICAS_HISTOGRAMA_JUGADOR.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
	histPartido.innerHTML = METRICAS_PARTIDOS.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");

	scatterX.value = estadoGraficos.scatterX;
	scatterY.value = estadoGraficos.scatterY;
	temporal.value = estadoGraficos.evolucionMetrica;
	histJugador.value = estadoGraficos.histJugadorMetrica;
	histPartido.value = estadoGraficos.histPartidoMetrica;
}

function filtrarJugadoresMinimosPJ(estadisticasJugadores) {
	return estadisticasJugadores.filter((jugador) => jugador.partidosJugados >= MIN_PJ_JUGADORES_GRAFICOS);
}

function poblarFiltroAnios() {
	const selector = document.getElementById("js-year-filter");
	selector.innerHTML = [
		`<option value="${FILTRO_HISTORICO}">Historico</option>`,
		...estadoGraficos.aniosDisponibles.map((anio) => `<option value="${anio}">${anio}</option>`)
	].join("");
	selector.value = String(estadoGraficos.anioActivo);
}

function actualizarKpis(datosAnio) {
	const jugadores = datosAnio.estadisticasJugadores.length;
	const partidos = datosAnio.partidos.length;
	const goles = datosAnio.golesTotales;
	const promedio = partidos ? goles / partidos : 0;

	document.getElementById("js-kpi-players").textContent = formatearNumero(jugadores);
	document.getElementById("js-kpi-matches").textContent = formatearNumero(partidos);
	document.getElementById("js-kpi-goals").textContent = formatearNumero(goles);
	document.getElementById("js-kpi-goals-rate").textContent = formatearNumero(promedio, 2);
}

function calcularRegresionLineal(puntos) {
	if (puntos.length < 2) {
		return null;
	}

	const n = puntos.length;
	const sumX = puntos.reduce((acc, punto) => acc + punto.x, 0);
	const sumY = puntos.reduce((acc, punto) => acc + punto.y, 0);
	const sumXY = puntos.reduce((acc, punto) => acc + punto.x * punto.y, 0);
	const sumX2 = puntos.reduce((acc, punto) => acc + punto.x * punto.x, 0);

	const denominador = (n * sumX2) - (sumX * sumX);
	if (denominador === 0) {
		return null;
	}

	const pendiente = ((n * sumXY) - (sumX * sumY)) / denominador;
	const ordenada = (sumY - (pendiente * sumX)) / n;
	return { pendiente, ordenada };
}

function renderizarScatter(datosAnio) {
	const metricaX = estadoGraficos.scatterX;
	const metricaY = estadoGraficos.scatterY;
	const etiquetaX = obtenerEtiquetaMetrica(METRICAS_JUGADOR, metricaX);
	const etiquetaY = obtenerEtiquetaMetrica(METRICAS_JUGADOR, metricaY);
	const jugadoresFiltrados = filtrarJugadoresMinimosPJ(datosAnio.estadisticasJugadores);

	const puntos = jugadoresFiltrados.map((jugador) => ({
		x: obtenerMetricaJugador(jugador, metricaX),
		y: obtenerMetricaJugador(jugador, metricaY),
		meta: jugador
	}));

	const datasets = [
		{
			label: "Jugadores",
			data: puntos,
			pointRadius: (contexto) => {
				const jugador = contexto.raw?.meta?.jugador || "";
				return estadoGraficos.highlightJugador && estadoGraficos.highlightJugador === jugador ? 7 : 5;
			},
			pointHoverRadius: 8,
			pointBackgroundColor: (contexto) => {
				const jugador = contexto.raw?.meta?.jugador || "";
				return estadoGraficos.highlightJugador && estadoGraficos.highlightJugador === jugador
					? "#f4c430"
					: "#53b8ff";
			},
			pointBorderColor: "rgba(10, 16, 30, 0.9)",
			pointBorderWidth: 1.5
		}
	];

	if (estadoGraficos.scatterTrend) {
		const regresion = calcularRegresionLineal(puntos);
		if (regresion) {
			const minX = Math.min(...puntos.map((punto) => punto.x));
			const maxX = Math.max(...puntos.map((punto) => punto.x));
			datasets.push({
				type: "line",
				label: "Tendencia",
				data: [
					{ x: minX, y: (regresion.pendiente * minX) + regresion.ordenada },
					{ x: maxX, y: (regresion.pendiente * maxX) + regresion.ordenada }
				],
				pointRadius: 0,
				borderColor: "rgba(255, 255, 255, 0.55)",
				borderDash: [6, 5],
				borderWidth: 1.2
			});
		}
	}

	crearChart("js-chart-scatter", {
		type: "scatter",
		data: { datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: true,
					labels: { color: "#d8e3ff" }
				},
				tooltip: {
					callbacks: {
						title: (items) => items[0]?.raw?.meta?.jugador || "",
						label: (item) => {
							const jugador = item.raw.meta;
							return [
								`${etiquetaX}: ${formatearNumero(item.raw.x, 2)}`,
								`${etiquetaY}: ${formatearNumero(item.raw.y, 2)}`,
								`PJ: ${jugador.partidosJugados}`,
								`Goles: ${jugador.goles}`,
								`Puntos: ${jugador.puntos}`,
								`Goles/partido: ${formatearNumero(jugador.golesPorPartido, 2)}`,
								`Puntos/partido: ${formatearNumero(jugador.puntosPorPartido, 2)}`
							];
						}
					}
				}
			},
			scales: {
				x: {
					title: { display: true, text: etiquetaX, color: "#c9d6f3" },
					ticks: { color: "#aebddd" },
					grid: { color: "rgba(255, 255, 255, 0.08)" }
				},
				y: {
					title: { display: true, text: etiquetaY, color: "#c9d6f3" },
					ticks: { color: "#aebddd" },
					grid: { color: "rgba(255, 255, 255, 0.08)" }
				}
			},
			onClick: (evento, elementos, chart) => {
				const target = chart.getElementsAtEventForMode(evento, "nearest", { intersect: true }, true);
				if (!target.length) {
					estadoGraficos.highlightJugador = "";
					renderizarScatter(datosAnio);
					return;
				}
				const punto = chart.data.datasets[target[0].datasetIndex].data[target[0].index];
				const nombre = punto.meta.jugador;
				estadoGraficos.highlightJugador = estadoGraficos.highlightJugador === nombre ? "" : nombre;
				renderizarScatter(datosAnio);
			}
		}
	});
}

function construirSerieTemporal(datosAnio) {
	const jugadores = datosAnio.estadisticasJugadores.map((jugador) => jugador.jugador);
	const estados = new Map();
	jugadores.forEach((jugador) => {
		estados.set(jugador, {
			jugador,
			pjAcumulados: 0,
			golesAcumulados: 0,
			puntosAcumulados: 0,
			victoriasAcumuladas: 0,
			empatesAcumulados: 0,
			derrotasAcumuladas: 0,
			diferenciaGol: 0,
			puntosPorPartido: 0,
			golesPorPartido: 0,
			ranking: null
		});
	});

	const historial = new Map();
	jugadores.forEach((jugador) => historial.set(jugador, []));

	const labels = [];

	datosAnio.partidos.forEach((partido) => {
		partido.rows.forEach((fila) => {
			const estado = estados.get(fila.jugador);
			if (!estado) {
				return;
			}

			const equipos = Array.from(partido.equipos.entries());
			const actual = equipos.find(([nombreEquipo]) => nombreEquipo === fila.equipo);
			const rival = equipos.find(([nombreEquipo]) => nombreEquipo !== fila.equipo);
			let diferencia = fila.goles;
			if (actual && rival) {
				const golesFavor = actual[1].goles + rival[1].autogoles;
				const golesContra = rival[1].goles + actual[1].autogoles;
				diferencia = golesFavor - golesContra;
			}

			estado.pjAcumulados += 1;
			estado.golesAcumulados += fila.goles;
			estado.puntosAcumulados += fila.puntos;
			estado.diferenciaGol += diferencia;

			if (fila.resultado === "ganador") {
				estado.victoriasAcumuladas += 1;
			} else if (fila.resultado === "empate") {
				estado.empatesAcumulados += 1;
			} else {
				estado.derrotasAcumuladas += 1;
			}

			estado.puntosPorPartido = estado.pjAcumulados ? estado.puntosAcumulados / estado.pjAcumulados : 0;
			estado.golesPorPartido = estado.pjAcumulados ? estado.golesAcumulados / estado.pjAcumulados : 0;
		});

		const rankingActual = agregarPosicionPorPuntos(
			ordenarJugadoresTabla(
				Array.from(estados.values()).map((estado) => ({
					jugador: estado.jugador,
					partidosJugados: estado.pjAcumulados,
					goles: estado.golesAcumulados,
					puntos: estado.puntosAcumulados,
					ganados: estado.victoriasAcumuladas,
					empatados: estado.empatesAcumuladas,
					perdidos: estado.derrotasAcumuladas,
					diferenciaGol: estado.diferenciaGol,
					puntosPorPartido: estado.puntosPorPartido,
					golesPorPartido: estado.golesPorPartido
				}))
			)
		);

		rankingActual.forEach((jugadorRank) => {
			const estado = estados.get(jugadorRank.jugador);
			if (estado) {
				estado.ranking = jugadorRank.posicionTabla;
			}
		});

		jugadores.forEach((jugador) => {
			historial.get(jugador).push({ ...estados.get(jugador) });
		});

		labels.push(`#${partido.partidoId} ${formatearFechaCorta(partido.fecha)}`);
	});

	return { labels, historial };
}

function asegurarSeleccionJugadores(datosAnio) {
	const jugadoresDisponibles = filtrarJugadoresMinimosPJ(datosAnio.estadisticasJugadores);
	const todos = jugadoresDisponibles.map((jugador) => jugador.jugador);
	const seleccionActual = Array.from(estadoGraficos.jugadoresSeleccionados).filter((jugador) => todos.includes(jugador));
	const siguienteSeleccion = new Set(seleccionActual);

	if (siguienteSeleccion.size === 0) {
		jugadoresDisponibles
			.slice(0, SELECCION_INICIAL_JUGADORES)
			.forEach((jugador) => siguienteSeleccion.add(jugador.jugador));
	}

	estadoGraficos.jugadoresSeleccionados = siguienteSeleccion;
}

function renderizarSelectorJugadores(datosAnio) {
	const contenedor = document.getElementById("js-player-picker-list");
	const hint = document.getElementById("js-player-limit");
	const seleccionados = estadoGraficos.jugadoresSeleccionados;
	const jugadoresDisponibles = filtrarJugadoresMinimosPJ(datosAnio.estadisticasJugadores);

	if (!jugadoresDisponibles.length) {
		contenedor.innerHTML = `
			<div class="empty-state">
				<strong>Sin jugadores elegibles</strong>
				Se requieren ${MIN_PJ_JUGADORES_GRAFICOS}+ PJ para aparecer en evolucion temporal.
			</div>
		`;
		hint.textContent = `Seleccionados: 0. Filtro activo: ${MIN_PJ_JUGADORES_GRAFICOS}+ PJ.`;
		return;
	}

	contenedor.innerHTML = jugadoresDisponibles.map((jugador) => {
		const activo = seleccionados.has(jugador.jugador);
		return `
			<label class="player-picker__item">
				<input type="checkbox" data-player="${jugador.jugador}" ${activo ? "checked" : ""}>
				<span>${jugador.jugador}</span>
			</label>
		`;
	}).join("");

	hint.textContent = seleccionados.size > LIMITE_JUGADORES_EVOLUCION
		? `Seleccionados: ${seleccionados.size}. Recomendado: hasta ${LIMITE_JUGADORES_EVOLUCION} para mejor legibilidad.`
		: `Seleccionados: ${seleccionados.size}. Recomendado: hasta ${LIMITE_JUGADORES_EVOLUCION}.`;

	contenedor.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
		checkbox.addEventListener("change", (evento) => {
			const nombre = evento.target.getAttribute("data-player");
			if (!nombre) {
				return;
			}
			if (evento.target.checked) {
				estadoGraficos.jugadoresSeleccionados.add(nombre);
			} else {
				estadoGraficos.jugadoresSeleccionados.delete(nombre);
			}

			renderizarSelectorJugadores(datosAnio);
			renderizarEvolucion(datosAnio);
		});
	});
}

function renderizarEvolucion(datosAnio) {
	const metrica = estadoGraficos.evolucionMetrica;
	const etiqueta = obtenerEtiquetaMetrica(METRICAS_EVOLUCION, metrica);
	const serie = construirSerieTemporal(datosAnio);

	const seleccionados = Array.from(estadoGraficos.jugadoresSeleccionados);
	const datasets = seleccionados.map((jugador, indice) => {
		const color = PALETA_LINEAS[indice % PALETA_LINEAS.length];
		const puntos = serie.historial.get(jugador) || [];
		const data = puntos.map((estado) => Number(estado[metrica] ?? 0));
		return {
			label: jugador,
			data,
			borderColor: color,
			backgroundColor: `${color}33`,
			pointRadius: 2,
			pointHoverRadius: 5,
			tension: 0.25,
			borderWidth: 2
		};
	});

	crearChart("js-chart-temporal", {
		type: "line",
		data: {
			labels: serie.labels,
			datasets
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: "nearest",
				intersect: false
			},
			plugins: {
				legend: {
					labels: { color: "#d8e3ff" }
				},
				tooltip: {
					callbacks: {
						title: (items) => items[0]?.label || "",
						label: (item) => `${item.dataset.label}: ${formatearNumero(item.parsed.y, metrica === "ranking" ? 0 : 2)}`
					}
				}
			},
			scales: {
				x: {
					ticks: {
						color: "#aebddd",
						maxRotation: 60,
						minRotation: 60
					},
					grid: { color: "rgba(255, 255, 255, 0.08)" }
				},
				y: {
					title: { display: true, text: etiqueta, color: "#c9d6f3" },
					ticks: {
						color: "#aebddd",
						precision: 0
					},
					reverse: metrica === "ranking",
					grid: { color: "rgba(255, 255, 255, 0.08)" }
				}
			}
		}
	});
}

function renderizarTorneoMensual(datosAnio) {
	crearChart("js-chart-goals-month", {
		type: "bar",
		data: {
			labels: MESES_CORTOS,
			datasets: [{
				label: "Goles",
				data: datosAnio.golesMes,
				backgroundColor: "rgba(83, 184, 255, 0.7)",
				borderColor: "rgba(83, 184, 255, 1)",
				borderWidth: 1
			}]
		},
		options: opcionesBarraBase("Goles")
	});

	crearChart("js-chart-matches-month", {
		type: "bar",
		data: {
			labels: MESES_CORTOS,
			datasets: [{
				label: "Partidos",
				data: datosAnio.partidosMes,
				backgroundColor: "rgba(124, 231, 162, 0.68)",
				borderColor: "rgba(124, 231, 162, 1)",
				borderWidth: 1
			}]
		},
		options: opcionesBarraBase("Partidos")
	});

	crearChart("js-chart-goals-rate-month", {
		type: "bar",
		data: {
			labels: MESES_CORTOS,
			datasets: [{
				label: "Goles por partido",
				data: datosAnio.promedioMes,
				backgroundColor: "rgba(244, 196, 48, 0.68)",
				borderColor: "rgba(244, 196, 48, 1)",
				borderWidth: 1
			}]
		},
		options: {
			...opcionesBarraBase("Promedio"),
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					callbacks: {
						label: (item) => `${formatearNumero(item.parsed.y, 2)} goles/partido`
					}
				}
			}
		}
	});
}

function opcionesBarraBase(etiquetaY) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: false
			}
		},
		scales: {
			x: {
				ticks: { color: "#aebddd" },
				grid: { color: "rgba(255, 255, 255, 0.06)" }
			},
			y: {
				beginAtZero: true,
				title: { display: true, text: etiquetaY, color: "#c9d6f3" },
				ticks: { color: "#aebddd" },
				grid: { color: "rgba(255, 255, 255, 0.08)" }
			}
		}
	};
}

function calcularHistograma(valores, { integerMode = false, integerClassLimits = false } = {}) {
	const limpios = valores.filter((valor) => Number.isFinite(valor));
	if (!limpios.length) {
		return { labels: [], counts: [] };
	}

	const minimo = Math.min(...limpios);
	const maximo = Math.max(...limpios);

	if (integerMode && Number.isInteger(minimo) && Number.isInteger(maximo) && (maximo - minimo) <= 14) {
		const labels = [];
		const counts = [];
		for (let valor = minimo; valor <= maximo; valor += 1) {
			labels.push(String(valor));
			counts.push(limpios.filter((numero) => numero === valor).length);
		}
		return { labels, counts };
	}

	const binsBase = Math.round(Math.sqrt(limpios.length) * 1.35);
	const bins = Math.max(7, Math.min(18, binsBase));
	const rango = maximo - minimo || 1;
	const ancho = rango / bins;
	const counts = new Array(bins).fill(0);
	const labels = [];

	for (let i = 0; i < bins; i += 1) {
		const inicio = minimo + (ancho * i);
		const fin = i === bins - 1 ? maximo : minimo + (ancho * (i + 1));
		const decimales = integerClassLimits ? 0 : 1;
		labels.push(`${formatearNumero(inicio, decimales)}-${formatearNumero(fin, decimales)}`);
	}

	limpios.forEach((valor) => {
		const indice = Math.min(bins - 1, Math.floor((valor - minimo) / ancho));
		counts[indice] += 1;
	});

	return { labels, counts };
}

function renderizarHistogramas(datosAnio) {
	const metricaJugadores = estadoGraficos.histJugadorMetrica;
	const metricaPartidos = estadoGraficos.histPartidoMetrica;
	const jugadoresFiltrados = filtrarJugadoresMinimosPJ(datosAnio.estadisticasJugadores);
	const usarClaseEntera = METRICAS_HISTOGRAMA_CLASE_ENTERA.has(metricaJugadores);

	const valoresJugadores = jugadoresFiltrados.map((jugador) => obtenerMetricaJugador(jugador, metricaJugadores));
	const histJugadores = calcularHistograma(valoresJugadores, {
		integerMode: usarClaseEntera,
		integerClassLimits: usarClaseEntera
	});

	const valoresPartidos = datosAnio.partidos.map((partido) => {
		if (metricaPartidos === "diferenciaGol") {
			return partido.diferenciaGol;
		}
		return partido.totalGoles;
	});
	const histPartidos = calcularHistograma(valoresPartidos, {
		integerMode: true,
		integerClassLimits: true
	});

	crearChart("js-chart-player-hist", {
		type: "bar",
		data: {
			labels: histJugadores.labels,
			datasets: [{
				label: "Jugadores",
				data: histJugadores.counts,
				backgroundColor: "rgba(83, 184, 255, 0.68)",
				borderColor: "rgba(83, 184, 255, 1)",
				borderWidth: 1
			}]
		},
		options: {
			...opcionesBarraBase("Cantidad de jugadores"),
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					callbacks: {
						label: (item) => `${item.parsed.y} jugadores`
					}
				}
			}
		}
	});

	crearChart("js-chart-match-hist", {
		type: "bar",
		data: {
			labels: histPartidos.labels,
			datasets: [{
				label: "Partidos",
				data: histPartidos.counts,
				backgroundColor: "rgba(244, 196, 48, 0.68)",
				borderColor: "rgba(244, 196, 48, 1)",
				borderWidth: 1
			}]
		},
		options: {
			...opcionesBarraBase("Cantidad de partidos"),
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					callbacks: {
						label: (item) => `${item.parsed.y} partidos`
					}
				}
			}
		}
	});
}

function renderizarTodo() {
	const filas = filtrarPorAnio(estadoGraficos.anioActivo);
	const emptyState = document.getElementById("js-empty-state");

	if (!filas.length) {
		emptyState.style.display = "block";
		return;
	}

	emptyState.style.display = "none";
	const datosAnio = calcularDatosAnio(filas);
	estadoGraficos.datosAnio = datosAnio;

	actualizarKpis(datosAnio);
	asegurarSeleccionJugadores(datosAnio);
	renderizarSelectorJugadores(datosAnio);
	renderizarScatter(datosAnio);
	renderizarEvolucion(datosAnio);
	renderizarTorneoMensual(datosAnio);
	renderizarHistogramas(datosAnio);
}

function seleccionarTopJugadores() {
	if (!estadoGraficos.datosAnio) {
		return;
	}
	const top = filtrarJugadoresMinimosPJ(estadoGraficos.datosAnio.estadisticasJugadores)
		.slice(0, SELECCION_INICIAL_JUGADORES)
		.map((jugador) => jugador.jugador);
	estadoGraficos.jugadoresSeleccionados = new Set(top);
	renderizarSelectorJugadores(estadoGraficos.datosAnio);
	renderizarEvolucion(estadoGraficos.datosAnio);
}

function seleccionarTodosJugadores() {
	if (!estadoGraficos.datosAnio) {
		return;
	}
	const todos = filtrarJugadoresMinimosPJ(estadoGraficos.datosAnio.estadisticasJugadores)
		.map((jugador) => jugador.jugador);
	estadoGraficos.jugadoresSeleccionados = new Set(todos);
	renderizarSelectorJugadores(estadoGraficos.datosAnio);
	renderizarEvolucion(estadoGraficos.datosAnio);
}

function limpiarSeleccionJugadores() {
	estadoGraficos.jugadoresSeleccionados = new Set();
	if (estadoGraficos.datosAnio) {
		asegurarSeleccionJugadores(estadoGraficos.datosAnio);
		renderizarSelectorJugadores(estadoGraficos.datosAnio);
		renderizarEvolucion(estadoGraficos.datosAnio);
	}
}

function configurarEventos() {
	document.getElementById("js-year-filter").addEventListener("change", (evento) => {
		estadoGraficos.anioActivo = evento.target.value === FILTRO_HISTORICO
			? FILTRO_HISTORICO
			: Number(evento.target.value);
		estadoGraficos.highlightJugador = "";
		renderizarTodo();
	});

	document.getElementById("js-scatter-x").addEventListener("change", (evento) => {
		estadoGraficos.scatterX = evento.target.value;
		renderizarScatter(estadoGraficos.datosAnio);
	});

	document.getElementById("js-scatter-y").addEventListener("change", (evento) => {
		estadoGraficos.scatterY = evento.target.value;
		renderizarScatter(estadoGraficos.datosAnio);
	});

	document.getElementById("js-scatter-trend").addEventListener("change", (evento) => {
		estadoGraficos.scatterTrend = Boolean(evento.target.checked);
		renderizarScatter(estadoGraficos.datosAnio);
	});

	document.getElementById("js-temporal-variable").addEventListener("change", (evento) => {
		estadoGraficos.evolucionMetrica = evento.target.value;
		renderizarEvolucion(estadoGraficos.datosAnio);
	});

	document.getElementById("js-player-hist-variable").addEventListener("change", (evento) => {
		estadoGraficos.histJugadorMetrica = evento.target.value;
		renderizarHistogramas(estadoGraficos.datosAnio);
	});

	document.getElementById("js-match-hist-variable").addEventListener("change", (evento) => {
		estadoGraficos.histPartidoMetrica = evento.target.value;
		renderizarHistogramas(estadoGraficos.datosAnio);
	});

	document.getElementById("js-select-top").addEventListener("click", seleccionarTopJugadores);
	document.getElementById("js-select-all").addEventListener("click", seleccionarTodosJugadores);
	document.getElementById("js-clear-selection").addEventListener("click", limpiarSeleccionJugadores);
}

async function inicializarGraficos() {
	if (!window.lectorDatos || typeof window.lectorDatos.obtenerFilasPartidos !== "function") {
		throw new Error("No se encontro el lector de datos.");
	}

	const filasCrudas = await window.lectorDatos.obtenerFilasPartidos();
	const filasNormalizadas = filasCrudas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador && fila.anio !== null);

	estadoGraficos.filasCrudas = filasCrudas;
	estadoGraficos.filasNormalizadas = filasNormalizadas;
	estadoGraficos.aniosDisponibles = obtenerAniosDisponibles(filasNormalizadas);
	estadoGraficos.anioActivo = FILTRO_HISTORICO;

	poblarFiltroAnios();
	inicializarOpcionesSelectores();
	configurarEventos();
	renderizarTodo();
}

if (typeof document !== "undefined") {
	document.addEventListener("DOMContentLoaded", () => {
		Chart.defaults.color = "#d8e3ff";
		Chart.defaults.borderColor = "rgba(255, 255, 255, 0.08)";

		inicializarGraficos().catch((error) => {
			console.error(error);
			const contenedor = document.getElementById("js-empty-state");
			if (contenedor) {
				contenedor.style.display = "block";
				contenedor.innerHTML = `
					<div class="empty-state">
						<strong>No se pudieron cargar los graficos</strong>
						Revise la conexion o la fuente de datos para continuar.
					</div>
				`;
			}
		});
	});
}
