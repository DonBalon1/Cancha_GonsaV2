const MAX_PARTIDOS_RECIENTES = 5;
const FILTRO_HISTORICO = "historico";
const OPCIONES_MIN_PARTIDOS = [0, 3, 5, 10];

const estadoJugadores = {
	filasCrudas: [],
	aniosDisponibles: [],
	filtrosUrlIniciales: null,
	minPartidosPersonalizado: false,
	filtros: {
		anio: FILTRO_HISTORICO,
		minPartidos: 5,
		jugador: null
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

function formatearDecimal(valor) {
	return Number(valor || 0).toFixed(1);
}

function formatearPorcentaje(valor) {
	return `${Math.round(valor || 0)}%`;
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
	if (anio === FILTRO_HISTORICO) {
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
				fechaTexto: fila.fechaTexto,
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

function construirEstadisticasJugadores(filasNormalizadas, partidosMap) {
	const jugadores = new Map();
	const totalPartidos = partidosMap.size;
	const vecesGoleadorMap = calcularVecesGoleador(partidosMap);

	filasNormalizadas.forEach((fila) => {
		const partido = partidosMap.get(fila.partidoId);
		const resumenEquipo = partido?.equipos.get(fila.equipo) || {
			golesAFavor: fila.goles,
			golesEnContra: 0,
			diferencia: fila.goles
		};

		if (!jugadores.has(fila.jugador)) {
			jugadores.set(fila.jugador, {
				jugador: fila.jugador,
				claveImagen: normalizarTexto(fila.jugador),
				puntos: 0,
				ganados: 0,
				empatados: 0,
				perdidos: 0,
				goles: 0,
				autogoles: 0,
				partidosJugados: 0,
				partidosConGol: 0,
				diferenciaGol: 0,
				historial: []
			});
		}

		const jugador = jugadores.get(fila.jugador);
		const resultadoNormalizado = normalizarTexto(fila.resultado);
		const rival = Array.from(partido?.equipos.values() || []).find((equipo) => equipo.equipo !== fila.equipo) || {
			golesAFavor: 0
		};

		jugador.puntos += fila.puntos;
		jugador.goles += fila.goles;
		jugador.autogoles += fila.autogoles;
		jugador.partidosJugados += 1;
		jugador.diferenciaGol += resumenEquipo.diferencia;

		if (fila.goles > 0) {
			jugador.partidosConGol += 1;
		}

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
			goles: fila.goles,
			autogoles: fila.autogoles,
			puntos: fila.puntos,
			marcadorFavor: resumenEquipo.golesAFavor,
			marcadorContra: resumenEquipo.golesEnContra,
			diferencia: resumenEquipo.diferencia,
			rivalMarcador: rival.golesAFavor || resumenEquipo.golesEnContra
		});
	});

	return Array.from(jugadores.values())
		.map((jugador) => {
			const historialAsc = [...jugador.historial].sort((actual, siguiente) => {
				if (actual.fecha.getTime() === siguiente.fecha.getTime()) {
					return normalizarEntero(actual.partidoId) - normalizarEntero(siguiente.partidoId);
				}
				return actual.fecha - siguiente.fecha;
			});

			return {
				...jugador,
				vecesGoleador: vecesGoleadorMap.get(jugador.jugador) || 0,
				efectividadGol: jugador.partidosJugados ? (jugador.partidosConGol / jugador.partidosJugados) * 100 : 0,
				porcentajeVictorias: jugador.partidosJugados ? (jugador.ganados / jugador.partidosJugados) * 100 : 0,
				porcentajePresencias: totalPartidos ? (jugador.partidosJugados / totalPartidos) * 100 : 0,
				puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
				golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0,
				ultimosPartidos: historialAsc.slice(-MAX_PARTIDOS_RECIENTES),
				historialOrdenado: [...historialAsc].sort((actual, siguiente) => {
					if (actual.fecha.getTime() === siguiente.fecha.getTime()) {
						return normalizarEntero(siguiente.partidoId) - normalizarEntero(actual.partidoId);
					}
					return siguiente.fecha - actual.fecha;
				})
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

function calcularPosicionesPorGoles(estadisticasJugadores) {
	let golesAnteriores = null;
	let posicionActual = 0;

	const ranking = [...estadisticasJugadores]
		.sort((actual, siguiente) => {
			if (siguiente.goles !== actual.goles) {
				return siguiente.goles - actual.goles;
			}
			if (siguiente.golesPorPartido !== actual.golesPorPartido) {
				return siguiente.golesPorPartido - actual.golesPorPartido;
			}
			if (siguiente.vecesGoleador !== actual.vecesGoleador) {
				return siguiente.vecesGoleador - actual.vecesGoleador;
			}
			return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
		})
		.map((jugador) => {
			if (jugador.goles !== golesAnteriores) {
				posicionActual += 1;
				golesAnteriores = jugador.goles;
			}

			return {
				jugador: jugador.jugador,
				posicionGoleadora: posicionActual
			};
		});

	return new Map(ranking.map((registro) => [registro.jugador, registro.posicionGoleadora]));
}

function leerFiltrosDesdeUrl() {
	if (typeof window === "undefined") {
		return null;
	}

	const parametros = new URLSearchParams(window.location.search);
	const anio = parametros.get("anio");
	const jugador = parametros.get("jugador");
	const minPj = Number.parseInt(parametros.get("minPj") || "", 10);

	return {
		anio,
		minPartidos: OPCIONES_MIN_PARTIDOS.includes(minPj) ? minPj : null,
		jugador: jugador ? String(jugador).trim() : null
	};
}

function sincronizarUrlFiltros(jugador) {
	if (typeof window === "undefined") {
		return;
	}

	const url = new URL(window.location.href);
	url.searchParams.set("anio", String(estadoJugadores.filtros.anio));
	url.searchParams.set("minPj", String(estadoJugadores.filtros.minPartidos));

	if (jugador?.jugador) {
		url.searchParams.set("jugador", jugador.jugador);
	} else {
		url.searchParams.delete("jugador");
	}

	window.history.replaceState({}, "", url);
}

function resolverFiltroAnioInicial(aniosDisponibles, valorUrl) {
	if (valorUrl === FILTRO_HISTORICO) {
		return FILTRO_HISTORICO;
	}

	const anioNumero = Number(valorUrl);
	if (Number.isInteger(anioNumero) && aniosDisponibles.includes(anioNumero)) {
		return anioNumero;
	}

	return aniosDisponibles[0] ?? FILTRO_HISTORICO;
}

function obtenerMinimoPartidosPorDefecto(anio) {
	return anio === FILTRO_HISTORICO ? 5 : 3;
}

function resolverFiltroMinPartidosInicial(valorUrl, anio) {
	if (OPCIONES_MIN_PARTIDOS.includes(valorUrl)) {
		return valorUrl;
	}

	return obtenerMinimoPartidosPorDefecto(anio);
}

function poblarFiltroAnios() {
	const selector = document.getElementById("js-filter-year");
	selector.innerHTML = [
		`<option value="${FILTRO_HISTORICO}">Histórico</option>`,
		...estadoJugadores.aniosDisponibles.map((anio) => `<option value="${anio}">${anio}</option>`)
	].join("");
	selector.value = String(estadoJugadores.filtros.anio);
}

function poblarFiltroMinPartidos() {
	const selector = document.getElementById("js-filter-min-matches");
	selector.innerHTML = OPCIONES_MIN_PARTIDOS.map((valor) => {
		const etiqueta = valor === 0 ? "Todos" : `${valor}+`;
		return `<option value="${valor}">${etiqueta}</option>`;
	}).join("");
	selector.value = String(estadoJugadores.filtros.minPartidos);
}

function construirLabelJugadorOpcion(jugador) {
	return `${jugador.jugador} · ${jugador.partidosJugados} PJ`;
}

function poblarFiltroJugadores(estadisticasJugadores) {
	const selector = document.getElementById("js-filter-player");
	const minPartidos = estadoJugadores.filtros.minPartidos;
	const visiblesOrdenados = estadisticasJugadores
		.filter((jugador) => jugador.partidosJugados >= minPartidos)
		.sort((actual, siguiente) => actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" }));
	const jugadorSeleccionado = estadisticasJugadores.find((jugador) => jugador.jugador === estadoJugadores.filtros.jugador) || null;
	const opciones = [...visiblesOrdenados];

	if (jugadorSeleccionado && !opciones.some((jugador) => jugador.jugador === jugadorSeleccionado.jugador)) {
		opciones.unshift(jugadorSeleccionado);
	}

	selector.innerHTML = opciones.map((jugador) => (
		`<option value="${escaparHtml(jugador.jugador)}">${escaparHtml(construirLabelJugadorOpcion(jugador))}</option>`
	)).join("");

	if (!jugadorSeleccionado) {
		estadoJugadores.filtros.jugador = opciones[0]?.jugador ?? estadisticasJugadores[0]?.jugador ?? null;
	}

	selector.value = String(estadoJugadores.filtros.jugador || "");
}

function actualizarResumenFiltros(jugador) {
	document.getElementById("js-active-year").textContent = estadoJugadores.filtros.anio === FILTRO_HISTORICO
		? "Histórico"
		: String(estadoJugadores.filtros.anio);
	document.getElementById("js-active-min-pj").textContent = estadoJugadores.filtros.minPartidos === 0
		? "Todos"
		: `${estadoJugadores.filtros.minPartidos}+`;
	document.getElementById("js-active-player").textContent = jugador?.jugador || "--";
	document.getElementById("js-active-rank").textContent = jugador ? `#${jugador.posicionTabla}` : "--";
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
	return `<img class="player-hero__avatar" src="${imagen}" alt="${escaparHtml(jugador.jugador)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder}';">`;
}


function contarRachaActual(partidos, condicion) {
	let total = 0;

	for (const partido of partidos) {
		if (!condicion(partido)) {
			break;
		}
		total += 1;
	}

	return total;
}

function calcularMejorRacha(partidos, condicion) {
	let mejor = 0;
	let actual = 0;

	for (const partido of partidos) {
		if (condicion(partido)) {
			actual += 1;
			if (actual > mejor) {
				mejor = actual;
			}
		} else {
			actual = 0;
		}
	}

	return mejor;
}

function calcularRachasJugador(jugador) {
	const historialDesc = jugador?.historialOrdenado || [];
	const historialAsc = [...historialDesc].reverse();

	const condiciones = {
		victorias: (partido) => partido.resultado === "ganador",
		invicto: (partido) => partido.resultado !== "perdedor",
		conGol: (partido) => partido.goles > 0
	};

	return {
		actuales: {
			victorias: contarRachaActual(historialDesc, condiciones.victorias),
			invicto: contarRachaActual(historialDesc, condiciones.invicto),
			conGol: contarRachaActual(historialDesc, condiciones.conGol)
		},
		mejores: {
			victorias: calcularMejorRacha(historialAsc, condiciones.victorias),
			invicto: calcularMejorRacha(historialAsc, condiciones.invicto),
			conGol: calcularMejorRacha(historialAsc, condiciones.conGol)
		}
	};
}

function anioSeleccionadoEstaCerrado(aniosDisponibles, anioSeleccionado) {
	if (anioSeleccionado === FILTRO_HISTORICO) {
		return false;
	}

	const anioNumero = Number(anioSeleccionado);
	if (!Number.isInteger(anioNumero)) {
		return false;
	}

	return (aniosDisponibles || []).some((anio) => Number(anio) > anioNumero);
}

function construirContextoCompetitivo(jugador, estadisticasJugadores) {
	if (!jugador || !estadisticasJugadores.length) {
		return null;
	}

	const lider = estadisticasJugadores[0];
	const puntosLider = lider?.puntos || 0;
	const cantidadLideres = estadisticasJugadores.filter((item) => item.puntos === puntosLider).length;
	const posicionesGoleadoras = calcularPosicionesPorGoles(estadisticasJugadores);
	const puestoGoleador = posicionesGoleadoras.get(jugador.jugador) || null;
	const diferenciaLider = Math.max(0, puntosLider - jugador.puntos);
	const temporadaCerrada = anioSeleccionadoEstaCerrado(estadoJugadores.aniosDisponibles, estadoJugadores.filtros.anio);
	const posicionCompetitiva = Number(jugador.posicionTabla || 0);
	let textoCarreraTitulo = "";

	if (temporadaCerrada) {
		if (posicionCompetitiva === 1) {
			textoCarreraTitulo = "Campeón";
		} else if (posicionCompetitiva === 2) {
			textoCarreraTitulo = "Subcampeón";
		} else if (posicionCompetitiva === 3) {
			textoCarreraTitulo = "Tercer puesto";
		} else {
			textoCarreraTitulo = `A ${diferenciaLider} pt${diferenciaLider === 1 ? "" : "s"} del campeón`;
		}
	} else if (diferenciaLider === 0) {
		textoCarreraTitulo = cantidadLideres > 1 ? "Comparte la cima" : "Líder";
	} else {
		textoCarreraTitulo = `A ${diferenciaLider} pt${diferenciaLider === 1 ? "" : "s"} del líder`;
	}

	return {
		lider,
		diferenciaLider,
		cantidadLideres,
		temporadaCerrada,
		posicionCompetitiva,
		textoCarreraTitulo,
		puestoGoleador
	};
}

function renderizarFormaReciente(jugador) {
	return `
		<article class="panel detail-panel form-compact-panel">
			<header class="section-head section-head--compact">
				<h3>Forma reciente</h3>
				<p>Últimos 5 y goleómetro reciente en una lectura más compacta.</p>
			</header>
			<div class="form-compact-list">
				<div class="form-compact-row">
					<div class="form-compact-row__head">
						<span class="form-compact-row__label">Últimos 5</span>
						<span class="form-compact-row__hint">Resultados</span>
					</div>
					<div class="form-compact-row__content form-dots">${renderizarRendimiento(jugador.ultimosPartidos)}</div>
				</div>
				<div class="form-compact-row">
					<div class="form-compact-row__head">
						<span class="form-compact-row__label">Goleómetro</span>
						<span class="form-compact-row__hint">Goles recientes</span>
					</div>
					<div class="form-compact-row__content goal-dots">${renderizarGoleometro(jugador.ultimosPartidos)}</div>
				</div>
			</div>
		</article>
	`;
}

function renderizarResumenSuperior(jugador, contextoCompetitivo) {
	if (!jugador || !contextoCompetitivo) {
		return "";
	}

	const badges = [
		{
			label: "Carrera por el título",
			valor: contextoCompetitivo.textoCarreraTitulo,
			clase: "metric-very-good"
		},
		{
			label: "Posición",
			valor: `#${jugador.posicionTabla}`,
			clase: "metric-good-soft",
			detalle: `${jugador.puntos} punto${jugador.puntos === 1 ? "" : "s"}`
		},
		{
			label: "Puesto goleador",
			valor: `#${contextoCompetitivo.puestoGoleador ?? "--"}`,
			clase: "metric-good-soft",
			detalle: `${jugador.goles} gol${jugador.goles === 1 ? "" : "es"}`
		}
	];

	return `
		<section class="summary-badges">
			${badges.map((badge) => `
				<article class="summary-badge">
					<span class="summary-badge__label">${escaparHtml(badge.label)}</span>
					<span class="summary-badge__value ${badge.clase}">${escaparHtml(badge.valor)}</span>
					${badge.detalle ? `<span class="summary-badge__detail summary-badge__detail--accent">${escaparHtml(badge.detalle)}</span>` : ""}
				</article>
			`).join("")}
		</section>
	`;
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

function renderizarMetricasJugador(jugador) {
	const grupos = [
		{
			titulo: "Métricas en estos partidos",
			descripcion: "Resumen ofensivo y de rendimiento construido sobre el historial visible.",
			metricas: [
				{ label: "Goles", valor: jugador.goles, clase: "metric-good" },
				{ label: "Veces goleador", valor: jugador.vecesGoleador, clase: "metric-good-soft" },
				{ label: "% Victorias", valor: formatearPorcentaje(jugador.porcentajeVictorias), clase: obtenerClasePorcentajeCuartil(jugador.porcentajeVictorias) },
				{ label: "GxP", valor: formatearDecimal(jugador.golesPorPartido), clase: obtenerClaseMetricas(jugador.golesPorPartido, { good: 1, mid: 0.5 }) },
				{ label: "PxP", valor: formatearDecimal(jugador.puntosPorPartido), clase: obtenerClaseMetricas(jugador.puntosPorPartido, { good: 2, mid: 1 }) },
				{ label: "Dif. Gol", valor: jugador.diferenciaGol, clase: obtenerClaseMetricas(jugador.diferenciaGol, { good: 1, mid: 0 }) },
				{ label: "Efect. Gol", valor: formatearPorcentaje(jugador.efectividadGol), clase: obtenerClasePorcentajeCuartil(jugador.efectividadGol) }
			]
		}
	];

	return grupos.map((grupo) => `
		<article class="metric-group panel">
			<header class="metric-group__header">
				<h3>${grupo.titulo}</h3>
				<p>${grupo.descripcion}</p>
			</header>
			<div class="metric-group__grid metric-group__grid--${normalizarTexto(grupo.titulo)}">
				${grupo.metricas.map((metrica) => `
					<article class="stat-card stat-card--compact">
						<span class="stat-card__label">${metrica.label}</span>
						<span class="stat-card__value ${metrica.clase}">${metrica.valor}</span>
					</article>
				`).join("")}
			</div>
		</article>
	`).join("");
}

function renderizarEncabezadoRendimiento(jugador) {
	const alcance = estadoJugadores.filtros.anio === FILTRO_HISTORICO
		? "Histórico"
		: `Temporada ${estadoJugadores.filtros.anio}`;

	return `
		<header class="performance-header panel">
			<div class="performance-header__copy">
				<span class="performance-header__eyebrow">Rendimiento</span>
				<h3>${alcance}</h3>
			</div>
			<div class="performance-header__meta">
				<span class="performance-header__count">${jugador.partidosJugados} partido${jugador.partidosJugados === 1 ? "" : "s"} analizado${jugador.partidosJugados === 1 ? "" : "s"}</span>
				<span class="performance-header__subtext">${formatearPorcentaje(jugador.porcentajePresencias)} de presencias</span>
			</div>
		</header>
	`;
}

function renderizarResumenHistorial(jugador) {
	return `
		<div class="history-summary-chip">
			<span class="history-summary-chip__value history-summary-chip__value--win">${jugador.ganados}</span>
			<span class="history-summary-chip__separator">/</span>
			<span class="history-summary-chip__value history-summary-chip__value--draw">${jugador.empatados}</span>
			<span class="history-summary-chip__separator">/</span>
			<span class="history-summary-chip__value history-summary-chip__value--loss">${jugador.perdidos}</span>
		</div>
	`;
}

function obtenerEtiquetaResultado(resultado) {
	if (resultado === "ganador") {
		return "Ganó";
	}
	if (resultado === "empate") {
		return "Empató";
	}
	return "Perdió";
}

function renderizarHistorial(jugador) {
	if (!jugador.historialOrdenado.length) {
		return `
			<div class="empty-state empty-state--panel">
				<strong>Sin historial disponible</strong>
				No hay partidos para este jugador con el filtro actual.
			</div>
		`;
	}

	return jugador.historialOrdenado.map((partido) => `
		<article class="history-row">
			<div class="history-row__meta">
				<span class="history-row__date">${formatearFecha(partido.fecha)}</span>
				<span class="history-row__match">Partido ${escaparHtml(partido.partidoId)}</span>
			</div>
			<div class="history-row__summary">
				<span class="history-pill history-pill--${partido.resultado || "neutral"}">${obtenerEtiquetaResultado(partido.resultado)}</span>
				<span class="history-score">${partido.marcadorFavor}-${partido.marcadorContra}</span>
				<span class="history-mini history-mini--goal">⚽ ${partido.goles}</span>
				<span class="history-mini history-mini--points">Pts ${partido.puntos}</span>
			</div>
			<a class="history-link" href="./Resumen.html?partido=${encodeURIComponent(partido.partidoId)}">Ver resumen</a>
		</article>
	`).join("");
}

function renderizarJugadorSeleccionado(jugador, contextoCompetitivo) {
	const shell = document.getElementById("js-player-shell");

	if (!jugador) {
		shell.innerHTML = `
			<div class="empty-state empty-state--panel">
				<strong>No hay jugador para mostrar</strong>
				Probá con otro año o esperá a que carguen datos válidos.
			</div>
		`;
		return;
	}

	shell.innerHTML = `
		<section class="player-hero panel">
			<div class="player-hero__main">
				${construirAvatarJugador(jugador)}
				<div class="player-hero__copy">
					<span class="player-hero__eyebrow">Perfil de jugador</span>
					<h2 class="player-hero__name">${escaparHtml(jugador.jugador)}</h2>
					<p class="player-hero__meta">Rinde dentro de ${estadoJugadores.filtros.anio === FILTRO_HISTORICO ? "todo el histórico" : `la temporada ${estadoJugadores.filtros.anio}`}. Arriba ves su situación competitiva resumida; abajo, el detalle por bloques.</p>
				</div>
			</div>
			<div class="player-hero__summary">
				${renderizarResumenSuperior(jugador, contextoCompetitivo)}
			</div>
		</section>

		<section class="form-section-layout">
			${renderizarFormaReciente(jugador)}
		</section>

		<section class="performance-section">
			${renderizarEncabezadoRendimiento(jugador)}

			<div class="performance-layout">
				<article class="panel detail-panel history-panel">
					<header class="section-head section-head--split">
						<h3>Historial de partidos</h3>
						${renderizarResumenHistorial(jugador)}
					</header>
					<div class="history-list">
						${renderizarHistorial(jugador)}
					</div>
				</article>

				<aside class="metrics-layout metrics-layout--stack">
					${renderizarMetricasJugador(jugador)}
				</aside>
			</div>
		</section>
	`;
}

function aplicarFiltrosYRenderizar() {
	const filasFiltradas = filtrarFilasPorAnio(estadoJugadores.filasCrudas, estadoJugadores.filtros.anio);
	const shell = document.getElementById("js-player-shell");
	poblarFiltroMinPartidos();

	if (filasFiltradas.length === 0) {
		actualizarResumenFiltros(null);
		shell.innerHTML = `
			<div class="empty-state empty-state--panel panel">
				<strong>No hay partidos para ese filtro</strong>
				Probá con otro año.
			</div>
		`;
		return;
	}

	const partidosMap = construirResumenPartidos(filasFiltradas);
	const estadisticas = calcularPosicionesPorPuntos(construirEstadisticasJugadores(filasFiltradas, partidosMap));
	window.__JUGADORES_STATS__ = estadisticas;

	poblarFiltroJugadores(estadisticas);
	const jugadorSeleccionado = estadisticas.find((jugador) => jugador.jugador === estadoJugadores.filtros.jugador) || estadisticas[0] || null;
	if (jugadorSeleccionado && estadoJugadores.filtros.jugador !== jugadorSeleccionado.jugador) {
		estadoJugadores.filtros.jugador = jugadorSeleccionado.jugador;
		document.getElementById("js-filter-player").value = jugadorSeleccionado.jugador;
	}

	const contextoCompetitivo = construirContextoCompetitivo(jugadorSeleccionado, estadisticas);
	actualizarResumenFiltros(jugadorSeleccionado);
	sincronizarUrlFiltros(jugadorSeleccionado);
	renderizarJugadorSeleccionado(jugadorSeleccionado, contextoCompetitivo);
}

function configurarEventosFiltros() {
	document.getElementById("js-filter-year").addEventListener("change", (event) => {
		const anioAnterior = estadoJugadores.filtros.anio;
		estadoJugadores.filtros.anio = event.target.value === FILTRO_HISTORICO
			? FILTRO_HISTORICO
			: Number(event.target.value);

		if (!estadoJugadores.minPartidosPersonalizado || obtenerMinimoPartidosPorDefecto(anioAnterior) === estadoJugadores.filtros.minPartidos) {
			estadoJugadores.filtros.minPartidos = obtenerMinimoPartidosPorDefecto(estadoJugadores.filtros.anio);
			poblarFiltroMinPartidos();
		}
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-filter-min-matches").addEventListener("change", (event) => {
		estadoJugadores.minPartidosPersonalizado = true;
		estadoJugadores.filtros.minPartidos = Number(event.target.value);
		aplicarFiltrosYRenderizar();
	});

	document.getElementById("js-filter-player").addEventListener("change", (event) => {
		estadoJugadores.filtros.jugador = event.target.value;
		aplicarFiltrosYRenderizar();
	});
}

async function iniciarJugadores() {
	const shell = document.getElementById("js-player-shell");
	estadoJugadores.filtrosUrlIniciales = leerFiltrosDesdeUrl();
	shell.innerHTML = `
		<div class="empty-state empty-state--panel panel">
			<strong>Conectando</strong>
		</div>
	`;

	try {
		const filas = await window.lectorDatos.obtenerFilasPartidos();
		const filasNormalizadas = filas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		const aniosDisponibles = obtenerAniosDisponibles(filasNormalizadas);
		const anioPorDefecto = resolverFiltroAnioInicial(aniosDisponibles, estadoJugadores.filtrosUrlIniciales?.anio);

		estadoJugadores.filasCrudas = filasNormalizadas;
		estadoJugadores.aniosDisponibles = aniosDisponibles;
		estadoJugadores.filtros.anio = anioPorDefecto;
		estadoJugadores.filtros.minPartidos = resolverFiltroMinPartidosInicial(estadoJugadores.filtrosUrlIniciales?.minPartidos, anioPorDefecto);
		estadoJugadores.minPartidosPersonalizado = OPCIONES_MIN_PARTIDOS.includes(estadoJugadores.filtrosUrlIniciales?.minPartidos);
		estadoJugadores.filtros.jugador = estadoJugadores.filtrosUrlIniciales?.jugador || null;

		window.__JUGADORES_RAW_DATA__ = filasNormalizadas;

		poblarFiltroAnios();
		poblarFiltroMinPartidos();
		configurarEventosFiltros();
		aplicarFiltrosYRenderizar();
	} catch (error) {
		console.error(error);
		shell.innerHTML = `
			<div class="empty-state empty-state--panel panel">
				<strong>No se pudieron cargar los datos</strong>
				Revisá la publicación del Google Sheets o la conexión de red para continuar.
			</div>
		`;
	}
}

const jugadoresApi = {
	normalizarTexto,
	normalizarEntero,
	parsearFecha,
	formatearFecha,
	normalizarFilaCruda,
	obtenerAniosDisponibles,
	filtrarFilasPorAnio,
	construirResumenPartidos,
	construirEstadisticasJugadores,
	calcularPosicionesPorPuntos,
	calcularVecesGoleador,
	calcularPosicionesPorGoles,
	calcularRachasJugador,
	calcularMejorRacha,
	anioSeleccionadoEstaCerrado,
	construirContextoCompetitivo,
	renderizarResumenSuperior,
	renderizarEncabezadoRendimiento,
	renderizarFormaReciente,
	renderizarResumenHistorial
};

if (typeof window !== "undefined") {
	window.jugadoresApi = jugadoresApi;
	if (typeof document !== "undefined") {
		document.addEventListener("DOMContentLoaded", iniciarJugadores);
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = jugadoresApi;
}
