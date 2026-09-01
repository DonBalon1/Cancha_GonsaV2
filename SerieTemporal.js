const FILTRO_HISTORICO = "historico";
const OPCIONES_MIN_PARTIDOS = [0, 3, 5, 10];
const ANIOS_PERMITIDOS_SERIE_TEMPORAL = [2026, 2025, 2024, 2023];

const estadoSerieTemporal = {
	filasCrudas: [],
	aniosDisponibles: [],
	filtros: {
		anio: FILTRO_HISTORICO,
		minPartidos: 5
	}
};

const MESES_CORTOS = [
	"ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
	"JUL", "AGO", "SEP", "OCT", "NOV", "DIC"
];

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
	const dia = fecha.getDate();
	const mes = fecha.getMonth() + 1;
	const anio = String(fecha.getFullYear()).slice(-2);
	return `${dia}/${mes}/${anio}`;
}

function obtenerAnioFecha(fecha) {
	if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) {
		return null;
	}
	return fecha.getFullYear();
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
		anio: obtenerAnioFecha(fecha),
		equipo: String(fila.Equipo || fila.equipo || "").trim(),
		jugador: String(fila.Jugador || fila.jugador || "").trim(),
		resultado: normalizarTexto(fila.Resultado || fila.resultado || ""),
		goles: normalizarEntero(fila.Goles || fila.goles),
		puntos: normalizarEntero(fila.Puntos || fila.puntos)
	};
}

function obtenerAniosDisponibles(filasNormalizadas) {
	const aniosDisponibles = Array.from(
		new Set(
			filasNormalizadas
				.map((fila) => fila.anio)
				.filter((anio) => anio !== null)
		)
	).sort((a, b) => b - a);

	const aniosPermitidos = ANIOS_PERMITIDOS_SERIE_TEMPORAL.filter((anio) => aniosDisponibles.includes(anio));
	return aniosPermitidos.length ? aniosPermitidos : aniosDisponibles;
}

function filtrarFilasPorAnio(filasNormalizadas, anio) {
	if (anio === FILTRO_HISTORICO) {
		return filasNormalizadas;
	}
	return filasNormalizadas.filter((fila) => fila.anio === Number(anio));
}

function construirPartidos(filasFiltradas) {
	const partidosMap = new Map();

	filasFiltradas.forEach((fila) => {
		if (!partidosMap.has(fila.partidoId)) {
			partidosMap.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				fechaTexto: fila.fechaTexto,
				presencias: new Map()
			});
		}

		const partido = partidosMap.get(fila.partidoId);
		partido.presencias.set(fila.jugador, {
			resultado: fila.resultado,
			goles: fila.goles
		});
	});

	return Array.from(partidosMap.values()).sort((a, b) => {
		if (a.fecha.getTime() === b.fecha.getTime()) {
			return normalizarEntero(a.partidoId) - normalizarEntero(b.partidoId);
		}
		return a.fecha - b.fecha;
	});
}

function construirJugadores(filasFiltradas, totalPartidos) {
	const jugadoresMap = new Map();

	filasFiltradas.forEach((fila) => {
		if (!jugadoresMap.has(fila.jugador)) {
			jugadoresMap.set(fila.jugador, {
				jugador: fila.jugador,
				claveImagen: normalizarTexto(fila.jugador),
				puntos: 0,
				goles: 0,
				partidosJugados: 0
			});
		}

		const jugador = jugadoresMap.get(fila.jugador);
		jugador.puntos += fila.puntos;
		jugador.goles += fila.goles;
		jugador.partidosJugados += 1;
	});

	const jugadores = Array.from(jugadoresMap.values())
		.map((jugador) => ({
			...jugador,
			puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
			porcentajePresencias: totalPartidos ? (jugador.partidosJugados / totalPartidos) * 100 : 0
		}))
		.sort((a, b) => {
			if (b.puntos !== a.puntos) {
				return b.puntos - a.puntos;
			}
			if (b.puntosPorPartido !== a.puntosPorPartido) {
				return b.puntosPorPartido - a.puntosPorPartido;
			}
			if (b.goles !== a.goles) {
				return b.goles - a.goles;
			}
			return a.jugador.localeCompare(b.jugador, "es", { sensitivity: "base" });
		});

	let posicion = 0;
	let puntosAnteriores = null;

	return jugadores.map((jugador) => {
		if (jugador.puntos !== puntosAnteriores) {
			posicion += 1;
			puntosAnteriores = jugador.puntos;
		}
		return {
			...jugador,
			posicion
		};
	});
}

