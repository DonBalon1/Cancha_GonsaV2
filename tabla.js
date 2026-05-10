function formatearFechaActualizacion() {
	return new Intl.DateTimeFormat("es-AR", {
		dateStyle: "short",
		timeStyle: "short"
	}).format(new Date());
}

const MAX_PARTIDOS_RECIENTES = 5;
const TOTAL_COLUMNAS_TABLA = 15;
const FILTRO_MIN_PARTIDOS_DEFAULT = 3;

const estadoTablaGeneral = {
	filasCrudas: [],
	aniosDisponibles: [],
	filtros: {
		anio: "historico",
		minPartidos: FILTRO_MIN_PARTIDOS_DEFAULT
	}
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

function formatearDecimal(valor) {
	return Number(valor || 0).toFixed(1);
}

function formatearPorcentaje(valor) {
	return `${Math.round(valor || 0)}%`;
}

function obtenerAnioFecha(fecha) {
	if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) {
		return null;
	}
	return fecha.getFullYear();
}

function obtenerClasePorcentajeCuartil(valor) {
	if (valor < 25) {
		return "metric-bad";
	}
	if (valor < 50) {
		return "metric-warn";
	}
	if (valor < 75) {
		return "metric-good-soft";
	}
	return "metric-very-good";
}

function obtenerClaseMetricas(valor, { good, mid }) {
	if (valor >= good) {
		return "metric-good";
	}
	if (valor >= mid) {
		return "metric-mid";
	}
	return "metric-bad";
}

