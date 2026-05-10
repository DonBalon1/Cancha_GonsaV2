const TIPOS_RACHAS = [
	{
		clave: "victorias",
		titulo: "Victorias consecutivas",
		descripcion: "La seguidilla ganadora más larga del torneo, quién marca el techo y quiénes vienen apretando desde atrás.",
		icono: "🏆"
	},
	{
		clave: "invicto",
		titulo: "Invicto",
		descripcion: "La marca sin derrotas más extensa, con foco en los dueños del récord y los que todavía siguen en carrera.",
		icono: "🛡️"
	},
	{
		clave: "conGol",
		titulo: "Partidos seguidos con gol",
		descripcion: "La constancia goleadora más alta y los artilleros activos que hoy amenazan ese techo.",
		icono: "⚽"
	},
	{
		clave: "derrotas",
		titulo: "Derrotas consecutivas",
		descripcion: "La racha más venenosa del torneo: quién quedó atrapado en la peor seguidilla y quién se acerca peligrosamente a ese registro.",
		icono: "🥀"
	}
];

const estadoRachas = {
	filasCrudas: [],
	filasNormalizadas: [],
	partidos: [],
	jugadores: []
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
		resultado: String(fila.Resultado || fila.resultado || "").trim(),
		goles: normalizarEntero(fila.Goles || fila.goles),
		autogoles: normalizarEntero(fila.Autogoles || fila.autogoles),
		puntos: normalizarEntero(fila.Puntos || fila.puntos)
	};
}

