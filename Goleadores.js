const GOLEADORES_MAX_COLUMNAS = 7;
const GOLEADORES_MIN_PARTIDOS_DEFAULT = 3;

const estadoGoleadores = {
	filasCrudas: [],
	aniosDisponibles: [],
	filtros: {
		anio: "historico",
		minPartidos: GOLEADORES_MIN_PARTIDOS_DEFAULT
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

function obtenerAnioFecha(fecha) {
	if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) {
		return null;
	}
	return fecha.getFullYear();
}

function formatearDecimal(valor) {
	return Number(valor || 0).toFixed(1);
}

function formatearPorcentaje(valor) {
	return `${Math.round(valor || 0)}%`;
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

function obtenerClaseDiferencia(valor) {
	if (valor > 0) {
		return "metric-very-good";
	}
	if (valor === 0) {
		return "metric-warn";
	}
	return "metric-bad";
}

function obtenerClaseGolesPorPartido(valor) {
	if (valor >= 1.5) {
		return "metric-very-good";
	}
	if (valor >= 1) {
		return "metric-good-soft";
	}
	if (valor >= 0.5) {
		return "metric-warn";
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

function obtenerAniosDisponibles(filasNormalizadas) {
	return Array.from(
		new Set(
			filasNormalizadas
				.map((fila) => obtenerAnioFecha(fila.fecha))
				.filter((anio) => anio !== null)
		)
	).sort((actual, siguiente) => siguiente - actual);
}

function filtrarFilasPorAnio(filasNormalizadas, anio) {
	if (anio === "historico") {
		return filasNormalizadas;
	}

	return filasNormalizadas.filter((fila) => obtenerAnioFecha(fila.fecha) === Number(anio));
}

function construirResumenPartidos(filasNormalizadas) {
	const partidos = new Map();

	filasNormalizadas.forEach((fila) => {
		if (!partidos.has(fila.partidoId)) {
			partidos.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				equipos: new Map(),
				jugadores: []
			});
		}

		const partido = partidos.get(fila.partidoId);
		partido.jugadores.push(fila);

		if (!partido.equipos.has(fila.equipo)) {
			partido.equipos.set(fila.equipo, {
				equipo: fila.equipo,
				goles: 0,
				autogoles: 0
			});
		}

		const equipo = partido.equipos.get(fila.equipo);
		equipo.goles += fila.goles;
		equipo.autogoles += fila.autogoles;
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

function calcularVecesGoleador(partidosMap) {
	const conteo = new Map();

	partidosMap.forEach((partido) => {
		const maximoGoles = partido.jugadores.reduce((maximo, jugador) => Math.max(maximo, jugador.goles), 0);

		if (maximoGoles <= 0) {
			return;
		}

		partido.jugadores
			.filter((jugador) => jugador.goles === maximoGoles)
			.forEach((jugador) => {
				conteo.set(jugador.jugador, (conteo.get(jugador.jugador) || 0) + 1);
			});
	});

	return conteo;
}

function construirEstadisticasGoleadores(filasNormalizadas, partidosMap) {
	const jugadores = new Map();
	const vecesGoleadorMap = calcularVecesGoleador(partidosMap);

	filasNormalizadas.forEach((fila) => {
		const resumenEquipo = partidosMap.get(fila.partidoId)?.equipos.get(fila.equipo) || {
			diferencia: fila.goles
		};

		if (!jugadores.has(fila.jugador)) {
			jugadores.set(fila.jugador, {
				jugador: fila.jugador,
				claveImagen: normalizarTexto(fila.jugador),
				goles: 0,
				partidosJugados: 0,
				partidosConGol: 0,
				diferenciaGol: 0
			});
		}

		const jugador = jugadores.get(fila.jugador);
		jugador.goles += fila.goles;
		jugador.partidosJugados += 1;
		jugador.diferenciaGol += resumenEquipo.diferencia;

		if (fila.goles > 0) {
			jugador.partidosConGol += 1;
		}
	});

	return Array.from(jugadores.values())
		.map((jugador) => ({
			...jugador,
			vecesGoleador: vecesGoleadorMap.get(jugador.jugador) || 0,
			golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0,
			efectividadGol: jugador.partidosJugados ? (jugador.partidosConGol / jugador.partidosJugados) * 100 : 0
		}))
		.sort((actual, siguiente) => {
			if (siguiente.goles !== actual.goles) {
				return siguiente.goles - actual.goles;
			}
			if (siguiente.vecesGoleador !== actual.vecesGoleador) {
				return siguiente.vecesGoleador - actual.vecesGoleador;
			}
			if (siguiente.golesPorPartido !== actual.golesPorPartido) {
				return siguiente.golesPorPartido - actual.golesPorPartido;
			}
			if (siguiente.diferenciaGol !== actual.diferenciaGol) {
				return siguiente.diferenciaGol - actual.diferenciaGol;
			}
			return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
		});
}

function calcularPosicionesPorGoles(estadisticas) {
	let golesAnteriores = null;
	let posicionActual = 0;

	return estadisticas.map((jugador) => {
		if (jugador.goles !== golesAnteriores) {
			posicionActual += 1;
			golesAnteriores = jugador.goles;
		}

		return {
			...jugador,
			posicionTabla: posicionActual
		};
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

function construirAvatarJugador(jugador) {
	const imagen = `./assets/jugadores/jugador-${jugador.claveImagen}.png`;
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `<img class="player__avatar" src="${imagen}" alt="${escaparHtml(jugador.jugador)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder}';">`;
}

function renderizarEstadoInicial(texto, detalle) {
	const cuerpoTabla = document.getElementById("js-goleadores-body");
	cuerpoTabla.innerHTML = `
		<tr>
			<td class="empty-state" colspan="${GOLEADORES_MAX_COLUMNAS}">
				<strong>${texto}</strong>
				${detalle}
			</td>
		</tr>
	`;
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

	selector.value = String(estadoGoleadores.filtros.anio);
}

function actualizarResumenFiltros() {
	const anioActivo = document.getElementById("js-active-year");
	const minPartidosActivo = document.getElementById("js-active-min-matches");

	if (anioActivo) {
		anioActivo.textContent = estadoGoleadores.filtros.anio === "historico"
			? "Histórico"
			: String(estadoGoleadores.filtros.anio);
	}

	if (minPartidosActivo) {
		minPartidosActivo.textContent = `${estadoGoleadores.filtros.minPartidos}+`;
	}
}

function renderizarFilasGoleadores(estadisticas) {
	const cuerpoTabla = document.getElementById("js-goleadores-body");

	if (estadisticas.length === 0) {
		renderizarEstadoInicial(
			"No hay goleadores para mostrar",
			"Probá con otro año o bajá el mínimo de partidos jugados."
		);
		return;
	}

	const ranking = calcularPosicionesPorGoles(estadisticas);
	const maximoGoles = Math.max(...ranking.map((jugador) => jugador.goles), 1);

	cuerpoTabla.innerHTML = ranking
		.map((jugador) => {
			const posicion = jugador.posicionTabla;
			const icono = obtenerIconoPosicion(posicion);
			const anchoBarra = `${Math.max((jugador.goles / maximoGoles) * 100, jugador.goles > 0 ? 12 : 0)}%`;

			return `
				<tr>
					<td class="position-cell">
						<span class="rank-badge" data-rank="${posicion <= 3 ? posicion : 0}">
							${icono ? `<span class="rank-badge__icon">${icono}</span>` : ""}
							<span>${posicion}</span>
						</span>
					</td>
					<td class="player-cell">
						<div class="player">
							${construirAvatarJugador(jugador)}
							<div>
								<span class="player__name">${escaparHtml(jugador.jugador)}</span>
								<span class="player__meta">${jugador.partidosJugados} partidos jugados</span>
							</div>
						</div>
					</td>
					<td class="goal-cell">
						<div class="goal-stat">
							<span class="goal-stat__value">${jugador.goles}</span>
							<div class="goal-track"><div class="goal-fill" style="width:${anchoBarra}"></div></div>
						</div>
					</td>
					<td>${jugador.vecesGoleador}</td>
					<td><span class="${obtenerClaseGolesPorPartido(jugador.golesPorPartido)}">${formatearDecimal(jugador.golesPorPartido)}</span></td>
					<td><span class="${obtenerClaseDiferencia(jugador.diferenciaGol)}">${jugador.diferenciaGol}</span></td>
					<td><span class="${obtenerClasePorcentajeCuartil(jugador.efectividadGol)}">${formatearPorcentaje(jugador.efectividadGol)}</span></td>
				</tr>
			`;
		})
		.join("");
}

function aplicarFiltrosYRenderizar() {
	const filasFiltradasPorAnio = filtrarFilasPorAnio(estadoGoleadores.filasCrudas, estadoGoleadores.filtros.anio);

	if (filasFiltradasPorAnio.length === 0) {
		actualizarResumenFiltros();
		renderizarEstadoInicial(
			"No hay partidos para ese filtro",
			"Probá con otro año o bajá el mínimo de partidos jugados."
		);
		return;
	}

	const partidosMap = construirResumenPartidos(filasFiltradasPorAnio);
	const estadisticas = construirEstadisticasGoleadores(filasFiltradasPorAnio, partidosMap)
		.filter((jugador) => jugador.partidosJugados >= estadoGoleadores.filtros.minPartidos);

	window.__GOLEADORES_STATS__ = estadisticas;
	actualizarResumenFiltros();
	renderizarFilasGoleadores(estadisticas);
}

function configurarEventosFiltros() {
	const selectorAnio = document.getElementById("js-filter-year");
	const selectorMinPartidos = document.getElementById("js-filter-min-matches");

	if (selectorAnio) {
		selectorAnio.addEventListener("change", (event) => {
			estadoGoleadores.filtros.anio = event.target.value === "historico"
				? "historico"
				: Number(event.target.value);
			aplicarFiltrosYRenderizar();
		});
	}

	if (selectorMinPartidos) {
		selectorMinPartidos.value = String(estadoGoleadores.filtros.minPartidos);
		selectorMinPartidos.addEventListener("change", (event) => {
			estadoGoleadores.filtros.minPartidos = normalizarEntero(event.target.value);
			aplicarFiltrosYRenderizar();
		});
	}
}

async function iniciarGoleadores() {
	renderizarEstadoInicial("Conectando");

	try {
		const filas = await window.lectorDatos.obtenerFilasPartidos();
		const filasNormalizadas = filas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		const aniosDisponibles = obtenerAniosDisponibles(filasNormalizadas);

		estadoGoleadores.filasCrudas = filasNormalizadas;
		estadoGoleadores.aniosDisponibles = aniosDisponibles;
		estadoGoleadores.filtros.anio = aniosDisponibles[0] ?? "historico";
		estadoGoleadores.filtros.minPartidos = GOLEADORES_MIN_PARTIDOS_DEFAULT;

		window.__GOLEADORES_RAW_DATA__ = filasNormalizadas;

		poblarFiltroAnios(aniosDisponibles);
		configurarEventosFiltros();
		aplicarFiltrosYRenderizar();
	} catch (error) {
		console.error(error);
		renderizarEstadoInicial(
			"No se pudieron cargar los datos",
			"Revisá la publicación del Google Sheets o la conexión de red para continuar."
		);
	}
}

const goleadoresApi = {
	normalizarTexto,
	normalizarEntero,
	parsearFecha,
	normalizarFilaCruda,
	obtenerAniosDisponibles,
	filtrarFilasPorAnio,
	construirResumenPartidos,
	calcularVecesGoleador,
	construirEstadisticasGoleadores,
	formatearDecimal,
	formatearPorcentaje
};

if (typeof window !== "undefined") {
	window.goleadoresApi = goleadoresApi;
	if (typeof document !== "undefined") {
		document.addEventListener("DOMContentLoaded", iniciarGoleadores);
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = goleadoresApi;
}