function escaparHtml(valor) {
	return String(valor ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function normalizarFilaCruda(fila) {
	return {
		partidoId: String(fila.partido_id || fila.partidoId || fila.Partido || "").trim(),
		fechaTexto: String(fila.Fecha || fila.fecha || "").trim(),
		fecha: parsearFecha(fila.Fecha || fila.fecha || ""),
		equipo: String(fila.Equipo || fila.equipo || "").trim(),
		jugador: String(fila.Jugador || fila.jugador || "").trim(),
		resultado: String(fila.Resultado || fila.resultado || "").trim(),
		goles: normalizarEntero(fila.Goles || fila.goles),
		autogoles: normalizarEntero(fila.Autogoles || fila.autogoles),
		puntos: normalizarEntero(fila.Puntos || fila.puntos)
	};
}

function actualizarEstadoInterfaz({ mensaje, totalJugadores = "--", totalPartidos = "--", totalRegistros = "--" }) {
	const status = document.getElementById("js-status");
	const totalJugadoresElement = document.getElementById("js-total-jugadores");
	const totalPartidosElement = document.getElementById("js-total-partidos");
	const totalRegistrosElement = document.getElementById("js-mobile-registros");
	const lastUpdateElement = document.getElementById("js-last-update");

	if (status) {
		status.textContent = mensaje;
	}
	if (totalJugadoresElement) {
		totalJugadoresElement.textContent = totalJugadores;
	}
	if (totalPartidosElement) {
		totalPartidosElement.textContent = totalPartidos;
	}
	if (totalRegistrosElement) {
		totalRegistrosElement.textContent = totalRegistros;
	}
	if (lastUpdateElement) {
		lastUpdateElement.textContent = `Actualizado: ${formatearFechaActualizacion()}`;
	}
}

function renderizarEstadoInicial(texto, detalle) {
	const cuerpoTabla = document.getElementById("js-tabla-general-body");

	if (cuerpoTabla) {
		cuerpoTabla.innerHTML = `
			<tr>
				<td class="empty-state" colspan="${TOTAL_COLUMNAS_TABLA}">
					<strong>${texto}</strong>
					${detalle}
				</td>
			</tr>
		`;
	}
}

function obtenerAniosDisponibles(filasNormalizadas) {
	return Array.from(
		new Set(
			filasNormalizadas
				.map((fila) => obtenerAnioFecha(fila.fecha))
				.filter((anio) => anio !== null)
		)
	).sort((actual, siguiente) => siguiente - actual);
}

function poblarFiltroAnios(aniosDisponibles) {
	const selector = document.getElementById("js-filter-year");
	if (!selector) {
		return;
	}

	selector.innerHTML = [
		'<option value="historico">Histórico</option>',
		...aniosDisponibles.map((anio) => `<option value="${anio}">${anio}</option>`)
	].join("");

	selector.value = String(estadoTablaGeneral.filtros.anio);
}

function actualizarResumenFiltros() {
	const anioActivo = document.getElementById("js-active-year");
	const minPartidosActivo = document.getElementById("js-active-min-matches");

	if (anioActivo) {
		anioActivo.textContent = estadoTablaGeneral.filtros.anio === "historico"
			? "Histórico"
			: String(estadoTablaGeneral.filtros.anio);
	}

	if (minPartidosActivo) {
		minPartidosActivo.textContent = `${estadoTablaGeneral.filtros.minPartidos}+`;
	}
}

function filtrarFilasPorAnio(filasNormalizadas, anio) {
	if (anio === "historico") {
		return filasNormalizadas;
	}

	return filasNormalizadas.filter((fila) => obtenerAnioFecha(fila.fecha) === Number(anio));
}

function aplicarFiltrosYRenderizar() {
	const filasFiltradasPorAnio = filtrarFilasPorAnio(
		estadoTablaGeneral.filasCrudas,
		estadoTablaGeneral.filtros.anio
	);

	if (filasFiltradasPorAnio.length === 0) {
		actualizarResumenFiltros();
		renderizarEstadoInicial(
			"No hay partidos para ese filtro",
			"Probá con otro año o bajá el mínimo de partidos jugados."
		);
		return;
	}

	const partidosMap = construirResumenPartidos(filasFiltradasPorAnio);
	const estadisticasJugadores = construirEstadisticasJugadores(filasFiltradasPorAnio, partidosMap)
		.filter((jugador) => jugador.partidosJugados >= estadoTablaGeneral.filtros.minPartidos);

	window.__TORNEO_STATS__ = estadisticasJugadores;
	actualizarResumenFiltros();
	renderizarFilasTabla(estadisticasJugadores);
}

function configurarEventosFiltros() {
	const selectorAnio = document.getElementById("js-filter-year");
	const selectorMinPartidos = document.getElementById("js-filter-min-matches");

	if (selectorAnio) {
		selectorAnio.addEventListener("change", (event) => {
			estadoTablaGeneral.filtros.anio = event.target.value === "historico"
				? "historico"
				: Number(event.target.value);
			aplicarFiltrosYRenderizar();
		});
	}

	if (selectorMinPartidos) {
		selectorMinPartidos.value = String(estadoTablaGeneral.filtros.minPartidos);
		selectorMinPartidos.addEventListener("change", (event) => {
			estadoTablaGeneral.filtros.minPartidos = normalizarEntero(event.target.value);
			aplicarFiltrosYRenderizar();
		});
	}
}

function obtenerCantidadPartidos(filas) {
	return new Set(
		filas
			.map((fila) => fila.partido_id || fila.Partido || fila.partido || "")
			.filter(Boolean)
	).size;
}

function obtenerCantidadJugadores(filas) {
	return new Set(
		filas
			.map((fila) => fila.Jugador || fila.jugador || "")
			.filter(Boolean)
	).size;
}

function construirResumenPartidos(filasNormalizadas) {
	const partidos = new Map();

	filasNormalizadas.forEach((fila) => {
		if (!partidos.has(fila.partidoId)) {
			partidos.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				fechaTexto: fila.fechaTexto,
				equipos: new Map()
			});
		}

		const partido = partidos.get(fila.partidoId);
		if (!partido.equipos.has(fila.equipo)) {
			partido.equipos.set(fila.equipo, {
				equipo: fila.equipo,
				goles: 0,
				autogoles: 0,
				jugadores: []
			});
		}

		const equipo = partido.equipos.get(fila.equipo);
		equipo.goles += fila.goles;
		equipo.autogoles += fila.autogoles;
		equipo.jugadores.push(fila);
	});

	partidos.forEach((partido) => {
		const equipos = Array.from(partido.equipos.values());
		equipos.forEach((equipo) => {
			const rival = equipos.find((item) => item.equipo !== equipo.equipo) || { goles: 0, autogoles: 0 };
			equipo.golesAFavor = equipo.goles + rival.autogoles;
			equipo.golesEnContra = rival.goles + equipo.autogoles;
			equipo.diferencia = equipo.golesAFavor - equipo.golesEnContra;
		});
	});

	return partidos;
}