function construirResumenPartidos(filasNormalizadas) {
	const partidos = new Map();

	filasNormalizadas.forEach((fila) => {
		if (!partidos.has(fila.partidoId)) {
			partidos.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				fechaTexto: fila.fechaTexto,
				anio: fila.anio,
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

	return Array.from(partidos.values())
		.map((partido) => {
			const equipos = Array.from(partido.equipos.values())
				.map((equipo) => {
					const rival = Array.from(partido.equipos.values()).find((item) => item.equipo !== equipo.equipo) || { goles: 0, autogoles: 0 };
					const golesAFavor = equipo.goles + rival.autogoles;
					const golesEnContra = rival.goles + equipo.autogoles;

					return {
						...equipo,
						golesAFavor,
						golesEnContra,
						diferencia: golesAFavor - golesEnContra
					};
				})
				.sort((actual, siguiente) => actual.equipo.localeCompare(siguiente.equipo, "es", { numeric: true, sensitivity: "base" }));

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

function construirEstadisticasJugadores(filasNormalizadas, partidos) {
	const partidosMap = new Map(partidos.map((partido) => [partido.partidoId, partido]));
	const jugadores = new Map();

	filasNormalizadas.forEach((fila) => {
		const partido = partidosMap.get(fila.partidoId);
		const resumenEquipo = (partido?.equipos || []).find((equipo) => equipo.equipo === fila.equipo) || {
			golesAFavor: fila.goles,
			golesEnContra: 0,
			diferencia: fila.goles
		};

		if (!jugadores.has(fila.jugador)) {
			jugadores.set(fila.jugador, {
				jugador: fila.jugador,
				claveImagen: normalizarTexto(fila.jugador),
				historial: [],
				partidosJugados: 0,
				ganados: 0,
				empatados: 0,
				perdidos: 0,
				goles: 0
			});
		}

		const jugador = jugadores.get(fila.jugador);
		const resultadoNormalizado = normalizarTexto(fila.resultado);
		jugador.partidosJugados += 1;
		jugador.goles += fila.goles;

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
			anio: fila.anio,
			resultado: resultadoNormalizado,
			goles: fila.goles,
			marcadorFavor: resumenEquipo.golesAFavor,
			marcadorContra: resumenEquipo.golesEnContra,
			diferencia: resumenEquipo.diferencia
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
				historialAsc,
				historialOrdenado: [...historialAsc].sort((actual, siguiente) => {
					if (actual.fecha.getTime() === siguiente.fecha.getTime()) {
						return normalizarEntero(siguiente.partidoId) - normalizarEntero(actual.partidoId);
					}
					return siguiente.fecha - actual.fecha;
				})
			};
		})
		.sort((actual, siguiente) => actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" }));
}

function construirUrlJugador(nombreJugador) {
	const parametros = new URLSearchParams({
		anio: "historico",
		minPj: "0",
		jugador: nombreJugador
	});
	return `./Jugadores.html?${parametros.toString()}`;
}

function construirRutaImagenJugador(nombreJugador) {
	return `./assets/jugadores/jugador-${normalizarTexto(nombreJugador)}.png`;
}

function construirAvatarJugador(nombreJugador) {
	const imagen = construirRutaImagenJugador(nombreJugador);
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `
		<img
			class="racha-owner__avatar"
			src="${escaparHtml(imagen)}"
			alt="${escaparHtml(nombreJugador)}"
			loading="lazy"
			onerror="this.onerror=null;this.src='${placeholder}';"
		>
	`;
}

function construirSegmentosRacha(historialAsc, condicion) {
	const segmentos = [];
	let segmentoActual = null;
	const ultimoPartido = historialAsc[historialAsc.length - 1] || null;

	for (const partido of historialAsc) {
		if (condicion(partido)) {
			if (!segmentoActual) {
				segmentoActual = {
					inicio: partido,
					fin: partido,
					partidos: [partido]
				};
			} else {
				segmentoActual.fin = partido;
				segmentoActual.partidos.push(partido);
			}
		} else if (segmentoActual) {
			segmentos.push(segmentoActual);
			segmentoActual = null;
		}
	}

	if (segmentoActual) {
		segmentos.push(segmentoActual);
	}

	return segmentos.map((segmento) => ({
		...segmento,
		longitud: segmento.partidos.length,
		vigente: Boolean(ultimoPartido && segmento.fin.partidoId === ultimoPartido.partidoId)
	}));
}

function elegirMejorSegmento(segmentos) {
	if (!segmentos.length) {
		return null;
	}

	const maximo = segmentos.reduce((mejor, segmento) => Math.max(mejor, segmento.longitud), 0);
	return segmentos
		.filter((segmento) => segmento.longitud === maximo)
		.sort((actual, siguiente) => {
			if (Number(siguiente.vigente) !== Number(actual.vigente)) {
				return Number(siguiente.vigente) - Number(actual.vigente);
			}
			if (actual.fin.fecha.getTime() !== siguiente.fin.fecha.getTime()) {
				return siguiente.fin.fecha - actual.fin.fecha;
			}
			return normalizarEntero(siguiente.fin.partidoId) - normalizarEntero(actual.fin.partidoId);
		})[0] || null;
}

function construirAnalisisRachasJugador(jugador) {
	const condiciones = {
		victorias: (partido) => partido.resultado === "ganador",
		invicto: (partido) => partido.resultado !== "perdedor",
		conGol: (partido) => partido.goles > 0,
		derrotas: (partido) => partido.resultado === "perdedor"
	};

	const analisis = {};

	Object.entries(condiciones).forEach(([clave, condicion]) => {
		const segmentos = construirSegmentosRacha(jugador.historialAsc || [], condicion);
		const mejorSegmento = elegirMejorSegmento(segmentos);
		const segmentoActual = segmentos.find((segmento) => segmento.vigente) || null;

		analisis[clave] = {
			actual: segmentoActual?.longitud || 0,
			actualSegmento: segmentoActual,
			mejor: mejorSegmento?.longitud || 0,
			mejorSegmento
		};
	});

	return analisis;
}

function construirFechaRango(segmento) {
	if (!segmento) {
		return "Sin tramo registrado";
	}

	const desde = segmento.inicio?.fechaTexto || formatearFecha(segmento.inicio?.fecha || new Date(0));
	const hasta = segmento.fin?.fechaTexto || formatearFecha(segmento.fin?.fecha || new Date(0));

	if (segmento.vigente) {
		return `${desde} → vigente (${hasta})`;
	}

	return `${desde} → ${hasta}`;
}

function construirDetallePropietario(jugador, tipo) {
	const segmento = jugador?.racha?.mejorSegmento;
	return {
		nombre: jugador.jugador,
		avatar: construirRutaImagenJugador(jugador.jugador),
		urlJugador: construirUrlJugador(jugador.jugador),
		etiquetaEstado: segmento?.vigente ? "Vigente" : "Histórico",
		detalle: construirFechaRango(segmento),
		extra: segmento?.vigente
			? `Sigue activa al último partido cargado · ${jugador.racha.mejor} al hilo`
			: `${jugador.racha.mejor} al hilo en ${tipo.titulo.toLowerCase()}`
	};
}

function construirDetallePerseguidor(jugador, valorRecord) {
	const segmento = jugador?.racha?.actualSegmento;
	const diferencia = Math.max(0, valorRecord - (jugador?.racha?.actual || 0));
	return {
		nombre: jugador.jugador,
		avatar: construirRutaImagenJugador(jugador.jugador),
		urlJugador: construirUrlJugador(jugador.jugador),
		detalle: segmento ? construirFechaRango(segmento) : "Racha activa sin tramo detectable",
		extra: diferencia === 0
			? "Ya alcanzó el récord"
			: `A ${diferencia} ${diferencia === 1 ? "partido" : "partidos"} del récord`
	};
}

function construirBloquesRachas(jugadores) {
	const jugadoresConAnalisis = jugadores.map((jugador) => ({
		jugador: jugador.jugador,
		claveImagen: jugador.claveImagen,
		analisis: construirAnalisisRachasJugador(jugador)
	}));

	return TIPOS_RACHAS.map((tipo) => {
		const ranking = jugadoresConAnalisis
			.map((jugador) => ({
				jugador: jugador.jugador,
				claveImagen: jugador.claveImagen,
				racha: jugador.analisis[tipo.clave]
			}))
			.filter((registro) => registro.racha.mejor > 0)
			.sort((actual, siguiente) => {
				if (siguiente.racha.mejor !== actual.racha.mejor) {
					return siguiente.racha.mejor - actual.racha.mejor;
				}
				if (Number(siguiente.racha.mejorSegmento?.vigente) !== Number(actual.racha.mejorSegmento?.vigente)) {
					return Number(siguiente.racha.mejorSegmento?.vigente) - Number(actual.racha.mejorSegmento?.vigente);
				}
				return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
			});

		const valorRecord = ranking[0]?.racha.mejor || 0;
		const propietarios = ranking.filter((registro) => registro.racha.mejor === valorRecord);
		const propietariosNombres = new Set(propietarios.map((registro) => registro.jugador));
		const perseguidores = jugadoresConAnalisis
			.map((jugador) => ({
				jugador: jugador.jugador,
				claveImagen: jugador.claveImagen,
				racha: jugador.analisis[tipo.clave]
			}))
			.filter((registro) => registro.racha.actual > 0 && !propietariosNombres.has(registro.jugador))
			.sort((actual, siguiente) => {
				if (siguiente.racha.actual !== actual.racha.actual) {
					return siguiente.racha.actual - actual.racha.actual;
				}
				if (siguiente.racha.mejor !== actual.racha.mejor) {
					return siguiente.racha.mejor - actual.racha.mejor;
				}
				return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
			})
			.slice(0, 2);

		const recordVigente = propietarios.some((registro) => registro.racha.mejorSegmento?.vigente);

		return {
			...tipo,
			valorRecord,
			estadoRecord: recordVigente ? "Récord vigente" : "Récord histórico",
			propietarios: propietarios.map((registro) => construirDetallePropietario(registro, tipo)),
			perseguidores: perseguidores.map((registro) => ({
				...construirDetallePerseguidor(registro, valorRecord),
				valorActual: registro.racha.actual
			})),
			recordCompartido: propietarios.length > 1
		};
	}).filter((bloque) => bloque.valorRecord > 0);
}

function renderizarFilaPersona(persona, claseBase) {
	const avatar = persona.avatar ? construirAvatarJugador(persona.nombre) : "";
	const nombre = persona.urlJugador
		? `<a href="${escaparHtml(persona.urlJugador)}">${escaparHtml(persona.nombre)}</a>`
		: escaparHtml(persona.nombre);

	return `
		<div class="${claseBase}">
			<div class="${claseBase}__main-wrap">
				${avatar}
				<div class="${claseBase}__main">
					<span class="${claseBase}__name">${nombre}</span>
					${persona.etiquetaEstado ? `<span class="${claseBase}__state">${escaparHtml(persona.etiquetaEstado)}</span>` : ""}
					${persona.detalle ? `<span class="${claseBase}__detail">${escaparHtml(persona.detalle)}</span>` : ""}
					${persona.extra ? `<span class="${claseBase}__extra">${escaparHtml(persona.extra)}</span>` : ""}
				</div>
			</div>
			<div class="${claseBase}__actions">
				${persona.valorActual ? `<span class="${claseBase}__metric">${escaparHtml(String(persona.valorActual))}</span>` : ""}
				${persona.urlJugador ? `<a class="link-pill" href="${escaparHtml(persona.urlJugador)}">Ver jugador</a>` : ""}
			</div>
		</div>
	`;
}

function renderizarBloqueRacha(bloque) {
	const badgeCompartido = bloque.recordCompartido ? `Compartido entre ${bloque.propietarios.length}` : "Un solo dueño";
	const tituloPropietarios = bloque.recordCompartido ? "Dueños de la racha" : "Dueño de la racha";
	const descripcionPerseguidores = bloque.perseguidores.length
		? bloque.perseguidores.map((perseguidor) => renderizarFilaPersona(perseguidor, "hunter-row")).join("")
		: `
			<div class="hunters-empty">
				<strong>Sin perseguidores activos</strong>
				<span>Nadie viene con una racha vigente lo bastante fuerte como para meter presión ahora.</span>
			</div>
		`;

	return `
		<section class="panel streak-section streak-section--${escaparHtml(bloque.clave)}">
			<header class="streak-section__head">
				<div>
					<h2>${escaparHtml(bloque.titulo)}</h2>
					<p>${escaparHtml(bloque.descripcion)}</p>
				</div>
				<span class="streak-section__icon">${bloque.icono}</span>
			</header>

			<div class="streak-section__hero">
				<div class="streak-value panel-soft">
					<span class="streak-value__label">${escaparHtml(bloque.estadoRecord)}</span>
					<div class="streak-value__main">
						<strong>${escaparHtml(String(bloque.valorRecord))}</strong>
						<span>partidos</span>
					</div>
				</div>
				<div class="streak-owners panel-soft">
					<div class="streak-owners__head">
						<p>${escaparHtml(tituloPropietarios)}</p>
						<span>${escaparHtml(badgeCompartido)}</span>
					</div>
					<div class="streak-owners__list">
						${bloque.propietarios.map((propietario) => renderizarFilaPersona(propietario, "owner-row")).join("")}
					</div>
				</div>
			</div>

			<div class="hunters-card panel-soft">
				<div class="hunters-card__head">
					<h3>Perseguidores activos</h3>
					<p>Los dos mejores perseguidores vigentes que hoy están más cerca de romper esta marca.</p>
				</div>
				<div class="hunters-card__list">
					${descripcionPerseguidores}
				</div>
			</div>
		</section>
	`;
}

function renderizarRachas() {
	const shell = document.getElementById("js-streaks-shell");
	const bloques = construirBloquesRachas(estadoRachas.jugadores);

	if (!bloques.length) {
		shell.innerHTML = `
			<div class="panel empty-state">
				<strong>Sin rachas disponibles</strong>
				<span>No hay datos suficientes para construir esta pestaña todavía.</span>
			</div>
		`;
		return;
	}

	shell.innerHTML = bloques.map(renderizarBloqueRacha).join("");
}

async function inicializarRachas() {
	const shell = typeof document !== "undefined" ? document.getElementById("js-streaks-shell") : null;

	try {
		const lector = typeof window !== "undefined" ? window.lectorDatos : null;
		if (!lector?.obtenerFilasPartidos) {
			throw new Error("No se encontró el lector de datos.");
		}

		estadoRachas.filasCrudas = await lector.obtenerFilasPartidos();
		estadoRachas.filasNormalizadas = estadoRachas.filasCrudas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		estadoRachas.partidos = construirResumenPartidos(estadoRachas.filasNormalizadas);
		estadoRachas.jugadores = construirEstadisticasJugadores(estadoRachas.filasNormalizadas, estadoRachas.partidos);

		renderizarRachas();
	} catch (error) {
		console.error("No se pudieron cargar las rachas:", error);
		if (shell) {
			shell.innerHTML = `
				<div class="panel empty-state">
					<strong>No se pudieron cargar las rachas</strong>
					<span>${escaparHtml(error.message || "Revisá la conexión con la hoja de datos.")}</span>
				</div>
			`;
		}
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("DOMContentLoaded", inicializarRachas);
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		normalizarFilaCruda,
		construirResumenPartidos,
		construirEstadisticasJugadores,
		construirAnalisisRachasJugador,
		construirBloquesRachas,
		formatearFecha
	};
}
