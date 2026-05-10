const FILTRO_HISTORICO = "historico";
const OPCIONES_MIN_PARTIDOS = [0, 3, 5, 10];

const estadoDuelos = {
	filasCrudas: [],
	filasNormalizadas: [],
	partidos: [],
	aniosDisponibles: [],
	jugadoresElegibles: [],
	jugadoresDisponibles: [],
	filtros: {
		anio: FILTRO_HISTORICO,
		minPj: 5,
		jugadorA: null,
		jugadorB: null
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
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function obtenerAnioFecha(fecha) {
	if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime()) || fecha.getTime() === 0) {
		return null;
	}
	return fecha.getFullYear();
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
						jugadores: [...equipo.jugadores].sort((actual, siguiente) => actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" }))
					};
				})
				.sort((actual, siguiente) => actual.equipoId.localeCompare(siguiente.equipoId, "es", { numeric: true, sensitivity: "base" }));

			return {
				...partido,
				equipos
			};
		})
		.sort((actual, siguiente) => {
			if (actual.fecha.getTime() === siguiente.fecha.getTime()) {
				return normalizarEntero(siguiente.partidoId) - normalizarEntero(actual.partidoId);
			}
			return siguiente.fecha - actual.fecha;
		});
}

function obtenerAniosDisponibles(filasNormalizadas) {
	return Array.from(new Set(filasNormalizadas.map((fila) => fila.anio).filter((anio) => anio !== null)))
		.sort((actual, siguiente) => siguiente - actual);
}

function obtenerJugadoresDisponibles(filasNormalizadas) {
	return Array.from(new Set(filasNormalizadas.map((fila) => fila.jugador).filter(Boolean)))
		.sort((actual, siguiente) => actual.localeCompare(siguiente, "es", { sensitivity: "base" }));
}