function filtrarJugadoresPorMinPartidos(jugadores, minPartidos) {
	if (!Number.isFinite(minPartidos) || minPartidos <= 0) {
		return jugadores;
	}

	return jugadores.filter((jugador) => jugador.partidosJugados >= minPartidos);
}

function obtenerClaseResultado(resultado) {
	if (resultado === "ganador") {
		return "win";
	}
	if (resultado === "empate") {
		return "draw";
	}
	if (resultado === "perdedor") {
		return "loss";
	}
	return "absent";
}

function obtenerNivelGoles(goles) {
	const golesNormalizados = normalizarEntero(goles);
	if (golesNormalizados <= 0) {
		return 0;
	}
	if (golesNormalizados >= 5) {
		return 5;
	}
	return golesNormalizados;
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

function renderizarMatriz(jugadores, partidos) {
	const contenedor = document.getElementById("js-matrix-wrap");

	if (!jugadores.length || !partidos.length) {
		contenedor.innerHTML = `
			<div class="empty-state">
				<strong>No hay datos para mostrar</strong>
				Probá con otro año para construir la serie temporal.
			</div>
		`;
		return;
	}

	const placeholder = "./assets/jugadores/jugador-vacio.png";

	const headerPartidos = partidos.map((partido) => `
		<th scope="col">
			<div class="header-cell">
				<span class="header-cell__match">#${escaparHtml(partido.partidoId)}</span>
				<span class="header-cell__date">
					<a class="header-cell__date-link" href="./Resumen.html?partido=${encodeURIComponent(partido.partidoId)}" aria-label="Ver resumen del partido ${escaparHtml(partido.partidoId)}">
						${escaparHtml(formatearFechaCorta(partido.fecha))}
					</a>
				</span>
			</div>
		</th>
	`).join("");

	const filas = jugadores.map((jugador) => {
		const iconoPosicion = obtenerIconoPosicion(jugador.posicion);
		const celdas = partidos.map((partido) => {
			const evento = partido.presencias.get(jugador.jugador);
			if (!evento) {
				return `
					<td class="result-cell" title="Ausente">
						<span class="result-dot result-dot--absent">AUS</span>
					</td>
				`;
			}

			const claseResultado = obtenerClaseResultado(evento.resultado);
			const nivelGoles = obtenerNivelGoles(evento.goles);
			const etiquetaResultado = claseResultado === "win"
				? "Victoria"
				: claseResultado === "draw"
					? "Empate"
					: "Derrota";

			return `
				<td class="result-cell" title="${etiquetaResultado}: ${evento.goles} gol${evento.goles === 1 ? "" : "es"}">
					<span class="result-dot result-dot--${claseResultado} result-dot--g${nivelGoles}">${evento.goles}</span>
				</td>
			`;
		}).join("");

		return `
			<tr>
				<td class="sticky-col sticky-col--rank position-cell">
					<span class="rank-badge" data-rank="${jugador.posicion <= 3 ? jugador.posicion : 0}">
						${iconoPosicion ? `<span class="rank-badge__icon">${iconoPosicion}</span>` : ""}
						<span>${jugador.posicion}</span>
					</span>
				</td>
				<td class="sticky-col sticky-col--player">
					<div class="player-cell">
						<img
							class="player-avatar"
							src="./assets/jugadores/jugador-${jugador.claveImagen}.png"
							alt="${escaparHtml(jugador.jugador)}"
							loading="lazy"
							onerror="this.onerror=null;this.src='${placeholder}';"
						>
						<div class="player-meta">
							<span class="player-name">${escaparHtml(jugador.jugador)}</span>
							<span class="player-stats"><span class="player-stats__pts">${jugador.puntos}PTS</span>, ${jugador.partidosJugados}PJ, ${jugador.goles}G</span>
						</div>
					</div>
				</td>
				${celdas}
			</tr>
		`;
	}).join("");

	contenedor.innerHTML = `
		<table class="temporal-table" aria-label="Matriz temporal de jugadores">
			<thead>
				<tr>
					<th scope="col" class="sticky-col sticky-col--rank">#</th>
					<th scope="col" class="sticky-col sticky-col--player">Jugador</th>
					${headerPartidos}
				</tr>
			</thead>
			<tbody>
				${filas}
			</tbody>
		</table>
	`;
}

function poblarFiltroAnios() {
	const selector = document.getElementById("js-filter-year");
	selector.innerHTML = [
		`<option value="${FILTRO_HISTORICO}" disabled>Histórico (bloqueado)</option>`,
		...estadoSerieTemporal.aniosDisponibles.map((anio) => `<option value="${anio}">${anio}</option>`)
	].join("");
	selector.value = String(estadoSerieTemporal.filtros.anio);
}

function poblarFiltroMinPartidos() {
	const selector = document.getElementById("js-filter-min-matches");
	selector.innerHTML = OPCIONES_MIN_PARTIDOS
		.map((valor) => `<option value="${valor}">${valor === 0 ? "Todos" : `${valor}+`}</option>`)
		.join("");
	selector.value = String(estadoSerieTemporal.filtros.minPartidos);
}

function actualizarResumen(jugadores, partidos) {
	document.getElementById("js-active-year").textContent =
		estadoSerieTemporal.filtros.anio === FILTRO_HISTORICO
			? "Histórico"
			: String(estadoSerieTemporal.filtros.anio);
	document.getElementById("js-active-min-matches").textContent =
		estadoSerieTemporal.filtros.minPartidos === 0 ? "Todos" : `${estadoSerieTemporal.filtros.minPartidos}+`;
	document.getElementById("js-active-players").textContent = String(jugadores.length);
	document.getElementById("js-active-matches").textContent = String(partidos.length);
}

function renderizarSerieTemporal() {
	const filasNormalizadas = estadoSerieTemporal.filasCrudas.map(normalizarFilaCruda);
	const filasFiltradas = filtrarFilasPorAnio(filasNormalizadas, estadoSerieTemporal.filtros.anio);
	const partidos = construirPartidos(filasFiltradas);
	const jugadores = construirJugadores(filasFiltradas, partidos.length);
	const jugadoresVisibles = filtrarJugadoresPorMinPartidos(jugadores, estadoSerieTemporal.filtros.minPartidos);

	renderizarMatriz(jugadoresVisibles, partidos);
	actualizarResumen(jugadoresVisibles, partidos);
}

function resolverFiltroAnioInicial() {
	estadoSerieTemporal.filtros.anio = estadoSerieTemporal.aniosDisponibles[0] ?? FILTRO_HISTORICO;
}

function manejarCambioAnio(evento) {
	const valor = evento.target.value;
	if (valor !== FILTRO_HISTORICO) {
		estadoSerieTemporal.filtros.anio = Number(valor);
		renderizarSerieTemporal();
	}
}

function manejarCambioMinPartidos(evento) {
	const valor = Number.parseInt(evento.target.value, 10);
	estadoSerieTemporal.filtros.minPartidos = OPCIONES_MIN_PARTIDOS.includes(valor) ? valor : 0;
	renderizarSerieTemporal();
}

async function inicializarSerieTemporal() {
	if (!window.lectorDatos || typeof window.lectorDatos.obtenerFilasPartidos !== "function") {
		throw new Error("No se encontró el lector de datos.");
	}

	estadoSerieTemporal.filasCrudas = await window.lectorDatos.obtenerFilasPartidos();
	const filasNormalizadas = estadoSerieTemporal.filasCrudas.map(normalizarFilaCruda);
	estadoSerieTemporal.aniosDisponibles = obtenerAniosDisponibles(filasNormalizadas);

	resolverFiltroAnioInicial();
	poblarFiltroAnios();
	poblarFiltroMinPartidos();
	renderizarSerieTemporal();

	document
		.getElementById("js-filter-year")
		.addEventListener("change", manejarCambioAnio);

	document
		.getElementById("js-filter-min-matches")
		.addEventListener("change", manejarCambioMinPartidos);
}

inicializarSerieTemporal().catch((error) => {
	const contenedor = document.getElementById("js-matrix-wrap");
	contenedor.innerHTML = `
		<div class="empty-state">
			<strong>No pudimos cargar la Serie Temporal</strong>
			<span>${escaparHtml(error?.message || "Error desconocido al obtener los datos")}</span>
		</div>
	`;
	console.error(error);
});