function construirEstadisticasJugadores(filasNormalizadas, partidosMap) {
	const jugadores = new Map();
	const totalPartidos = partidosMap.size;

	filasNormalizadas.forEach((fila) => {
		const claveJugador = fila.jugador;
		const partido = partidosMap.get(fila.partidoId);
		const resumenEquipo = partido?.equipos.get(fila.equipo) || {
			golesAFavor: fila.goles,
			golesEnContra: 0,
			diferencia: fila.goles
		};

		if (!jugadores.has(claveJugador)) {
			jugadores.set(claveJugador, {
				jugador: fila.jugador,
				claveImagen: normalizarTexto(fila.jugador),
				puntos: 0,
				ganados: 0,
				empatados: 0,
				perdidos: 0,
				goles: 0,
				partidosJugados: 0,
				partidosConGol: 0,
				diferenciaGol: 0,
				historial: []
			});
		}

		const jugador = jugadores.get(claveJugador);
		jugador.puntos += fila.puntos;
		jugador.goles += fila.goles;
		jugador.partidosJugados += 1;
		jugador.diferenciaGol += resumenEquipo.diferencia;

		if (fila.goles > 0) {
			jugador.partidosConGol += 1;
		}

		const resultadoNormalizado = normalizarTexto(fila.resultado);
		if (resultadoNormalizado === "ganador") {
			jugador.ganados += 1;
		} else if (resultadoNormalizado === "empate") {
			jugador.empatados += 1;
		} else {
			jugador.perdidos += 1;
		}

		jugador.historial.push({
			partidoId: fila.partidoId,
			fecha: fila.fecha,
			fechaTexto: fila.fechaTexto,
			resultado: resultadoNormalizado,
			goles: fila.goles
		});
	});

	return Array.from(jugadores.values())
		.map((jugador) => {
			const ultimosPartidos = jugador.historial
				.sort((actual, siguiente) => {
					if (actual.fecha.getTime() === siguiente.fecha.getTime()) {
						return normalizarEntero(actual.partidoId) - normalizarEntero(siguiente.partidoId);
					}
					return actual.fecha - siguiente.fecha;
				})
				.slice(-MAX_PARTIDOS_RECIENTES);

			return {
				...jugador,
				efectividadGol: jugador.partidosJugados ? (jugador.partidosConGol / jugador.partidosJugados) * 100 : 0,
				porcentajeVictorias: jugador.partidosJugados ? (jugador.ganados / jugador.partidosJugados) * 100 : 0,
				porcentajePresencias: totalPartidos ? (jugador.partidosJugados / totalPartidos) * 100 : 0,
				puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
				golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0,
				ultimosPartidos
			};
		})
		.sort((actual, siguiente) => {
			if (siguiente.puntos !== actual.puntos) {
				return siguiente.puntos - actual.puntos;
			}
			if (siguiente.puntosPorPartido !== actual.puntosPorPartido) {
				return siguiente.puntosPorPartido - actual.puntosPorPartido;
			}
			if (siguiente.diferenciaGol !== actual.diferenciaGol) {
				return siguiente.diferenciaGol - actual.diferenciaGol;
			}
			if (siguiente.goles !== actual.goles) {
				return siguiente.goles - actual.goles;
			}
			return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
		});
}

