const FILTRO_HISTORICO = "historico";

const estadoPalmares = {
	filasCrudas: [],
	filasNormalizadas: [],
	ediciones: []
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
		anio: obtenerAnioFecha(fecha),
		equipo: String(fila.Equipo || fila.equipo || "").trim(),
		jugador: String(fila.Jugador || fila.jugador || "").trim(),
		resultado: normalizarTexto(fila.Resultado || fila.resultado || ""),
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

function construirEstadisticasJugadores(filasNormalizadas, partidosMap) {
	const jugadores = new Map();
	const totalPartidos = partidosMap.size;

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
				partidosJugados: 0,
				diferenciaGol: 0
			});
		}

		const jugador = jugadores.get(fila.jugador);
		jugador.puntos += fila.puntos;
		jugador.goles += fila.goles;
		jugador.partidosJugados += 1;
		jugador.diferenciaGol += resumenEquipo.diferencia;

		if (fila.resultado === "ganador") {
			jugador.ganados += 1;
		} else if (fila.resultado === "empate") {
			jugador.empatados += 1;
		} else {
			jugador.perdidos += 1;
		}
	});

	return Array.from(jugadores.values())
		.map((jugador) => ({
			...jugador,
			puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
			porcentajePresencias: totalPartidos ? (jugador.partidosJugados / totalPartidos) * 100 : 0
		}))
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
				diferenciaGol: 0
			});
		}

		const jugador = jugadores.get(fila.jugador);
		jugador.goles += fila.goles;
		jugador.partidosJugados += 1;
		jugador.diferenciaGol += resumenEquipo.diferencia;
	});

	return Array.from(jugadores.values())
		.map((jugador) => ({
			...jugador,
			vecesGoleador: vecesGoleadorMap.get(jugador.jugador) || 0,
			golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0
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

function construirBloquesPodio(estadisticasTabla) {
	const grupos = [];

	estadisticasTabla.forEach((jugador) => {
		const ultimoGrupo = grupos[grupos.length - 1];
		if (!ultimoGrupo || ultimoGrupo.puntos !== jugador.puntos) {
			grupos.push({
				puntos: jugador.puntos,
				jugadores: [jugador]
			});
			return;
		}
		ultimoGrupo.jugadores.push(jugador);
	});

	return grupos.slice(0, 3).map((grupo, indice) => ({
		posicion: indice + 1,
		puntos: grupo.puntos,
		jugadores: grupo.jugadores
	}));
}

function construirPodio(estadisticasTabla) {
	const bloques = construirBloquesPodio(estadisticasTabla);
	const hayCampeonesCompartidos = (bloques[0]?.jugadores.length || 0) > 1;

	return bloques.map((bloque) => {
		let titulo = `${bloque.posicion}° puesto`;
		if (bloque.posicion === 1) {
			titulo = hayCampeonesCompartidos ? "Campeones" : "Campeón";
		} else if (bloque.posicion === 2 && !hayCampeonesCompartidos) {
			titulo = bloque.jugadores.length > 1 ? "Subcampeones" : "Subcampeón";
		}

		return {
			...bloque,
			titulo
		};
	});
}

function construirBloqueGoleador(estadisticasGoleadores) {
	if (!estadisticasGoleadores.length) {
		return {
			goleadores: [],
			top3: []
		};
	}

	const maximoGoles = estadisticasGoleadores[0].goles;
	const goleadores = estadisticasGoleadores.filter((jugador) => jugador.goles === maximoGoles);
	return {
		goleadores,
		top3: estadisticasGoleadores.slice(0, 3)
	};
}

function construirEdicionesPalmares(filasNormalizadas) {
	const anios = Array.from(new Set(filasNormalizadas.map((fila) => fila.anio).filter((anio) => anio !== null)))
		.sort((actual, siguiente) => actual - siguiente);

	return [...anios]
		.sort((actual, siguiente) => siguiente - actual)
		.map((anio) => {
			const filasAnuales = filasNormalizadas.filter((fila) => fila.anio === anio);
			const partidosMap = construirResumenPartidos(filasAnuales);
			const tabla = construirEstadisticasJugadores(filasAnuales, partidosMap);
			const goleadores = construirEstadisticasGoleadores(filasAnuales, partidosMap);
			const podio = construirPodio(tabla);
			const bloqueGoleador = construirBloqueGoleador(goleadores);
			const edicionCerrada = anios.includes(anio + 1);

			return {
				anio,
				estado: edicionCerrada ? "cerrado" : "en-curso",
				partidos: partidosMap.size,
				podio,
				goleadores: bloqueGoleador.goleadores,
				topGoleadores: bloqueGoleador.top3,
				tabla,
				goleadoresOrdenados: goleadores
			};
		});
}

function renderizarJugadoresPodio(jugadores) {
	return jugadores.map((jugador) => `
		<div class="palmares-entry">
			<div class="palmares-entry__player">
				${construirAvatarJugador(jugador.jugador, "palmares-entry__avatar")}
				<div class="palmares-entry__info">
					<strong>${escaparHtml(jugador.jugador)}</strong>
					<span>${escaparHtml(`${jugador.puntos} pts · ${jugador.ganados}-${jugador.empatados}-${jugador.perdidos}`)}</span>
				</div>
			</div>
			<span class="palmares-entry__meta">DG ${escaparHtml(String(jugador.diferenciaGol))}</span>
		</div>
	`).join("");
}

function construirAvatarJugador(nombreJugador, claseCss = "palmares-entry__avatar") {
	const imagen = `./assets/jugadores/jugador-${normalizarTexto(nombreJugador)}.png`;
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

function renderizarPodio(podio) {
	return podio.map((bloque) => `
		<article class="palmares-podium-card palmares-podium-card--${bloque.posicion}">
			<div class="palmares-podium-card__head">
				<span class="palmares-podium-card__label">${escaparHtml(bloque.titulo)}</span>
				<span class="palmares-podium-card__badge">${escaparHtml(String(bloque.puntos))} pts</span>
			</div>
			<div class="palmares-podium-card__body">
				${renderizarJugadoresPodio(bloque.jugadores)}
			</div>
		</article>
	`).join("");
}

function renderizarHeroCampeon(edicion) {
	const campeones = edicion.podio[0]?.jugadores || [];
	if (!campeones.length) {
		return "";
	}

	const titulo = edicion.estado === "cerrado"
		? (campeones.length > 1 ? "Campeones de la edición" : "Campeón de la edición")
		: (campeones.length > 1 ? "Líderes del momento" : "Líder del momento");
	const bloquePrincipal = edicion.podio[0];
	const secundarios = edicion.podio.slice(1, 3);
	const etiquetaSecundaria = "Podio";
	const estadisticasCompartidas = campeones.length > 1;

	return `
		<section class="palmares-champion-hero">
			<div class="palmares-champion-hero__content">
				<span class="palmares-champion-hero__eyebrow">🏆 ${escaparHtml(titulo)}</span>
				<div class="palmares-champion-hero__title">
					<div class="palmares-champion-hero__avatars">
						${campeones.map((jugador) => construirAvatarJugador(jugador.jugador, "palmares-champion-hero__avatar palmares-champion-hero__avatar--stacked")).join("")}
					</div>
					<h3>${escaparHtml(campeones.map((jugador) => jugador.jugador).join(" · "))}</h3>
				</div>
				<div class="palmares-champion-hero__stats">
					<span class="palmares-champion-hero__stat"><strong>${escaparHtml(String(bloquePrincipal.puntos))}</strong><span>Puntos</span></span>
					<span class="palmares-champion-hero__stat"><strong>${estadisticasCompartidas ? escaparHtml(String(campeones.length)) : `${escaparHtml(String(campeones[0].ganados))}-${escaparHtml(String(campeones[0].empatados))}-${escaparHtml(String(campeones[0].perdidos))}`}</strong><span>${estadisticasCompartidas ? "Co-líderes" : "G-E-P"}</span></span>
					<span class="palmares-champion-hero__stat"><strong>${estadisticasCompartidas ? escaparHtml(String(edicion.partidos)) : escaparHtml(String(campeones[0].diferenciaGol))}</strong><span>${estadisticasCompartidas ? "PJ edición" : "Diferencia"}</span></span>
				</div>
			</div>
			<div class="palmares-champion-hero__aside">
				<div class="palmares-champion-hero__secondary-head">
					<span class="palmares-champion-hero__secondary-label">${escaparHtml(etiquetaSecundaria)}</span>
				</div>
				<div class="palmares-podium-secondary palmares-podium-secondary--hero">
					${secundarios.map((bloque) => `
						<article class="palmares-podium-card palmares-podium-card--secondary palmares-podium-card--hero palmares-podium-card--${bloque.posicion}">
							<div class="palmares-podium-card__head">
								<span class="palmares-podium-card__label">${escaparHtml(bloque.titulo)}</span>
								<span class="palmares-podium-card__badge">${escaparHtml(String(bloque.puntos))} pts</span>
							</div>
							<div class="palmares-podium-card__body palmares-podium-card__body--hero">
								${bloque.jugadores.map((jugador) => `
									<div class="palmares-podium-mini-entry">
										${construirAvatarJugador(jugador.jugador, "palmares-podium-mini-entry__avatar")}
										<div>
											<strong>${escaparHtml(jugador.jugador)}</strong>
											<span>${escaparHtml(`${jugador.puntos} pts · ${jugador.ganados}-${jugador.empatados}-${jugador.perdidos} · DG ${jugador.diferenciaGol}`)}</span>
										</div>
									</div>
								`).join("")}
							</div>
						</article>
					`).join("")}
				</div>
			</div>
		</section>
	`;
}

function renderizarGoleadores(goleadores, topGoleadores, estado) {
	if (!goleadores.length) {
		return `
			<div class="empty-state empty-state--soft">
				<strong>Sin goleadores todavía</strong>
				<span>No hay goles cargados para esta edición.</span>
			</div>
		`;
	}

	const titulo = goleadores.length > 1 ? "Bota de Oro compartida" : "Bota de Oro";
	const subtitulo = estado === "cerrado"
		? "Máximo artillero de la edición"
		: "Líder actual de la tabla de gol";
	const goleadoresSet = new Set(goleadores.map((jugador) => jugador.jugador));
	const perseguidores = topGoleadores.filter((jugador) => !goleadoresSet.has(jugador.jugador)).slice(0, 3);

	return `
		<div class="palmares-scorers__featured">
			<span class="palmares-scorers__label">${escaparHtml(titulo)}</span>
			<div class="palmares-scorers__featured-list">
				${goleadores.map((jugador) => `
					<div class="palmares-scorers__featured-item">
						${construirAvatarJugador(jugador.jugador, "palmares-entry__avatar")}
						<div>
							<strong>${escaparHtml(jugador.jugador)}</strong>
							<span class="palmares-scorers__featured-goals">${escaparHtml(String(jugador.goles))}</span>
							<span>${escaparHtml(subtitulo)}</span>
						</div>
					</div>
				`).join("")}
			</div>
		</div>
		${perseguidores.length ? `
			<div class="palmares-top-scorers">
				${perseguidores.map((jugador, indice) => `
					<div class="palmares-top-scorers__row">
						<span class="palmares-top-scorers__rank">${indice + 2}</span>
						<span class="palmares-top-scorers__name">${escaparHtml(jugador.jugador)}</span>
						<span class="palmares-top-scorers__goals">${escaparHtml(String(jugador.goles))}</span>
					</div>
				`).join("")}
			</div>
		` : ""}
	`;
}

function renderizarEdicion(edicion) {
	const estadoEtiqueta = edicion.estado === "cerrado" ? "Cerrado" : "En curso";

	return `
		<article class="panel palmares-season-card">
			<header class="palmares-season-card__head">
				<div>
					<span class="palmares-season-card__eyebrow">Edición ${escaparHtml(String(edicion.anio))}</span>
					<h2>${escaparHtml(String(edicion.anio))}</h2>
				</div>
				<div class="palmares-season-card__badges">
					<span class="palmares-season-card__state palmares-season-card__state--${escaparHtml(edicion.estado)}">${escaparHtml(estadoEtiqueta)}</span>
					<span class="palmares-season-card__state">${escaparHtml(String(edicion.partidos))} PJ</span>
				</div>
			</header>
			${renderizarHeroCampeon(edicion)}
			<div class="palmares-season-card__grid">
				<section class="palmares-block palmares-block--scorers">
					<div class="palmares-scorers">
						${renderizarGoleadores(edicion.goleadores, edicion.topGoleadores, edicion.estado)}
					</div>
				</section>
			</div>
		</article>
	`;
}

function renderizarPalmares(ediciones) {
	const shell = document.getElementById("js-palmares-shell");
	if (!shell) {
		return;
	}

	if (!ediciones.length) {
		shell.innerHTML = `
			<div class="panel empty-state empty-state--panel">
				<strong>No hay ediciones para mostrar</strong>
				<span>Faltan partidos cargados para construir el palmarés.</span>
			</div>
		`;
		return;
	}

	shell.innerHTML = ediciones.map((edicion) => renderizarEdicion(edicion)).join("");
}

async function inicializarPalmares() {
	const shell = document.getElementById("js-palmares-shell");
	try {
		const lector = typeof window !== "undefined" ? window.lectorDatos : null;
		if (!lector?.obtenerFilasPartidos) {
			throw new Error("No se encontró el lector de datos.");
		}

		estadoPalmares.filasCrudas = await lector.obtenerFilasPartidos();
		estadoPalmares.filasNormalizadas = estadoPalmares.filasCrudas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador && fila.anio !== null);
		estadoPalmares.ediciones = construirEdicionesPalmares(estadoPalmares.filasNormalizadas);
		renderizarPalmares(estadoPalmares.ediciones);
		if (typeof window !== "undefined") {
			window.__PALMARES_EDICIONES__ = estadoPalmares.ediciones;
		}
	} catch (error) {
		console.error("No se pudo cargar el palmarés:", error);
		if (shell) {
			shell.innerHTML = `
				<div class="panel empty-state empty-state--panel">
					<strong>No se pudo cargar el palmarés</strong>
					<span>${escaparHtml(error.message || "Revisá la conexión con la hoja de datos.")}</span>
				</div>
			`;
		}
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("DOMContentLoaded", inicializarPalmares);
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		normalizarFilaCruda,
		construirResumenPartidos,
		construirEstadisticasJugadores,
		construirEstadisticasGoleadores,
		construirPodio,
		construirEdicionesPalmares
	};
}
