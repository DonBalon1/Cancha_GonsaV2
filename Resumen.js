const MESES_LABELS = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const MAX_GOLES_VISIBLES = 5;

const estadoResumen = {
	filasCrudas: [],
	partidos: [],
	partidoUrlSolicitado: null,
	filtros: {
		anio: null,
		mes: null,
		partidoId: null
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
		.replace(/"/g, "&quot;")
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
						diferencia: marcador - recibidos,
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
			let estadoGlobal = "draw";

			if (equipoA && equipoB) {
				if (equipoA.marcador > equipoB.marcador) {
					equipoA.resultado = "winner";
					equipoB.resultado = "loser";
					estadoGlobal = "winner";
				} else if (equipoA.marcador < equipoB.marcador) {
					equipoA.resultado = "loser";
					equipoB.resultado = "winner";
					estadoGlobal = "winner";
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
				estadoGlobal
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
	return Array.from(
		new Set(partidos.filter((partido) => partido.anio === anio).map((partido) => partido.mes))
	).sort((actual, siguiente) => siguiente - actual);
}

function obtenerPartidosFiltrados(partidos, anio, mes) {
	return partidos.filter((partido) => partido.anio === anio && partido.mes === mes);
}

function leerPartidoDesdeUrl() {
	if (typeof window === "undefined") {
		return null;
	}

	const parametros = new URLSearchParams(window.location.search);
	const partido = parametros.get("partido");
	return partido ? String(partido).trim() : null;
}

function sincronizarUrlPartido(partidoId) {
	if (typeof window === "undefined") {
		return;
	}

	const url = new URL(window.location.href);
	if (partidoId) {
		url.searchParams.set("partido", String(partidoId));
	} else {
		url.searchParams.delete("partido");
	}

	window.history.replaceState({}, "", url);
}

function obtenerPartidoPorId(partidos, partidoId) {
	return partidos.find((partido) => String(partido.partidoId) === String(partidoId)) || null;
}

function resolverFiltrosIniciales(partidos) {
	const partidoSolicitado = obtenerPartidoPorId(partidos, estadoResumen.partidoUrlSolicitado);
	if (partidoSolicitado) {
		return {
			anio: partidoSolicitado.anio,
			mes: partidoSolicitado.mes,
			partidoId: partidoSolicitado.partidoId
		};
	}

	const anios = obtenerAniosDisponibles(partidos);
	const anioMasReciente = anios[0] ?? null;
	const meses = obtenerMesesDisponibles(partidos, anioMasReciente);
	const mesMasReciente = meses[0] ?? null;
	const partidosDelMes = obtenerPartidosFiltrados(partidos, anioMasReciente, mesMasReciente);

	return {
		anio: anioMasReciente,
		mes: mesMasReciente,
		partidoId: partidosDelMes[0]?.partidoId ?? null
	};
}

function poblarFiltroAnios() {
	const selector = document.getElementById("js-filter-year");
	const anios = obtenerAniosDisponibles(estadoResumen.partidos);
	selector.innerHTML = anios.map((anio) => `<option value="${anio}">${anio}</option>`).join("");
	selector.value = String(estadoResumen.filtros.anio);
}

function poblarFiltroMeses() {
	const selector = document.getElementById("js-filter-month");
	const meses = obtenerMesesDisponibles(estadoResumen.partidos, estadoResumen.filtros.anio);
	selector.innerHTML = meses
		.map((mes) => `<option value="${mes}">${MESES_LABELS[mes]}</option>`)
		.join("");
	selector.value = String(estadoResumen.filtros.mes);
}

function poblarFiltroPartidos() {
	const selector = document.getElementById("js-filter-match");
	const partidos = obtenerPartidosFiltrados(estadoResumen.partidos, estadoResumen.filtros.anio, estadoResumen.filtros.mes);
	selector.innerHTML = partidos
		.map((partido) => `<option value="${partido.partidoId}">${formatearFecha(partido.fecha)} · Partido ${partido.partidoId}</option>`)
		.join("");
	selector.value = String(estadoResumen.filtros.partidoId);
}

function actualizarResumenFiltros() {
	document.getElementById("js-active-year").textContent = String(estadoResumen.filtros.anio);
	document.getElementById("js-active-month").textContent = MESES_LABELS[estadoResumen.filtros.mes] || "--";
	document.getElementById("js-active-match").textContent = estadoResumen.filtros.partidoId ? `#${estadoResumen.filtros.partidoId}` : "--";
}

function construirAvatar(nombreJugador) {
	const claveImagen = normalizarTexto(nombreJugador);
	const imagen = `./assets/jugadores/jugador-${claveImagen}.png`;
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `<img class="player-avatar" src="${imagen}" alt="${escaparHtml(nombreJugador)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder}';">`;
}

function obtenerEtiquetaResultado(resultado) {
	if (resultado === "winner") {
		return "Ganador";
	}
	if (resultado === "loser") {
		return "Perdedor";
	}
	return "Empate";
}

function renderizarGolesComoPelotas(cantidadGoles) {
	const goles = normalizarEntero(cantidadGoles);
	if (goles <= 0) {
		return "";
	}

	const golesVisibles = Math.min(goles, MAX_GOLES_VISIBLES);
	const golesExtra = Math.max(0, goles - MAX_GOLES_VISIBLES);
	const pelotas = "⚽".repeat(golesVisibles);
	const extra = golesExtra > 0
		? `<span class="goal-badge__extra" aria-label="${golesExtra} goles extra">+${golesExtra}</span>`
		: "";

	return `
		<span class="goal-badge" aria-label="${goles} gol${goles === 1 ? "" : "es"}">
			<span class="goal-badge__balls">${pelotas}</span>
			${extra}
		</span>
	`;
}

function renderizarEventosJugador(jugador) {
	const piezas = [];
	if (jugador.goles > 0) {
		piezas.push(renderizarGolesComoPelotas(jugador.goles));
	}
	if (jugador.autogoles > 0) {
		piezas.push(`<span class="own-goal-badge">AG ${jugador.autogoles}</span>`);
	}
	if (piezas.length === 0) {
		piezas.push('<span class="player-sub">Sin goles</span>');
	}
	return piezas.join("");
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

function renderizarResumenPartido(partido) {
	const shell = document.getElementById("js-summary-shell");

	if (!partido) {
		shell.innerHTML = `
			<div class="empty-state">
				<strong>No hay partido para mostrar</strong>
				Probá con otra combinación de año y mes.
			</div>
		`;
		return;
	}

	const [equipoA, equipoB] = partido.equipos;
	const marcadorA = equipoA?.marcador ?? 0;
	const marcadorB = equipoB?.marcador ?? 0;
	const resumenGoleadores = obtenerResumenGoleadoresPartido(partido);

	const renderEquipo = (equipo) => {
		if (!equipo) {
			return "";
		}

		return `
			<section class="team-card" data-result="${equipo.resultado}">
				<header class="team-card__head">
					<div class="team-card__label">
						<span class="team-result-pill" data-result="${equipo.resultado}">${obtenerEtiquetaResultado(equipo.resultado)}</span>
					</div>
					<div style="text-align:right; display:grid; gap:8px; justify-items:end;">
						<span class="team-card__score">${equipo.marcador}</span>
					</div>
				</header>
				<div class="players-list">
					${equipo.jugadores.map((jugador) => `
						<div class="player-row">
							<div class="player-main">
								${construirAvatar(jugador.jugador)}
								<div class="player-info">
									<span class="player-name">${escaparHtml(jugador.jugador)}</span>
									<span class="player-sub">${jugador.goles > 0 ? `${jugador.goles} gol${jugador.goles === 1 ? "" : "es"}` : "Sin goles convertidos"}</span>
								</div>
							</div>
							<div class="player-events">${renderizarEventosJugador(jugador)}</div>
						</div>
					`).join("")}
				</div>
			</section>
		`;
	};

	shell.innerHTML = `
		<header class="match-head">
			<div class="match-meta">
				<span class="match-meta__eyebrow">Resumen del partido</span>
				<span class="match-meta__title">${formatearFecha(partido.fecha)}</span>
				<span class="match-meta__details">Partido ${partido.partidoId}</span>
				<span class="match-meta__scorers"><strong>Goleador${resumenGoleadores.nombres.length > 1 ? "es" : ""}:</strong> ${escaparHtml(resumenGoleadores.texto)}</span>
			</div>
			<div class="scoreboard-wrap">
				<div class="scoreboard">
					<span class="scoreboard__value">${marcadorA}</span>
					<span class="scoreboard__separator">-</span>
					<span class="scoreboard__value">${marcadorB}</span>
				</div>
			</div>
			<div class="match-head__spacer" aria-hidden="true"></div>
		</header>
		<div class="teams-grid">
			${renderEquipo(equipoA)}
			${renderEquipo(equipoB)}
		</div>
	`;
}

function aplicarFiltrosYRenderizar() {
	const partido = obtenerPartidoPorId(estadoResumen.partidos, estadoResumen.filtros.partidoId);
	actualizarResumenFiltros();
	renderizarResumenPartido(partido);
	sincronizarUrlPartido(partido?.partidoId ?? null);
	window.__RESUMEN_MATCH__ = partido;
}

function actualizarFiltrosDesdeAnio() {
	const meses = obtenerMesesDisponibles(estadoResumen.partidos, estadoResumen.filtros.anio);
	if (!meses.includes(estadoResumen.filtros.mes)) {
		estadoResumen.filtros.mes = meses[0] ?? null;
	}

	poblarFiltroMeses();
	actualizarFiltrosDesdeMes();
}

function actualizarFiltrosDesdeMes() {
	const partidos = obtenerPartidosFiltrados(estadoResumen.partidos, estadoResumen.filtros.anio, estadoResumen.filtros.mes);
	if (!partidos.some((partido) => String(partido.partidoId) === String(estadoResumen.filtros.partidoId))) {
		estadoResumen.filtros.partidoId = partidos[0]?.partidoId ?? null;
	}

	poblarFiltroPartidos();
	aplicarFiltrosYRenderizar();
}

function configurarEventosFiltros() {
	document.getElementById("js-filter-year").addEventListener("change", (event) => {
		estadoResumen.filtros.anio = Number(event.target.value);
		actualizarFiltrosDesdeAnio();
	});

	document.getElementById("js-filter-month").addEventListener("change", (event) => {
		estadoResumen.filtros.mes = Number(event.target.value);
		actualizarFiltrosDesdeMes();
	});

	document.getElementById("js-filter-match").addEventListener("change", (event) => {
		estadoResumen.filtros.partidoId = event.target.value;
		aplicarFiltrosYRenderizar();
	});
}

async function iniciarResumen() {
	const shell = document.getElementById("js-summary-shell");
	estadoResumen.partidoUrlSolicitado = leerPartidoDesdeUrl();
	shell.innerHTML = `
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
		const filtrosIniciales = resolverFiltrosIniciales(partidos);

		estadoResumen.filasCrudas = filasNormalizadas;
		estadoResumen.partidos = partidos;
		estadoResumen.filtros.anio = filtrosIniciales.anio;
		estadoResumen.filtros.mes = filtrosIniciales.mes;
		estadoResumen.filtros.partidoId = filtrosIniciales.partidoId;

		window.__RESUMEN_RAW_DATA__ = filasNormalizadas;
		window.__RESUMEN_MATCHES__ = partidos;

		poblarFiltroAnios();
		poblarFiltroMeses();
		poblarFiltroPartidos();
		configurarEventosFiltros();
		aplicarFiltrosYRenderizar();
	} catch (error) {
		console.error(error);
		shell.innerHTML = `
			<div class="empty-state">
				<strong>No se pudieron cargar los datos</strong>
				Revisá la publicación del Google Sheets o la conexión de red para continuar.
			</div>
		`;
	}
}

const resumenApi = {
	normalizarTexto,
	normalizarEntero,
	parsearFecha,
	normalizarFilaCruda,
	construirPartidos,
	obtenerAniosDisponibles,
	obtenerMesesDisponibles,
	obtenerPartidosFiltrados,
	formatearFecha
};

if (typeof window !== "undefined") {
	window.resumenApi = resumenApi;
	if (typeof document !== "undefined") {
		document.addEventListener("DOMContentLoaded", iniciarResumen);
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = resumenApi;
}