function obtenerIconoPosicion(posicion) {
	if (posicion === 1) {
		return "🏆";
	}
	if (posicion === 2) {
		return "🥈";
	}
	if (posicion === 3) {
		return "🥉";
	}
	return "";
}

function calcularPosicionesPorPuntos(estadisticasJugadores) {
	let puntosAnteriores = null;
	let posicionActual = 0;

	return estadisticasJugadores.map((jugador) => {
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

function obtenerColorResultado(resultado) {
	if (resultado === "ganador") {
		return "dot dot--green";
	}
	if (resultado === "empate") {
		return "dot dot--yellow";
	}
	if (resultado === "perdedor") {
		return "dot dot--red";
	}
	return "dot dot--neutral";
}

function obtenerClaseGolDot(goles) {
	if (goles >= 2) {
		return "goal-dot metric-good";
	}
	if (goles === 1) {
		return "goal-dot metric-mid";
	}
	return "goal-dot metric-bad";
}

function construirAvatarJugador(jugador) {
	const imagen = `./assets/jugadores/jugador-${jugador.claveImagen}.png`;
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `<img class="player__avatar" src="${imagen}" alt="${escaparHtml(jugador.jugador)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder}';">`;
}

function renderizarRendimiento(ultimosPartidos) {
	const relleno = Array.from({ length: MAX_PARTIDOS_RECIENTES - ultimosPartidos.length }, () => ({ resultado: "" }));
	return [...relleno, ...ultimosPartidos]
		.map((partido) => `<span class="${obtenerColorResultado(partido.resultado)}"></span>`)
		.join("");
}

function renderizarGoleometro(ultimosPartidos) {
	const relleno = Array.from({ length: MAX_PARTIDOS_RECIENTES - ultimosPartidos.length }, () => null);
	return [...relleno, ...ultimosPartidos]
		.map((partido) => {
			if (!partido) {
				return '<span class="goal-dot goal-dot--neutral">•</span>';
			}
			return `<span class="${obtenerClaseGolDot(partido.goles)}">${partido.goles}</span>`;
		})
		.join("");
}

function renderizarFilasTabla(estadisticasJugadores) {
	const cuerpoTabla = document.getElementById("js-tabla-general-body");

	if (estadisticasJugadores.length === 0) {
		renderizarEstadoInicial(
			"No hay jugadores para mostrar",
			"La hoja no devolvió filas válidas para construir la clasificación."
		);
		return;
	}

	const estadisticasConPosicion = calcularPosicionesPorPuntos(estadisticasJugadores);

	cuerpoTabla.innerHTML = estadisticasConPosicion
		.map((jugador) => {
			const posicion = jugador.posicionTabla;
			const icono = obtenerIconoPosicion(posicion);
			const claseEfectividad = obtenerClasePorcentajeCuartil(jugador.efectividadGol);
			const claseDiferencia = obtenerClaseMetricas(jugador.diferenciaGol, { good: 1, mid: 0 });
			const claseVictorias = obtenerClasePorcentajeCuartil(jugador.porcentajeVictorias);
			const clasePresencias = obtenerClasePorcentajeCuartil(jugador.porcentajePresencias);

			return `
				<tr>
					<td class="position-cell">
						<span class="rank-badge" data-rank="${posicion <= 3 ? posicion : 0}">
							${icono ? `<span class="rank-badge__icon">${icono}</span>` : ""}
							<span>${posicion}</span>
						</span>
					</td>
					<td class="player-cell align-left">
						<div class="player">
							${construirAvatarJugador(jugador)}
							<div class="player__info">
								<span class="player__name">${escaparHtml(jugador.jugador)}</span>
								<span class="player__meta">${jugador.partidosJugados} partidos jugados</span>
							</div>
						</div>
					</td>
					<td><span class="points-value">${jugador.puntos}</span></td>
					<td class="result-cell--g"><span class="split-result">${jugador.ganados}</span></td>
					<td class="result-cell--e"><span class="split-result">${jugador.empatados}</span></td>
					<td class="result-cell--p"><span class="split-result">${jugador.perdidos}</span></td>
					<td>${jugador.goles}</td>
					<td><span class="${claseEfectividad}">${formatearPorcentaje(jugador.efectividadGol)}</span></td>
					<td><span class="${claseDiferencia}">${jugador.diferenciaGol}</span></td>
					<td><span class="${claseVictorias}">${formatearPorcentaje(jugador.porcentajeVictorias)}</span></td>
					<td><span class="${clasePresencias}">${formatearPorcentaje(jugador.porcentajePresencias)}</span></td>
					<td>
						<span class="metric-stack">
							<span>${formatearDecimal(jugador.puntosPorPartido)}</span>
							<small>pts</small>
						</span>
					</td>
					<td>
						<span class="metric-stack">
							<span>${formatearDecimal(jugador.golesPorPartido)}</span>
							<small>gol</small>
						</span>
					</td>
					<td><span class="form-dots">${renderizarRendimiento(jugador.ultimosPartidos)}</span></td>
					<td><span class="goal-dots">${renderizarGoleometro(jugador.ultimosPartidos)}</span></td>
				</tr>
			`;
		})
		.join("");
}

async function iniciarTablaGeneral() {
	renderizarEstadoInicial("Conectando");

	try {
		const filas = await window.lectorDatos.obtenerFilasPartidos();
		const filasNormalizadas = filas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		const aniosDisponibles = obtenerAniosDisponibles(filasNormalizadas);
		const anioPorDefecto = aniosDisponibles[0] ?? "historico";

		window.__TORNEO_RAW_DATA__ = filasNormalizadas;
		estadoTablaGeneral.filasCrudas = filasNormalizadas;
		estadoTablaGeneral.aniosDisponibles = aniosDisponibles;
		estadoTablaGeneral.filtros.anio = anioPorDefecto;
		estadoTablaGeneral.filtros.minPartidos = FILTRO_MIN_PARTIDOS_DEFAULT;

		poblarFiltroAnios(aniosDisponibles);
		configurarEventosFiltros();
		aplicarFiltrosYRenderizar();

		const partidosMapGlobal = construirResumenPartidos(filasNormalizadas);
		const estadisticasGlobales = construirEstadisticasJugadores(filasNormalizadas, partidosMapGlobal);
		window.__TORNEO_STATS_GLOBAL__ = estadisticasGlobales;

		actualizarEstadoInterfaz({
			mensaje: "Datos conectados",
			totalJugadores: estadisticasGlobales.length,
			totalPartidos: partidosMapGlobal.size,
			totalRegistros: filasNormalizadas.length
		});
	} catch (error) {
		console.error(error);
		actualizarEstadoInterfaz({
			mensaje: "Error de conexión"
		});
		renderizarEstadoInicial(
			"No se pudieron cargar los datos",
			"Revisá la publicación del Google Sheets o la conexión de red para continuar."
		);
	}
}

const tablaGeneralApi = {
	normalizarTexto,
	normalizarEntero,
	parsearFecha,
	normalizarFilaCruda,
	construirResumenPartidos,
	construirEstadisticasJugadores,
	obtenerAniosDisponibles,
	filtrarFilasPorAnio,
	formatearDecimal,
	formatearPorcentaje
};

if (typeof window !== "undefined") {
	window.tablaGeneralApi = tablaGeneralApi;
	if (typeof document !== "undefined") {
		document.addEventListener("DOMContentLoaded", iniciarTablaGeneral);
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = tablaGeneralApi;
}
