const MESES_LABELS = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const FILTRO_HISTORICO = "historic";

const estadoPartidos = {
	filasCrudas: [],
	partidos: [],
	filtros: {
		anio: null,
		mes: "all"
	}
};

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

function formatearFecha(fecha) {
	return new Intl.DateTimeFormat("es-AR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric"
	}).format(fecha);
}

function escaparHtml(valor) {
	return String(valor ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function normalizarFilaCruda(fila) {
	const fecha = parsearFecha(fila.Fecha || fila.fecha || "");
	return {
		partidoId: String(fila.partido_id || fila.partidoId || fila.Partido || "").trim(),
		fechaTexto: String(fila.Fecha || fila.fecha || "").trim(),
		fecha,
		anio: fecha.getFullYear(),
		mes: fecha.getMonth(),
		equipo: String(fila.Equipo || fila.equipo || "").trim(),
		jugador: String(fila.Jugador || fila.jugador || "").trim(),
		resultado: String(fila.Resultado || fila.resultado || "").trim(),
		goles: normalizarEntero(fila.Goles || fila.goles),
		autogoles: normalizarEntero(fila.Autogoles || fila.autogoles),
		puntos: normalizarEntero(fila.Puntos || fila.puntos)
	};
}

function construirPartidos(filasNormalizadas) {
	const partidosMap = new Map();

	filasNormalizadas.forEach((fila) => {
		if (!partidosMap.has(fila.partidoId)) {
			partidosMap.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				fechaTexto: fila.fechaTexto,
				anio: fila.anio,
				mes: fila.mes,
				equipos: new Map(),
				jugadores: []
			});
		}

		const partido = partidosMap.get(fila.partidoId);
		partido.jugadores.push(fila);

		if (!partido.equipos.has(fila.equipo)) {
			partido.equipos.set(fila.equipo, {
				equipoId: fila.equipo,
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

	return Array.from(partidosMap.values())
		.map((partido) => {
			const equipos = Array.from(partido.equipos.values())
				.map((equipo) => {
					const rival = Array.from(partido.equipos.values()).find((item) => item.equipoId !== equipo.equipoId) || { goles: 0, autogoles: 0 };
					const marcador = equipo.goles + rival.autogoles;
					const recibidos = rival.goles + equipo.autogoles;

					return {
						...equipo,
						marcador,
						recibidos,
						jugadores: equipo.jugadores.sort((actual, siguiente) => {
							if (siguiente.goles !== actual.goles) {
								return siguiente.goles - actual.goles;
							}
							if (siguiente.autogoles !== actual.autogoles) {
								return siguiente.autogoles - actual.autogoles;
							}
							return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
						})
					};
				})
				.sort((actual, siguiente) => actual.equipoId.localeCompare(siguiente.equipoId, "es", { numeric: true, sensitivity: "base" }));

			const [equipoA, equipoB] = equipos;
			let estado = "draw";

			if (equipoA && equipoB) {
				if (equipoA.marcador > equipoB.marcador) {
					equipoA.resultado = "winner";
					equipoB.resultado = "loser";
					estado = "defined";
				} else if (equipoA.marcador < equipoB.marcador) {
					equipoA.resultado = "loser";
					equipoB.resultado = "winner";
					estado = "defined";
				} else {
					equipoA.resultado = "draw";
					equipoB.resultado = "draw";
				}
			} else if (equipoA) {
				equipoA.resultado = "draw";
			}

			return {
				...partido,
				equipos,
				estado
			};
		})
		.sort((actual, siguiente) => {
			if (actual.fecha.getTime() === siguiente.fecha.getTime()) {
				return normalizarEntero(siguiente.partidoId) - normalizarEntero(actual.partidoId);
			}
			return siguiente.fecha - actual.fecha;
		});
}

function obtenerAniosDisponibles(partidos) {
	return Array.from(new Set(partidos.map((partido) => partido.anio))).sort((actual, siguiente) => siguiente - actual);
}

function obtenerMesesDisponibles(partidos, anio) {
	return Array.from(new Set(partidos.filter((partido) => partido.anio === anio).map((partido) => partido.mes))).sort((actual, siguiente) => siguiente - actual);
}

function filtrarPartidos(partidos, filtros) {
	return partidos.filter((partido) => {
		if (filtros.anio !== FILTRO_HISTORICO && partido.anio !== filtros.anio) {
			return false;
		}
		if (filtros.mes !== "all" && partido.mes !== filtros.mes) {
			return false;
		}
		return true;
	});
}

function obtenerResumenGoleadoresPartido(partido) {
	const jugadores = (partido?.equipos || []).flatMap((equipo) => equipo.jugadores || []);
	const maximoGoles = jugadores.reduce((maximo, jugador) => Math.max(maximo, normalizarEntero(jugador.goles)), 0);

	if (maximoGoles <= 0) {
		return {
			texto: "Sin goleador del partido",
			maximoGoles: 0,
			nombres: []
		};
	}

	const nombres = jugadores
		.filter((jugador) => normalizarEntero(jugador.goles) === maximoGoles)
		.map((jugador) => jugador.jugador);

	return {
		texto: `${nombres.join(", ")} (${maximoGoles})`,
		maximoGoles,
		nombres
	};
}

function obtenerTotalAutogoles(partido) {
	return (partido?.equipos || []).reduce((total, equipo) => total + normalizarEntero(equipo.autogoles), 0);
}

function obtenerTotalGoles(partido) {
	return (partido?.equipos || []).reduce((total, equipo) => total + normalizarEntero(equipo.marcador), 0);
}

function poblarFiltroAnios() {
	const selector = document.getElementById("js-filter-year");
	const anios = obtenerAniosDisponibles(estadoPartidos.partidos);
	selector.innerHTML = [`<option value="${FILTRO_HISTORICO}">Histórico</option>`]
		.concat(anios.map((anio) => `<option value="${anio}">${anio}</option>`))
		.join("");
	selector.value = String(estadoPartidos.filtros.anio);
}

function poblarFiltroMeses() {
	const selector = document.getElementById("js-filter-month");
	if (estadoPartidos.filtros.anio === FILTRO_HISTORICO) {
		selector.innerHTML = `<option value="all">Todos</option>`;
		selector.value = "all";
		selector.disabled = true;
		return;
	}

	const meses = obtenerMesesDisponibles(estadoPartidos.partidos, estadoPartidos.filtros.anio);
	selector.innerHTML = [`<option value="all">Todos</option>`]
		.concat(meses.map((mes) => `<option value="${mes}">${MESES_LABELS[mes]}</option>`))
		.join("");
	selector.value = String(estadoPartidos.filtros.mes);
	selector.disabled = false;
}

function actualizarResumenFiltros(partidosFiltrados) {
	const totalGoles = partidosFiltrados.reduce((total, partido) => total + obtenerTotalGoles(partido), 0);
	const promedioGoles = partidosFiltrados.length > 0 ? (totalGoles / partidosFiltrados.length).toFixed(1) : "0.0";
	const etiquetaAnio = estadoPartidos.filtros.anio === FILTRO_HISTORICO ? "Histórico" : String(estadoPartidos.filtros.anio);
	const etiquetaMes = estadoPartidos.filtros.anio === FILTRO_HISTORICO
		? "Todos"
		: estadoPartidos.filtros.mes === "all"
			? "Todos"
			: (MESES_LABELS[estadoPartidos.filtros.mes] || "--");

	document.getElementById("js-active-year").textContent = etiquetaAnio;
	document.getElementById("js-active-month").textContent = etiquetaMes;
	document.getElementById("js-total-matches").textContent = String(partidosFiltrados.length);
	document.getElementById("js-total-goals").textContent = String(totalGoles);
	document.getElementById("js-goals-average").textContent = String(promedioGoles);
}

function renderizarTarjetaPartido(partido) {
	const [equipoA, equipoB] = partido.equipos;
	const marcadorA = equipoA?.marcador ?? 0;
	const marcadorB = equipoB?.marcador ?? 0;
	const resumenGoleadores = obtenerResumenGoleadoresPartido(partido);

	return `
		<article class="match-card">
			<div class="match-card__layout">
				<div class="match-card__meta">
					<span class="match-card__eyebrow">${formatearFecha(partido.fecha)}</span>
					<h3 class="match-card__title">Partido ${escaparHtml(partido.partidoId)}</h3>
				</div>
				<div class="match-card__score">${marcadorA}<span class="match-card__score-separator">-</span>${marcadorB}</div>
				<div class="match-card__actions">
					<a class="match-card__link" href="./Resumen.html?partido=${encodeURIComponent(partido.partidoId)}">Ver resumen</a>
				</div>
			</div>
			<div class="match-card__footer">
				<span class="match-card__footer-label">Goleador${resumenGoleadores.nombres.length > 1 ? "es" : ""}:</span>
				<span class="match-card__footer-value">${escaparHtml(resumenGoleadores.texto)}</span>
			</div>
		</article>
	`;
}

function renderizarListado(partidosFiltrados) {
	const contenedor = document.getElementById("js-matches-list");

	if (partidosFiltrados.length === 0) {
		contenedor.innerHTML = `
			<div class="empty-state">
				<strong>No hay partidos para mostrar</strong>
				Probá con otra combinación de filtros.
			</div>
		`;
		return;
	}

	contenedor.innerHTML = partidosFiltrados.map(renderizarTarjetaPartido).join("");
}

function aplicarFiltrosYRenderizar() {
	const partidosFiltrados = filtrarPartidos(estadoPartidos.partidos, estadoPartidos.filtros);
	actualizarResumenFiltros(partidosFiltrados);
	renderizarListado(partidosFiltrados);
	window.__PARTIDOS_FILTRADOS__ = partidosFiltrados;
}

function configurarEventosFiltros() {
	document.getElementById("js-filter-year").addEventListener("change", (event) => {
		const valor = event.target.value;
		estadoPartidos.filtros.anio = valor === FILTRO_HISTORICO ? FILTRO_HISTORICO : Number(valor);
		estadoPartidos.filtros.mes = "all";
		poblarFiltroMeses();
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-filter-month").addEventListener("change", (event) => {
		const valor = event.target.value;
		estadoPartidos.filtros.mes = valor === "all" ? "all" : Number(valor);
		aplicarFiltrosYRenderizar();
	});
}

async function iniciarPartidos() {
	const contenedor = document.getElementById("js-matches-list");
	contenedor.innerHTML = `
		<div class="empty-state">
			<strong>Conectando</strong>
		</div>
	`;

	try {
		const filas = await window.lectorDatos.obtenerFilasPartidos();
		const filasNormalizadas = filas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		const partidos = construirPartidos(filasNormalizadas);
		const anios = obtenerAniosDisponibles(partidos);
		const anioMasReciente = anios[0] ?? null;

		estadoPartidos.filasCrudas = filasNormalizadas;
		estadoPartidos.partidos = partidos;
		estadoPartidos.filtros.anio = anioMasReciente;
		estadoPartidos.filtros.mes = "all";

		window.__PARTIDOS_RAW_DATA__ = filasNormalizadas;
		window.__PARTIDOS_MATCHES__ = partidos;

		poblarFiltroAnios();
		poblarFiltroMeses();
		configurarEventosFiltros();
		aplicarFiltrosYRenderizar();
	} catch (error) {
		console.error(error);
		contenedor.innerHTML = `
			<div class="empty-state">
				<strong>No se pudieron cargar los partidos</strong>
				Revisá la publicación del Google Sheets o la conexión de red para continuar.
			</div>
		`;
	}
}

const partidosApi = {
	normalizarEntero,
	parsearFecha,
	formatearFecha,
	normalizarFilaCruda,
	construirPartidos,
	obtenerAniosDisponibles,
	obtenerMesesDisponibles,
	filtrarPartidos,
	obtenerResumenGoleadoresPartido,
	obtenerTotalAutogoles,
	obtenerTotalGoles
};

if (typeof window !== "undefined") {
	window.partidosApi = partidosApi;
	if (typeof document !== "undefined") {
		document.addEventListener("DOMContentLoaded", iniciarPartidos);
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = partidosApi;
}