function obtenerJugadoresElegibles(filasNormalizadas, minPj) {
	const conteo = new Map();

	filasNormalizadas.forEach((fila) => {
		if (!fila.jugador) {
			return;
		}
		conteo.set(fila.jugador, (conteo.get(fila.jugador) || 0) + 1);
	});

	return Array.from(conteo.entries())
		.map(([jugador, partidosJugados]) => ({ jugador, partidosJugados }))
		.filter((registro) => registro.partidosJugados >= minPj)
		.sort((actual, siguiente) => actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" }));
}

function encontrarParInicial(partidos, jugadoresDisponibles) {
	const conteoPares = new Map();
	const jugadoresValidos = new Set((jugadoresDisponibles || []).filter(Boolean));

	(partidos || []).forEach((partido) => {
		const nombres = Array.from(new Set((partido.jugadores || [])
			.map((jugador) => jugador.jugador)
			.filter((jugador) => jugador && (!jugadoresValidos.size || jugadoresValidos.has(jugador)))))
			.sort((actual, siguiente) => actual.localeCompare(siguiente, "es", { sensitivity: "base" }));

		for (let indice = 0; indice < nombres.length; indice += 1) {
			for (let cursor = indice + 1; cursor < nombres.length; cursor += 1) {
				const clave = `${nombres[indice]}|||${nombres[cursor]}`;
				conteoPares.set(clave, (conteoPares.get(clave) || 0) + 1);
			}
		}
	});

	const mejorPar = Array.from(conteoPares.entries())
		.sort((actual, siguiente) => {
			if (siguiente[1] !== actual[1]) {
				return siguiente[1] - actual[1];
			}
			return actual[0].localeCompare(siguiente[0], "es", { sensitivity: "base" });
		})[0];

	if (mejorPar) {
		const [jugadorA, jugadorB] = mejorPar[0].split("|||");
		return { jugadorA, jugadorB };
	}

	return {
		jugadorA: jugadoresDisponibles[0] || null,
		jugadorB: jugadoresDisponibles[1] || jugadoresDisponibles[0] || null
	};
}

function resolverFiltroMinPjInicial(valorUrl) {
	if (OPCIONES_MIN_PARTIDOS.includes(valorUrl)) {
		return valorUrl;
	}
	return 5;
}

function filtrarFilasPorAnio(filasNormalizadas, anio) {
	if (anio === FILTRO_HISTORICO) {
		return filasNormalizadas;
	}
	return filasNormalizadas.filter((fila) => fila.anio === Number(anio));
}

function obtenerFilasFiltradasActuales() {
	return filtrarFilasPorAnio(estadoDuelos.filasNormalizadas, estadoDuelos.filtros.anio);
}

function actualizarJugadoresElegibles() {
	const filasFiltradas = obtenerFilasFiltradasActuales();
	estadoDuelos.jugadoresElegibles = obtenerJugadoresElegibles(filasFiltradas, estadoDuelos.filtros.minPj);
	estadoDuelos.jugadoresDisponibles = estadoDuelos.jugadoresElegibles.map((registro) => registro.jugador);
	return filasFiltradas;
}

function asegurarSeleccionJugadoresValida() {
	const jugadores = estadoDuelos.jugadoresDisponibles;

	if (jugadores.length < 2) {
		estadoDuelos.filtros.jugadorA = jugadores[0] || null;
		estadoDuelos.filtros.jugadorB = jugadores[1] || null;
		return;
	}

	const jugadorAValido = jugadores.includes(estadoDuelos.filtros.jugadorA) ? estadoDuelos.filtros.jugadorA : null;
	const jugadorBValido = jugadores.includes(estadoDuelos.filtros.jugadorB) ? estadoDuelos.filtros.jugadorB : null;

	if (jugadorAValido && jugadorBValido && jugadorAValido !== jugadorBValido) {
		estadoDuelos.filtros.jugadorA = jugadorAValido;
		estadoDuelos.filtros.jugadorB = jugadorBValido;
		return;
	}

	const parInicial = encontrarParInicial(construirPartidos(obtenerFilasFiltradasActuales()), jugadores);
	const nuevoJugadorA = jugadorAValido || parInicial.jugadorA || jugadores[0] || null;
	let nuevoJugadorB = jugadorBValido || parInicial.jugadorB || jugadores.find((jugador) => jugador !== nuevoJugadorA) || null;

	if (nuevoJugadorA && nuevoJugadorA === nuevoJugadorB) {
		nuevoJugadorB = jugadores.find((jugador) => jugador !== nuevoJugadorA) || null;
	}

	estadoDuelos.filtros.jugadorA = nuevoJugadorA;
	estadoDuelos.filtros.jugadorB = nuevoJugadorB;
}

function construirRutaImagenJugador(nombreJugador) {
	return `./assets/jugadores/jugador-${normalizarTexto(nombreJugador)}.png`;
}

function construirAvatarJugador(nombreJugador, claseCss = "duel-player__avatar") {
	const imagen = construirRutaImagenJugador(nombreJugador);
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `
		<img
			class="${claseCss}"
			src="${escaparHtml(imagen)}"
			alt="${escaparHtml(nombreJugador)}"
			loading="lazy"
			onerror="this.onerror=null;this.src='${placeholder}';"
		>
	`;
}

function construirUrlJugador(nombreJugador) {
	const parametros = new URLSearchParams({
		anio: "historico",
		minPj: "0",
		jugador: nombreJugador
	});
	return `./Jugadores.html?${parametros.toString()}`;
}

function leerFiltrosDesdeUrl() {
	if (typeof window === "undefined") {
		return null;
	}

	const parametros = new URLSearchParams(window.location.search);
	const anio = parametros.get("anio");
	const minPj = Number.parseInt(parametros.get("minPj") || "", 10);
	const jugadorA = parametros.get("jugadorA");
	const jugadorB = parametros.get("jugadorB");

	return {
		anio,
		minPj: OPCIONES_MIN_PARTIDOS.includes(minPj) ? minPj : null,
		jugadorA: jugadorA ? String(jugadorA).trim() : null,
		jugadorB: jugadorB ? String(jugadorB).trim() : null
	};
}

function sincronizarUrlFiltros() {
	if (typeof window === "undefined") {
		return;
	}

	const url = new URL(window.location.href);
	url.searchParams.set("anio", String(estadoDuelos.filtros.anio));
	url.searchParams.set("minPj", String(estadoDuelos.filtros.minPj));
	if (estadoDuelos.filtros.jugadorA) {
		url.searchParams.set("jugadorA", estadoDuelos.filtros.jugadorA);
	} else {
		url.searchParams.delete("jugadorA");
	}
	if (estadoDuelos.filtros.jugadorB) {
		url.searchParams.set("jugadorB", estadoDuelos.filtros.jugadorB);
	} else {
		url.searchParams.delete("jugadorB");
	}
	window.history.replaceState({}, "", url);
}

function obtenerClaseResultado(resultado) {
	if (resultado === "ganador") {
		return "duel-pill duel-pill--win";
	}
	if (resultado === "empate") {
		return "duel-pill duel-pill--draw";
	}
	if (resultado === "perdedor") {
		return "duel-pill duel-pill--loss";
	}
	return "duel-pill duel-pill--neutral";
}

function obtenerEtiquetaResultado(resultado) {
	if (resultado === "ganador") {
		return "Ganó";
	}
	if (resultado === "empate") {
		return "Empataron";
	}
	if (resultado === "perdedor") {
		return "Perdió";
	}
	return "Sin dato";
}

function obtenerClaseResultadoEquipo(resultado) {
	if (resultado === "ganador") {
		return "duel-pill-team duel-pill-team--win";
	}
	if (resultado === "empate") {
		return "duel-pill-team duel-pill-team--draw";
	}
	if (resultado === "perdedor") {
		return "duel-pill-team duel-pill-team--loss";
	}
	return "duel-pill-team duel-pill-team--neutral";
}

function encontrarJugadorEnPartido(partido, nombreJugador) {
	for (const equipo of partido.equipos || []) {
		const filaJugador = (equipo.jugadores || []).find((jugador) => jugador.jugador === nombreJugador);
		if (filaJugador) {
			return {
				filaJugador,
				equipo
			};
		}
	}
	return null;
}

function construirAnalisisDuelo(partidos, jugadorA, jugadorB) {
	const resumen = {
		jugadorA,
		jugadorB,
		totalCoincidencias: 0,
		juntos: {
			total: 0,
			ganados: 0,
			empatados: 0,
			perdidos: 0,
			puntos: 0,
			golesA: 0,
			golesB: 0,
			golesCombinados: 0,
			partidos: []
		},
		enContra: {
			total: 0,
			victoriasA: 0,
			empates: 0,
			victoriasB: 0,
			golesA: 0,
			golesB: 0,
			partidos: []
		}
	};

	partidos.forEach((partido) => {
		const presenciaA = encontrarJugadorEnPartido(partido, jugadorA);
		const presenciaB = encontrarJugadorEnPartido(partido, jugadorB);

		if (!presenciaA || !presenciaB) {
			return;
		}

		resumen.totalCoincidencias += 1;

		const mismoEquipo = presenciaA.equipo.equipoId === presenciaB.equipo.equipoId;

		if (mismoEquipo) {
			resumen.juntos.total += 1;
			resumen.juntos.puntos += presenciaA.filaJugador.puntos;
			resumen.juntos.golesA += presenciaA.filaJugador.goles;
			resumen.juntos.golesB += presenciaB.filaJugador.goles;
			resumen.juntos.golesCombinados += presenciaA.filaJugador.goles + presenciaB.filaJugador.goles;

			if (presenciaA.filaJugador.resultado === "ganador") {
				resumen.juntos.ganados += 1;
			} else if (presenciaA.filaJugador.resultado === "empate") {
				resumen.juntos.empatados += 1;
			} else {
				resumen.juntos.perdidos += 1;
			}

			resumen.juntos.partidos.push({
				partidoId: partido.partidoId,
				fecha: partido.fecha,
				fechaTexto: partido.fechaTexto,
				resultado: presenciaA.filaJugador.resultado,
				equipo: presenciaA.equipo.equipoId,
				marcadorFavor: presenciaA.equipo.marcador,
				marcadorContra: presenciaA.equipo.recibidos,
				golesA: presenciaA.filaJugador.goles,
				golesB: presenciaB.filaJugador.goles,
				urlPartido: `./Resumen.html?partido=${encodeURIComponent(partido.partidoId)}`
			});
			return;
		}

		resumen.enContra.total += 1;
		resumen.enContra.golesA += presenciaA.filaJugador.goles;
		resumen.enContra.golesB += presenciaB.filaJugador.goles;

		if (presenciaA.filaJugador.resultado === "ganador") {
			resumen.enContra.victoriasA += 1;
		} else if (presenciaA.filaJugador.resultado === "empate") {
			resumen.enContra.empates += 1;
		} else {
			resumen.enContra.victoriasB += 1;
		}

		resumen.enContra.partidos.push({
			partidoId: partido.partidoId,
			fecha: partido.fecha,
			fechaTexto: partido.fechaTexto,
			resultadoA: presenciaA.filaJugador.resultado,
			resultadoB: presenciaB.filaJugador.resultado,
			equipoA: presenciaA.equipo.equipoId,
			equipoB: presenciaB.equipo.equipoId,
			marcadorA: presenciaA.equipo.marcador,
			marcadorB: presenciaB.equipo.marcador,
			golesA: presenciaA.filaJugador.goles,
			golesB: presenciaB.filaJugador.goles,
			urlPartido: `./Resumen.html?partido=${encodeURIComponent(partido.partidoId)}`
		});
	});

	return resumen;
}

function resolverFiltrosIniciales() {
	const filtrosUrl = leerFiltrosDesdeUrl();
	const anioInicial = filtrosUrl?.anio === FILTRO_HISTORICO
		? FILTRO_HISTORICO
		: estadoDuelos.aniosDisponibles.includes(Number(filtrosUrl?.anio))
			? Number(filtrosUrl.anio)
			: FILTRO_HISTORICO;
	const minPjInicial = resolverFiltroMinPjInicial(filtrosUrl?.minPj);

	estadoDuelos.filtros.anio = anioInicial;
	estadoDuelos.filtros.minPj = minPjInicial;
	actualizarJugadoresElegibles();

	const jugadores = estadoDuelos.jugadoresDisponibles;
	const parInicial = encontrarParInicial(construirPartidos(obtenerFilasFiltradasActuales()), jugadores);
	const jugadorA = jugadores.includes(filtrosUrl?.jugadorA) ? filtrosUrl.jugadorA : parInicial.jugadorA;
	let jugadorB = jugadores.includes(filtrosUrl?.jugadorB) ? filtrosUrl.jugadorB : parInicial.jugadorB;
	if (jugadorA && jugadorA === jugadorB) {
		jugadorB = jugadores.find((jugador) => jugador !== jugadorA) || jugadorB;
	}

	estadoDuelos.filtros.jugadorA = jugadorA;
	estadoDuelos.filtros.jugadorB = jugadorB;
}

function poblarFiltroAnios() {
	const selector = document.getElementById("js-filter-year");
	selector.innerHTML = [
		`<option value="${FILTRO_HISTORICO}">Histórico</option>`,
		...estadoDuelos.aniosDisponibles.map((anio) => `<option value="${anio}">${anio}</option>`)
	].join("");
	selector.value = String(estadoDuelos.filtros.anio);
}

function poblarFiltroMinPj() {
	const selector = document.getElementById("js-filter-min-matches");
	selector.innerHTML = OPCIONES_MIN_PARTIDOS.map((valor) => {
		const etiqueta = valor === 0 ? "Todos" : `${valor}+`;
		return `<option value="${valor}">${etiqueta}</option>`;
	}).join("");
	selector.value = String(estadoDuelos.filtros.minPj);
}

function poblarFiltroJugadores() {
	const selectorA = document.getElementById("js-filter-player-a");
	const selectorB = document.getElementById("js-filter-player-b");
	const opciones = estadoDuelos.jugadoresElegibles
		.map((registro) => `<option value="${escaparHtml(registro.jugador)}">${escaparHtml(`${registro.jugador} · ${registro.partidosJugados} PJ`)}</option>`)
		.join("");
	selectorA.innerHTML = opciones;
	selectorB.innerHTML = opciones;
	selectorA.value = estadoDuelos.filtros.jugadorA || "";
	selectorB.value = estadoDuelos.filtros.jugadorB || "";
}

function actualizarResumenFiltros(analisis) {
	document.getElementById("js-active-year").textContent = estadoDuelos.filtros.anio === FILTRO_HISTORICO
		? "Histórico"
		: String(estadoDuelos.filtros.anio);
	document.getElementById("js-active-min-pj").textContent = estadoDuelos.filtros.minPj === 0
		? "Todos"
		: `${estadoDuelos.filtros.minPj}+`;
	document.getElementById("js-active-shared").textContent = String(analisis.juntos.total);
	document.getElementById("js-active-against").textContent = String(analisis.enContra.total);
	document.getElementById("js-active-total").textContent = String(analisis.totalCoincidencias);
}

function renderizarCardResumen(label, value, detail = "", accent = "") {
	return `
		<article class="summary-card">
			<span class="summary-card__label">${escaparHtml(label)}</span>
			<strong class="summary-card__value${accent ? ` ${accent}` : ""}">${escaparHtml(value)}</strong>
			${detail ? `<span class="summary-card__detail">${escaparHtml(detail)}</span>` : ""}
		</article>
	`;
}

function renderizarCardBalanceEquipo(analisis) {
	return `
		<article class="duel-team-focus">
			<div class="duel-team-focus__inner">
				<span class="duel-team-focus__eyebrow">Historial en equipo</span>
				<div class="duel-team-focus__record">
					<span class="duel-team-focus__record-part duel-team-focus__record-part--win">${escaparHtml(String(analisis.juntos.ganados))}</span>
					<span class="duel-team-focus__record-separator">-</span>
					<span class="duel-team-focus__record-part duel-team-focus__record-part--draw">${escaparHtml(String(analisis.juntos.empatados))}</span>
					<span class="duel-team-focus__record-separator">-</span>
					<span class="duel-team-focus__record-part duel-team-focus__record-part--loss">${escaparHtml(String(analisis.juntos.perdidos))}</span>
				</div>
				<span class="duel-team-focus__legend">Ganados · Empatados · Perdidos</span>
				<span class="duel-team-focus__meta"><span class="duel-team-focus__meta-player duel-team-focus__meta-player--left">${escaparHtml(String(analisis.juntos.golesA))} goles de ${escaparHtml(analisis.jugadorA)}</span><span class="duel-team-focus__meta-separator">·</span><span class="duel-team-focus__meta-player duel-team-focus__meta-player--right">${escaparHtml(String(analisis.juntos.golesB))} de ${escaparHtml(analisis.jugadorB)}</span></span>
			</div>
		</article>
	`;
}

function renderizarCardHistorialRival(analisis) {
	return `
		<article class="duel-rival-focus">
			<div class="duel-rival-focus__side duel-rival-focus__side--left">
				<span class="duel-rival-focus__player">${escaparHtml(analisis.jugadorA)}</span>
				<strong class="duel-rival-focus__value duel-rival-focus__value--win">${escaparHtml(String(analisis.enContra.victoriasA))}</strong>
				<span class="duel-rival-focus__caption">Victorias</span>
			</div>
			<div class="duel-rival-focus__center">
				<span class="duel-rival-focus__eyebrow">Historial directo</span>
				<strong class="duel-rival-focus__record"><span class="duel-rival-focus__record-part duel-rival-focus__record-part--left">${escaparHtml(String(analisis.enContra.victoriasA))}</span><span class="duel-rival-focus__record-separator">-</span><span class="duel-rival-focus__record-part duel-rival-focus__record-part--draw">${escaparHtml(String(analisis.enContra.empates))}</span><span class="duel-rival-focus__record-separator">-</span><span class="duel-rival-focus__record-part duel-rival-focus__record-part--right">${escaparHtml(String(analisis.enContra.victoriasB))}</span></strong>
				<span class="duel-rival-focus__legend">${escaparHtml(analisis.jugadorA)} · Empates · ${escaparHtml(analisis.jugadorB)}</span>
				<span class="duel-rival-focus__meta"><span class="duel-rival-focus__meta-player duel-rival-focus__meta-player--left">${escaparHtml(String(analisis.enContra.golesA))} goles de ${escaparHtml(analisis.jugadorA)}</span><span class="duel-rival-focus__meta-separator">·</span><span class="duel-rival-focus__meta-player duel-rival-focus__meta-player--right">${escaparHtml(String(analisis.enContra.golesB))} de ${escaparHtml(analisis.jugadorB)}</span></span>
			</div>
			<div class="duel-rival-focus__side duel-rival-focus__side--right">
				<span class="duel-rival-focus__player">${escaparHtml(analisis.jugadorB)}</span>
				<strong class="duel-rival-focus__value duel-rival-focus__value--loss">${escaparHtml(String(analisis.enContra.victoriasB))}</strong>
				<span class="duel-rival-focus__caption">Victorias</span>
			</div>
		</article>
	`;
}

function renderizarFilaCompartido(partido, jugadorA, jugadorB) {
	return `
		<article class="duel-row">
			<div class="duel-row__meta">
				<span class="duel-row__date">${escaparHtml(partido.fechaTexto || formatearFecha(partido.fecha))}</span>
				<span class="duel-row__match">Partido ${escaparHtml(partido.partidoId)}</span>
			</div>
			<div class="duel-row__summary">
				<span class="duel-row__score">${escaparHtml(String(partido.marcadorFavor))}-${escaparHtml(String(partido.marcadorContra))}</span>
				<span class="${obtenerClaseResultadoEquipo(partido.resultado)}">${escaparHtml(obtenerEtiquetaResultado(partido.resultado))}</span>
				<span class="duel-row__mini">Goles: ${escaparHtml(jugadorA)} ${escaparHtml(String(partido.golesA))} · ${escaparHtml(jugadorB)} ${escaparHtml(String(partido.golesB))}</span>
			</div>
			<a class="duel-row__link" href="${escaparHtml(partido.urlPartido)}">Ver partido</a>
		</article>
	`;
}

function renderizarFilaEnContra(partido, jugadorA, jugadorB) {
	const etiqueta = partido.resultadoA === "ganador"
		? `${jugadorA} ganó el duelo`
		: partido.resultadoA === "perdedor"
			? `${jugadorB} ganó el duelo`
			: "Empataron el duelo";

	return `
		<article class="duel-row">
			<div class="duel-row__meta">
				<span class="duel-row__date">${escaparHtml(partido.fechaTexto || formatearFecha(partido.fecha))}</span>
				<span class="duel-row__match">Partido ${escaparHtml(partido.partidoId)}</span>
			</div>
			<div class="duel-row__summary">
				<span class="duel-row__score">${escaparHtml(String(partido.marcadorA))}-${escaparHtml(String(partido.marcadorB))}</span>
				<span class="${obtenerClaseResultado(partido.resultadoA)}">${escaparHtml(etiqueta)}</span>
				<span class="duel-row__mini">Goles: ${escaparHtml(jugadorA)} ${escaparHtml(String(partido.golesA))} · ${escaparHtml(jugadorB)} ${escaparHtml(String(partido.golesB))}</span>
			</div>
			<a class="duel-row__link" href="${escaparHtml(partido.urlPartido)}">Ver partido</a>
		</article>
	`;
}

function renderizarListaPartidos(partidos, renderizador, emptyTitle, emptyText, jugadorA, jugadorB) {
	if (!partidos.length) {
		return `
			<div class="empty-state empty-state--soft">
				<strong>${escaparHtml(emptyTitle)}</strong>
				<span>${escaparHtml(emptyText)}</span>
			</div>
		`;
	}

	return partidos.map((partido) => renderizador(partido, jugadorA, jugadorB)).join("");
}

function renderizarDesplegablePartidos({
	titulo,
	contador,
	descripcion,
	contenido,
	abierto = false
}) {
	return `
		<details class="duel-accordion"${abierto ? " open" : ""}>
			<summary class="duel-accordion__summary">
				<div class="duel-accordion__summary-main">
					<strong>${escaparHtml(titulo)}</strong>
					<span>${escaparHtml(descripcion)}</span>
				</div>
				<span class="duel-accordion__badge">${escaparHtml(String(contador))}</span>
			</summary>
			<div class="duel-accordion__content">
				${contenido}
			</div>
		</details>
	`;
}

function renderizarDuelos(analisis) {
	const shell = document.getElementById("js-duels-shell");
	const { jugadorA, jugadorB } = analisis;

	if (!jugadorA || !jugadorB) {
		shell.innerHTML = `
			<div class="panel empty-state empty-state--panel">
				<strong>No hay jugadores suficientes</strong>
				<span>Se necesitan al menos dos jugadores para construir duelos.</span>
			</div>
		`;
		return;
	}

	shell.innerHTML = `
		<section class="duel-hero panel">
			<div class="duel-hero__players">
				<div class="duel-player">
					${construirAvatarJugador(jugadorA)}
					<div>
						<span class="duel-player__label duel-player__label--a">Jugador A</span>
						<h2 class="duel-player__name"><a href="${escaparHtml(construirUrlJugador(jugadorA))}">${escaparHtml(jugadorA)}</a></h2>
					</div>
				</div>
				<div class="duel-hero__versus">vs</div>
				<div class="duel-player duel-player--right">
					<div>
						<span class="duel-player__label duel-player__label--b">Jugador B</span>
						<h2 class="duel-player__name"><a href="${escaparHtml(construirUrlJugador(jugadorB))}">${escaparHtml(jugadorB)}</a></h2>
					</div>
					${construirAvatarJugador(jugadorB)}
				</div>
			</div>
		</section>

		<section class="duel-panels">
			<article class="panel duel-section duel-section--versus">
				<header class="duel-section__head">
					<div>
						<h3>Como rivales</h3>
						<p>El balance directo manda; los goles quedan como contexto dentro del mismo bloque.</p>
					</div>
					<span class="duel-section__badge">${escaparHtml(String(analisis.enContra.total))} PJ</span>
				</header>
				${renderizarCardHistorialRival(analisis)}
				${renderizarDesplegablePartidos({
					titulo: "Partidos del duelo directo",
					contador: `${analisis.enContra.total} PJ`,
					descripcion: analisis.enContra.total
						? `Abrir lista completa de cruces entre ${jugadorA} y ${jugadorB}`
						: "No hay cruces para mostrar con este filtro",
					contenido: renderizarListaPartidos(analisis.enContra.partidos, renderizarFilaEnContra, "Nunca se enfrentaron", "Todavía no hay cruces directos entre ellos con este filtro.", jugadorA, jugadorB),
					abierto: false
				})}
			</article>

			<article class="panel duel-section duel-section--mates duel-section--secondary">
				<header class="duel-section__head">
					<div>
						<h3>En equipo</h3>
						<p>El balance compartido queda al centro; los goles aparecen como contexto dentro del mismo bloque.</p>
					</div>
					<span class="duel-section__badge">${escaparHtml(String(analisis.juntos.total))} PJ</span>
				</header>
				${renderizarCardBalanceEquipo(analisis)}
				${renderizarDesplegablePartidos({
					titulo: "Partidos jugando en equipo",
					contador: `${analisis.juntos.total} PJ`,
					descripcion: analisis.juntos.total
						? `Abrir lista completa de partidos compartidos por ${jugadorA} y ${jugadorB}`
						: "No hay partidos compartidos para mostrar con este filtro",
					contenido: renderizarListaPartidos(analisis.juntos.partidos, renderizarFilaCompartido, "Nunca jugaron juntos", "Todavía no hay partidos compartidos con este filtro.", jugadorA, jugadorB),
					abierto: false
				})}
			</article>
		</section>
	`;
}

function aplicarFiltrosYRenderizar() {
	const filasFiltradas = obtenerFilasFiltradasActuales();
	const partidos = construirPartidos(filasFiltradas);
	const analisis = construirAnalisisDuelo(partidos, estadoDuelos.filtros.jugadorA, estadoDuelos.filtros.jugadorB);
	actualizarResumenFiltros(analisis);
	sincronizarUrlFiltros();
	renderizarDuelos(analisis);
	if (typeof window !== "undefined") {
		window.__DUELOS_ANALISIS__ = analisis;
	}
}

function asegurarJugadoresDistintos(origen) {
	if (!estadoDuelos.filtros.jugadorA || !estadoDuelos.filtros.jugadorB) {
		return;
	}
	if (estadoDuelos.filtros.jugadorA !== estadoDuelos.filtros.jugadorB) {
		return;
	}

	const reemplazo = estadoDuelos.jugadoresDisponibles.find((jugador) => jugador !== estadoDuelos.filtros.jugadorA) || estadoDuelos.filtros.jugadorB;
	if (origen === "A") {
		estadoDuelos.filtros.jugadorB = reemplazo;
	} else {
		estadoDuelos.filtros.jugadorA = reemplazo;
	}
}

function configurarEventosFiltros() {
	document.getElementById("js-filter-year").addEventListener("change", (event) => {
		const valor = event.target.value;
		estadoDuelos.filtros.anio = valor === FILTRO_HISTORICO ? FILTRO_HISTORICO : Number(valor);
		actualizarJugadoresElegibles();
		asegurarSeleccionJugadoresValida();
		poblarFiltroJugadores();
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-filter-min-matches").addEventListener("change", (event) => {
		estadoDuelos.filtros.minPj = Number.parseInt(event.target.value, 10) || 0;
		actualizarJugadoresElegibles();
		asegurarSeleccionJugadoresValida();
		poblarFiltroJugadores();
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-filter-player-a").addEventListener("change", (event) => {
		estadoDuelos.filtros.jugadorA = event.target.value;
		asegurarJugadoresDistintos("A");
		poblarFiltroJugadores();
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-filter-player-b").addEventListener("change", (event) => {
		estadoDuelos.filtros.jugadorB = event.target.value;
		asegurarJugadoresDistintos("B");
		poblarFiltroJugadores();
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-swap-players").addEventListener("click", () => {
		const anteriorA = estadoDuelos.filtros.jugadorA;
		estadoDuelos.filtros.jugadorA = estadoDuelos.filtros.jugadorB;
		estadoDuelos.filtros.jugadorB = anteriorA;
		poblarFiltroJugadores();
		aplicarFiltrosYRenderizar();
	});
}

async function inicializarDuelos() {
	const shell = document.getElementById("js-duels-shell");
	try {
		const lector = typeof window !== "undefined" ? window.lectorDatos : null;
		if (!lector?.obtenerFilasPartidos) {
			throw new Error("No se encontró el lector de datos.");
		}

		estadoDuelos.filasCrudas = await lector.obtenerFilasPartidos();
		estadoDuelos.filasNormalizadas = estadoDuelos.filasCrudas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		estadoDuelos.partidos = construirPartidos(estadoDuelos.filasNormalizadas);
		estadoDuelos.aniosDisponibles = obtenerAniosDisponibles(estadoDuelos.filasNormalizadas);
		resolverFiltrosIniciales();
		poblarFiltroAnios();
		poblarFiltroMinPj();
		poblarFiltroJugadores();
		configurarEventosFiltros();
		aplicarFiltrosYRenderizar();
	} catch (error) {
		console.error("No se pudieron cargar los duelos:", error);
		if (shell) {
			shell.innerHTML = `
				<div class="panel empty-state empty-state--panel">
					<strong>No se pudieron cargar los duelos</strong>
					<span>${escaparHtml(error.message || "Revisá la conexión con la hoja de datos.")}</span>
				</div>
			`;
		}
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("DOMContentLoaded", inicializarDuelos);
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		normalizarFilaCruda,
		construirPartidos,
		obtenerAniosDisponibles,
		obtenerJugadoresDisponibles,
		filtrarFilasPorAnio,
		construirAnalisisDuelo,
		formatearFecha
	};
}
