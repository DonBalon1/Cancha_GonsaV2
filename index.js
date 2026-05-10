const HOME_PREVIEW_LIMIT = 3;
const HOME_FORM_LIMIT = 5;
const HOME_LEADERS_MAX = 4;

const HOME_STREAK_TYPES = [
	{
		key: "victorias",
		title: "Victorias consecutivas",
		icon: "🏆",
		condition: (match) => match.resultado === "ganador"
	},
	{
		key: "invicto",
		title: "Invicto",
		icon: "🛡️",
		condition: (match) => match.resultado !== "perdedor"
	},
	{
		key: "conGol",
		title: "Partidos seguidos con gol",
		icon: "⚽",
		condition: (match) => match.goles > 0
	},
	{
		key: "derrotas",
		title: "Derrotas consecutivas",
		icon: "📉",
		condition: (match) => match.resultado === "perdedor"
	}
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

function construirRutaImagenJugador(nombreJugador) {
	return `./assets/jugadores/jugador-${normalizarTexto(nombreJugador)}.png`;
}

function construirUrlJugador(nombreJugador) {
	const parametros = new URLSearchParams({
		anio: "historico",
		minPj: "0",
		jugador: nombreJugador
	});
	return `./Jugadores.html?${parametros.toString()}`;
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
						jugadores: equipo.jugadores.sort((actual, siguiente) => {
							if (siguiente.goles !== actual.goles) {
								return siguiente.goles - actual.goles;
							}
							return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
						})
					};
				})
				.sort((actual, siguiente) => actual.equipoId.localeCompare(siguiente.equipoId, "es", { numeric: true, sensitivity: "base" }));

			const [equipoA, equipoB] = equipos;
			if (equipoA && equipoB) {
				if (equipoA.marcador > equipoB.marcador) {
					equipoA.resultado = "winner";
					equipoB.resultado = "loser";
				} else if (equipoA.marcador < equipoB.marcador) {
					equipoA.resultado = "loser";
					equipoB.resultado = "winner";
				} else {
					equipoA.resultado = "draw";
					equipoB.resultado = "draw";
				}
			}

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

function construirMapaResumenEquipos(filasNormalizadas) {
	const partidos = new Map();

	filasNormalizadas.forEach((fila) => {
		if (!partidos.has(fila.partidoId)) {
			partidos.set(fila.partidoId, {
				partidoId: fila.partidoId,
				fecha: fila.fecha,
				equipos: new Map()
			});
		}

		const partido = partidos.get(fila.partidoId);
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

function construirEstadisticasTabla(filasNormalizadas) {
	const partidosMap = construirMapaResumenEquipos(filasNormalizadas);
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
				partidosConGol: 0,
				diferenciaGol: 0,
				historial: []
			});
		}

		const jugador = jugadores.get(fila.jugador);
		jugador.puntos += fila.puntos;
		jugador.goles += fila.goles;
		jugador.partidosJugados += 1;
		jugador.diferenciaGol += resumenEquipo.diferencia;

		if (fila.goles > 0) {
			jugador.partidosConGol += 1;
		}

		if (fila.resultado === "ganador") {
			jugador.ganados += 1;
		} else if (fila.resultado === "empate") {
			jugador.empatados += 1;
		} else {
			jugador.perdidos += 1;
		}

		jugador.historial.push({
			partidoId: fila.partidoId,
			fecha: fila.fecha,
			fechaTexto: fila.fechaTexto,
			resultado: fila.resultado,
			goles: fila.goles
		});
	});

	let puntosAnteriores = null;
	let posicionActual = 0;

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
				ultimosPartidos: historialAsc.slice(-HOME_FORM_LIMIT),
				puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
				golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0,
				porcentajePresencias: totalPartidos ? (jugador.partidosJugados / totalPartidos) * 100 : 0
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
		})
		.map((jugador) => {
			if (jugador.puntos !== puntosAnteriores) {
				posicionActual += 1;
				puntosAnteriores = jugador.puntos;
			}

			return {
				...jugador,
				posicion: posicionActual
			};
		});
}

function construirEstadisticasGoleadores(filasNormalizadas, partidos) {
	const vecesGoleadorMap = new Map();

	partidos.forEach((partido) => {
		const maximoGoles = partido.jugadores.reduce((maximo, jugador) => Math.max(maximo, jugador.goles), 0);
		if (maximoGoles <= 0) {
			return;
		}

		partido.jugadores
			.filter((jugador) => jugador.goles === maximoGoles)
			.forEach((jugador) => {
				vecesGoleadorMap.set(jugador.jugador, (vecesGoleadorMap.get(jugador.jugador) || 0) + 1);
			});
	});

	const resumenPartidos = construirMapaResumenEquipos(filasNormalizadas);
	const jugadores = new Map();

	filasNormalizadas.forEach((fila) => {
		const resumenEquipo = resumenPartidos.get(fila.partidoId)?.equipos.get(fila.equipo) || { diferencia: fila.goles };

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

function construirSegmentosRacha(historialAsc, condicion) {
	const segmentos = [];
	let segmentoActual = null;
	const ultimoPartido = historialAsc[historialAsc.length - 1] || null;

	for (const partido of historialAsc) {
		if (condicion(partido)) {
			if (!segmentoActual) {
				segmentoActual = { inicio: partido, fin: partido, partidos: [partido] };
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

function construirBloquesRacha(jugadores) {
	return HOME_STREAK_TYPES.map((tipo) => {
		const ranking = jugadores
			.map((jugador) => {
				const segmentos = construirSegmentosRacha(jugador.historialAsc || [], tipo.condition);
				const mejorSegmento = elegirMejorSegmento(segmentos);
				const actualSegmento = segmentos.find((segmento) => segmento.vigente) || null;
				return {
					jugador,
					best: mejorSegmento?.longitud || 0,
					bestSegment: mejorSegmento,
					current: actualSegmento?.longitud || 0,
					currentSegment: actualSegmento
				};
			})
			.filter((registro) => registro.best > 0)
			.sort((actual, siguiente) => {
				if (siguiente.best !== actual.best) {
					return siguiente.best - actual.best;
				}
				if (Number(siguiente.bestSegment?.vigente) !== Number(actual.bestSegment?.vigente)) {
					return Number(siguiente.bestSegment?.vigente) - Number(actual.bestSegment?.vigente);
				}
				return actual.jugador.jugador.localeCompare(siguiente.jugador.jugador, "es", { sensitivity: "base" });
			});

		if (!ranking.length) {
			return null;
		}

		const record = ranking[0].best;
		const owners = ranking.filter((registro) => registro.best === record);
		const ownerNames = new Set(owners.map((registro) => registro.jugador.jugador));
		const chasers = ranking
			.filter((registro) => registro.current > 0 && !ownerNames.has(registro.jugador.jugador))
			.sort((actual, siguiente) => {
				if (siguiente.current !== actual.current) {
					return siguiente.current - actual.current;
				}
				if (siguiente.best !== actual.best) {
					return siguiente.best - actual.best;
				}
				return actual.jugador.jugador.localeCompare(siguiente.jugador.jugador, "es", { sensitivity: "base" });
			});

		return {
			...tipo,
			record,
			owners,
			chasers,
			recordVigente: owners.some((registro) => registro.bestSegment?.vigente)
		};
	}).filter(Boolean);
}

function construirRachaEnFoco(jugadores) {
	const bloques = construirBloquesRacha(jugadores);
	const conAmenaza = bloques
		.filter((bloque) => bloque.chasers.length > 0)
		.map((bloque) => ({
			bloque,
			perseguidor: bloque.chasers[0],
			diferencia: bloque.record - bloque.chasers[0].current
		}))
		.sort((actual, siguiente) => {
			if (actual.diferencia !== siguiente.diferencia) {
				return actual.diferencia - siguiente.diferencia;
			}
			if (siguiente.perseguidor.current !== actual.perseguidor.current) {
				return siguiente.perseguidor.current - actual.perseguidor.current;
			}
			return actual.bloque.title.localeCompare(siguiente.bloque.title, "es", { sensitivity: "base" });
		});

	if (conAmenaza.length > 0) {
		const { bloque, perseguidor, diferencia } = conAmenaza[0];
		const propietarios = bloque.owners.map((registro) => registro.jugador.jugador).join(", ");
		return {
			icon: bloque.icon,
			title: bloque.title,
			label: "Radar del torneo",
			headline: `${perseguidor.jugador.jugador} mete presión`,
			body: `Lleva ${perseguidor.current} al hilo y está a ${diferencia} ${diferencia === 1 ? "partido" : "partidos"} del récord histórico de ${bloque.record}.`,
			meta: `Récord en manos de ${propietarios}.`,
			link: "./Rachas.html"
		};
	}

	const vigente = bloques.find((bloque) => bloque.recordVigente) || bloques[0] || null;
	if (!vigente) {
		return {
			icon: "📈",
			title: "Rachas",
			label: "Radar del torneo",
			headline: "Todavía no hay rachas destacadas",
			body: "A medida que se sumen partidos, acá aparecerá la marca más caliente del torneo activo.",
			meta: "La portada se actualiza sola con cada carga nueva.",
			link: "./Rachas.html"
		};
	}

	const duenios = vigente.owners.map((registro) => registro.jugador.jugador).join(", ");
	return {
		icon: vigente.icon,
		title: vigente.title,
		label: "Radar del torneo",
		headline: `${duenios} sostiene${vigente.owners.length > 1 ? "n" : ""} la marca`,
		body: `El récord histórico es de ${vigente.record} partidos en ${vigente.title.toLowerCase()}.`,
		meta: vigente.recordVigente ? "La marca sigue viva en el torneo activo." : "Por ahora nadie amenaza esa marca en esta edición.",
		link: "./Rachas.html"
	};
}

function construirEditorialesRacha(jugadores) {
	return construirBloquesRacha(jugadores)
		.filter((bloque) => bloque.chasers.length > 0)
		.map((bloque) => {
			const perseguidor = bloque.chasers[0];
			const diferencia = bloque.record - perseguidor.current;
			if (diferencia < 1 || diferencia > 2) {
				return null;
			}

			const propietarios = bloque.owners.map((registro) => registro.jugador.jugador).join(", ");
			const templates = {
				victorias: {
					label: "Victorias consecutivas",
					headline: `${perseguidor.jugador.jugador} ya huele una marca grande`,
					body: `Encadenó ${perseguidor.current} victorias consecutivas y quedó a ${diferencia} ${diferencia === 1 ? "partido" : "partidos"} de igualar una de las grandes rachas del torneo.`,
					meta: `La vara está en ${bloque.record} triunfos al hilo y hoy la sostienen ${propietarios}.`
				},
				invicto: {
					label: "Invicto",
					headline: `${perseguidor.jugador.jugador} se mueve sin caídas`,
					body: `Sostiene ${perseguidor.current} partidos sin perder y quedó a ${diferencia} de alcanzar una de las marcas más pesadas del torneo.`,
					meta: `El invicto más largo es de ${bloque.record} partidos y hoy pertenece a ${propietarios}.`
				},
				conGol: {
					label: "Goles seguidos",
					headline: `${perseguidor.jugador.jugador} tiene el gol prendido`,
					body: `Viene de ${perseguidor.current} partidos seguidos convirtiendo y quedó a ${diferencia} de alcanzar el récord histórico.`,
					meta: `La secuencia más larga es de ${bloque.record} partidos y hoy está en manos de ${propietarios}.`
				},
				derrotas: {
					label: "Derrotas consecutivas",
					headline: `${perseguidor.jugador.jugador} entra en una zona delicada`,
					body: `Acumula ${perseguidor.current} derrotas consecutivas y quedó a ${diferencia} ${diferencia === 1 ? "partido" : "partidos"} de igualar la peor racha histórica del torneo.`,
					meta: `La marca más dura es de ${bloque.record} caídas al hilo y hoy pertenece a ${propietarios}.`
				}
			};

			const template = templates[bloque.key];
			if (!template) {
				return null;
			}

			return {
				icon: bloque.icon,
				label: template.label,
				headline: template.headline,
				body: template.body,
				meta: template.meta,
				link: "./Rachas.html"
			};
		})
		.filter(Boolean);
}

function enriquecerPartido(partido) {
	if (!partido) {
		return null;
	}

	return {
		...partido,
		resumenGoleadores: obtenerResumenGoleadoresPartido(partido),
		totalGoles: partido.equipos.reduce((total, equipo) => total + normalizarEntero(equipo.marcador), 0)
	};
}

function obtenerMaximo(lista, selector) {
	return lista.reduce((maximo, item) => Math.max(maximo, selector(item)), 0);
}

function detectarNuevoRecord(filasValidas, partidosHistoricos, ultimoPartido) {
	if (!ultimoPartido) {
		return [];
	}

	const partidosPrevios = partidosHistoricos.filter((partido) => partido.partidoId !== ultimoPartido.partidoId);
	if (!partidosPrevios.length) {
		return [];
	}

	const diferenciaActual = Math.abs((ultimoPartido.equipos[0]?.marcador || 0) - (ultimoPartido.equipos[1]?.marcador || 0));
	const maxGolesPrevio = obtenerMaximo(partidosPrevios, (partido) => partido.totalGoles || 0);
	const maxDifPrevio = obtenerMaximo(partidosPrevios, (partido) => Math.abs((partido.equipos[0]?.marcador || 0) - (partido.equipos[1]?.marcador || 0)));

	const filasPrevias = filasValidas.filter((fila) => fila.partidoId !== ultimoPartido.partidoId);
	const maxIndividualPrevio = obtenerMaximo(filasPrevias, (fila) => fila.goles || 0);
	const goleadorDelUltimo = [...(ultimoPartido.jugadores || [])].sort((actual, siguiente) => {
		if (siguiente.goles !== actual.goles) {
			return siguiente.goles - actual.goles;
		}
		return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
	})[0] || null;

	const candidatos = [];

	if ((ultimoPartido.totalGoles || 0) > maxGolesPrevio) {
		candidatos.push({
			label: "Nuevo récord",
			headline: "Cayó una marca histórica",
			body: `El último partido dejó ${ultimoPartido.totalGoles} goles totales y estableció una nueva marca absoluta del torneo.`,
			meta: `El récord anterior era de ${maxGolesPrevio} goles en un partido.`,
			link: "./Records.html"
		});
	}

	if (diferenciaActual > maxDifPrevio) {
		candidatos.push({
			label: "Nuevo récord",
			headline: "La mayor goleada cambió de dueño",
			body: `La diferencia final fue de ${diferenciaActual} goles y rompió la marca de mayor brecha en un partido.`,
			meta: `La marca previa era de ${maxDifPrevio} goles de diferencia.`,
			link: "./Records.html"
		});
	}

	if (goleadorDelUltimo && (goleadorDelUltimo.goles || 0) > maxIndividualPrevio) {
		candidatos.push({
			label: "Nuevo récord",
			headline: `${goleadorDelUltimo.jugador} escribió una página histórica`,
			body: `Metió ${goleadorDelUltimo.goles} goles en un mismo partido y dejó una nueva marca individual para el torneo.`,
			meta: `El récord anterior era de ${maxIndividualPrevio} goles en un partido.`,
			link: "./Records.html"
		});
	}

	return candidatos;
}

function construirEditorialesCandidatas(snapshot, filasValidas, partidosHistoricos) {
	const candidatas = [];
	const lider = snapshot.lider;
	const segundo = (snapshot.tablaActiva || [])[1] || null;
	const goleador = (snapshot.goleadoresTop || [])[0] || null;
	const perseguidorGol = (snapshot.goleadoresTop || [])[1] || null;
	const ultimoPartido = snapshot.ultimoPartido;

	candidatas.push(...detectarNuevoRecord(filasValidas, partidosHistoricos, ultimoPartido));
	candidatas.push(...construirEditorialesRacha(snapshot.tablaHistorica || []));

	if (lider && segundo) {
		const diferencia = lider.puntos - segundo.puntos;
		candidatas.push({
			label: "Pulso de la tabla",
			headline: diferencia <= 2 ? "La punta sigue al rojo vivo" : `${lider.jugador} marca el ritmo del torneo`,
			body: diferencia <= 2
				? `${lider.jugador} lidera, pero ${segundo.jugador} sigue cerca y mantiene encendida la pelea por la cima.`
				: `${lider.jugador} sacó ventaja en la tabla y hoy conduce la edición activa con margen sobre sus perseguidores.`,
			meta: `${lider.puntos} pts para el líder contra ${segundo.puntos} del escolta.`,
			link: "./tabla.html"
		});
	}

	if (goleador) {
		candidatas.push({
			label: "Bota de Oro",
			headline: perseguidorGol && goleador.goles - perseguidorGol.goles <= 2
				? "La carrera del gol entra en zona caliente"
				: `${goleador.jugador} también manda en el área`,
			body: perseguidorGol
				? `${goleador.jugador} encabeza la tabla de goleadores con ${goleador.goles} tantos, seguido de cerca por ${perseguidorGol.jugador}.`
				: `${goleador.jugador} es, por ahora, el gran artillero de la edición activa.`,
			meta: `${goleador.partidosJugados} PJ · ${goleador.golesPorPartido.toFixed(1)} GxP.`,
			link: "./Goleadores.html"
		});
	}

	if (ultimoPartido) {
		candidatas.push({
			label: "Último partido",
			headline: "La fecha dejó un capítulo fuerte",
			body: `El cruce más reciente terminó ${ultimoPartido.equipos[0]?.marcador || 0}-${ultimoPartido.equipos[1]?.marcador || 0} y volvió a mover el pulso del torneo.`,
			meta: `${ultimoPartido.totalGoles} goles totales · ${ultimoPartido.resumenGoleadores.texto}.`,
			link: `./Resumen.html?partido=${encodeURIComponent(ultimoPartido.partidoId)}`
		});
	}

	if (lider) {
		candidatas.push({
			label: "Jugador del momento",
			headline: `${lider.jugador} atraviesa un tramo fuerte`,
			body: `Lidera la tabla y sostiene un rendimiento que hoy lo pone en el centro de la escena del torneo.`,
			meta: `${lider.puntos} pts · ${lider.goles} goles · ${lider.diferenciaGol} DG.`,
			link: construirUrlJugador(lider.jugador)
		});
	}

	return candidatas.filter(Boolean);
}

function elegirEditorialAleatoria(editoriales) {
	if (!editoriales.length) {
		return null;
	}

	const indice = Math.floor(Math.random() * editoriales.length);
	return editoriales[indice];
}

function construirHomeSnapshot(filasNormalizadas) {
	const filasValidas = filasNormalizadas.filter((fila) => fila.partidoId && fila.jugador && fila.anio !== null);
	const aniosDisponibles = Array.from(new Set(filasValidas.map((fila) => fila.anio))).sort((actual, siguiente) => siguiente - actual);
	const anioActivo = aniosDisponibles[0] || null;
	const filasActivas = anioActivo === null ? [] : filasValidas.filter((fila) => fila.anio === anioActivo);
	const partidosActivos = construirPartidos(filasActivas);
	const partidosHistoricos = construirPartidos(filasValidas).map(enriquecerPartido);
	const tablaActiva = construirEstadisticasTabla(filasActivas);
	const tablaHistorica = construirEstadisticasTabla(filasValidas);
	const goleadoresActivos = construirEstadisticasGoleadores(filasActivas, partidosActivos);
	const lider = tablaActiva[0] || null;
	const ultimoPartido = enriquecerPartido(partidosActivos[0] || partidosHistoricos[0] || null);
	const totalGoles = partidosActivos.reduce((total, partido) => total + partido.equipos.reduce((subtotal, equipo) => subtotal + normalizarEntero(equipo.marcador), 0), 0);
	const jugadoresActivos = new Set(filasActivas.map((fila) => fila.jugador)).size;

	const snapshot = {
		anioActivo,
		seasonStats: {
			partidos: partidosActivos.length,
			jugadores: jugadoresActivos,
			goles: totalGoles
		},
		lider,
		tablaActiva,
		tablaHistorica,
		tablaTop: tablaActiva.slice(0, HOME_PREVIEW_LIMIT),
		goleadoresTop: goleadoresActivos.filter((jugador) => jugador.goles > 0).slice(0, HOME_PREVIEW_LIMIT),
		ultimoPartido,
		rachaEnFoco: construirRachaEnFoco(tablaHistorica)
	};

	snapshot.editorialesCandidatas = construirEditorialesCandidatas(snapshot, filasValidas, partidosHistoricos);
	snapshot.editorialSeleccionada = elegirEditorialAleatoria(snapshot.editorialesCandidatas);

	return snapshot;
}

function obtenerLimiteLideres() {
	return HOME_LEADERS_MAX;
}

function renderizarAvatar(nombreJugador, claseCss = "entity-avatar") {
	const imagen = construirRutaImagenJugador(nombreJugador);
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `<img class="${claseCss}" src="${escaparHtml(imagen)}" alt="${escaparHtml(nombreJugador)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder}';">`;
}

function renderizarDotsForma(partidos) {
	const relleno = Array.from({ length: Math.max(0, HOME_FORM_LIMIT - partidos.length) }, () => ({ resultado: "" }));
	return [...relleno, ...partidos]
		.map((partido) => {
			const clase = partido.resultado === "ganador"
				? "form-dot form-dot--win"
				: partido.resultado === "empate"
					? "form-dot form-dot--draw"
					: partido.resultado === "perdedor"
						? "form-dot form-dot--loss"
						: "form-dot form-dot--empty";
			return `<span class="${clase}"></span>`;
		})
		.join("");
}

function renderizarLeaderSpotlight(lider) {
	if (!lider) {
		return `
			<div class="empty-box">
				<strong>Sin líder disponible</strong>
				<span>Todavía no hay suficientes datos para construir la edición activa.</span>
			</div>
		`;
	}

	return `
		<div class="leader-spotlight__header">
			<span class="leader-spotlight__tag">1° lugar provisional</span>
			<a class="inline-link" href="${escaparHtml(construirUrlJugador(lider.jugador))}">Ver perfil</a>
		</div>
		<div class="leader-spotlight__body">
			${renderizarAvatar(lider.jugador, "leader-spotlight__avatar")}
			<div class="leader-spotlight__identity">
				<strong>${escaparHtml(lider.jugador)}</strong>
				<span>${lider.puntos} pts · ${lider.goles} goles · ${lider.partidosJugados} PJ</span>
			</div>
		</div>
		<div class="leader-spotlight__metrics">
			<div class="mini-metric">
				<span>PxP</span>
				<strong>${lider.puntosPorPartido.toFixed(1)}</strong>
			</div>
			<div class="mini-metric">
				<span>DG</span>
				<strong>${lider.diferenciaGol}</strong>
			</div>
			<div class="mini-metric">
				<span>Forma</span>
				<div class="form-strip">${renderizarDotsForma(lider.ultimosPartidos)}</div>
			</div>
		</div>
	`;
}

function renderizarListaPreview(items, tipo) {
	if (!items.length) {
		return `
			<div class="empty-box">
				<strong>Sin datos todavía</strong>
				<span>La vista se completa cuando haya partidos válidos en la edición activa.</span>
			</div>
		`;
	}

	return items.map((item) => {
		const valorPrincipal = tipo === "tabla"
			? `${item.puntos} pts`
			: `${item.goles} goles`;
		const valorSecundario = tipo === "tabla"
			? `${item.ganados}-${item.empatados}-${item.perdidos}`
			: `${item.golesPorPartido.toFixed(1)} GxP`;
		const extra = tipo === "tabla"
			? `<div class="list-preview__form">${renderizarDotsForma(item.ultimosPartidos)}</div>`
			: `<span class="list-preview__meta">${item.partidosJugados} PJ</span>`;

		return `
			<a class="list-preview__item" href="${escaparHtml(construirUrlJugador(item.jugador))}">
				<span class="list-preview__rank">${item.posicion || items.indexOf(item) + 1}</span>
				${renderizarAvatar(item.jugador, "list-preview__avatar")}
				<div class="list-preview__identity">
					<strong>${escaparHtml(item.jugador)}</strong>
					<span>${valorSecundario}</span>
				</div>
				<div class="list-preview__value-wrap">
					<strong class="list-preview__value">${escaparHtml(valorPrincipal)}</strong>
					${extra}
				</div>
			</a>
		`;
	}).join("");
}

function renderizarLideresCompactos(items) {
	if (!items.length) {
		return `
			<div class="empty-box">
				<strong>Sin líderes todavía</strong>
				<span>Cuando haya partidos válidos, el top 3 aparece acá.</span>
			</div>
		`;
	}

	const limite = Math.max(1, Math.min(items.length, HOME_LEADERS_MAX, obtenerLimiteLideres()));

	return items.slice(0, limite).map((item, index) => `
		<div class="leaders-list__item">
			<span class="leaders-list__rank">${item.posicion || index + 1}</span>
			${renderizarAvatar(item.jugador, "leaders-list__avatar")}
			<div class="leaders-list__identity">
				<strong>${escaparHtml(item.jugador)}</strong>
				<span>${item.partidosJugados} PJ · ${item.ganados}-${item.empatados}-${item.perdidos}</span>
			</div>
			<div class="leaders-list__metric">
				<span>Pts</span>
				<strong>${item.puntos}</strong>
			</div>
			<div class="leaders-list__metric">
				<span>Goles</span>
				<strong>${item.goles}</strong>
			</div>
			<div class="leaders-list__metric">
				<span>Forma / Golómetro</span>
				<strong class="form-strip">${renderizarDotsForma(item.ultimosPartidos)}</strong>
				<strong>${item.golesPorPartido.toFixed(1)} GxP</strong>
			</div>
		</div>
	`).join("");
}

function renderizarUltimoPartido(partido) {
	if (!partido) {
		return `
			<div class="empty-box">
				<strong>Sin último partido</strong>
				<span>Cuando se cargue un nuevo resultado, aparecerá acá.</span>
			</div>
		`;
	}

	const [equipoA, equipoB] = partido.equipos;
	const marcadorA = equipoA?.marcador ?? 0;
	const marcadorB = equipoB?.marcador ?? 0;
	return `
		<div class="match-preview">
			<span class="match-preview__eyebrow">${escaparHtml(formatearFecha(partido.fecha))} · Partido ${escaparHtml(partido.partidoId)}</span>
			<div class="match-preview__score">
				<strong>${marcadorA}</strong>
				<span>-</span>
				<strong>${marcadorB}</strong>
			</div>
			<div class="match-preview__stats">
				<div class="match-preview__stat">
					<span>Goleador${partido.resumenGoleadores.nombres.length > 1 ? "es" : ""}</span>
					<strong>${escaparHtml(partido.resumenGoleadores.texto)}</strong>
				</div>
				<div class="match-preview__stat">
					<span>Goles totales</span>
					<strong>${partido.totalGoles}</strong>
				</div>
			</div>
		</div>
	`;
}

function renderizarEditorial(editorial) {
	if (!editorial) {
		return `
			<div class="empty-box">
				<strong>Sin editorial disponible</strong>
				<span>En cuanto el torneo tenga una historia fuerte para contar, va a aparecer acá.</span>
			</div>
		`;
	}

	const etiqueta = editorial.icon ? `${editorial.icon} ${editorial.label}` : editorial.label;
	const linkTexto = editorial.label === "Nuevo récord" ? "Ver récords" : "Seguir historia";

	return `
		<article class="editorial-story">
			<span class="editorial-story__label">${escaparHtml(etiqueta)}</span>
			<h3 class="editorial-story__headline">${escaparHtml(editorial.headline)}</h3>
			<p class="editorial-story__body">${escaparHtml(editorial.body)}</p>
			<p class="editorial-story__meta">${escaparHtml(editorial.meta)}</p>
			<a class="editorial-story__link" href="${escaparHtml(editorial.link)}">${escaparHtml(linkTexto)} →</a>
		</article>
	`;
}

function renderizarRachaEnFoco(racha) {
	if (!racha) {
		return `
			<div class="empty-box">
				<strong>Sin racha en foco</strong>
				<span>Cuando el torneo levante temperatura, este radar se va a llenar solo.</span>
			</div>
		`;
	}

	return `
		<div class="spotlight-card__label">${escaparHtml(racha.label)}</div>
		<div class="spotlight-card__headline">${escaparHtml(racha.icon)} ${escaparHtml(racha.headline)}</div>
		<div class="spotlight-card__title">${escaparHtml(racha.title)}</div>
		<p class="spotlight-card__body">${escaparHtml(racha.body)}</p>
		<p class="spotlight-card__meta">${escaparHtml(racha.meta)}</p>
		<a class="inline-link inline-link--cta" href="${escaparHtml(racha.link)}">Ver rachas</a>
	`;
}

function actualizarBotonUltimoPartido(partido) {
	const boton = document.getElementById("js-last-match-cta");
	if (!boton || !partido) {
		return;
	}

	boton.href = `./Resumen.html?partido=${encodeURIComponent(partido.partidoId)}`;
	boton.textContent = "Ver ultimo Partido";
}

function renderizarHome(snapshot) {
	const nodoLideres = document.getElementById("js-leaders-compact");
	const nodoUltimo = document.getElementById("js-last-match-preview");
	const nodoEditorial = document.getElementById("js-editorial-story");
	const tablaLideres = snapshot.tablaActiva || snapshot.tablaTop || [];

	if (nodoLideres) {
		nodoLideres.innerHTML = renderizarLideresCompactos(tablaLideres);
	}
	if (nodoUltimo) {
		nodoUltimo.innerHTML = renderizarUltimoPartido(snapshot.ultimoPartido);
	}
	if (nodoEditorial) {
		nodoEditorial.innerHTML = renderizarEditorial(snapshot.editorialSeleccionada);
	}

	actualizarBotonUltimoPartido(snapshot.ultimoPartido);
}

function rehidratarHomeDesdeSnapshot() {
	if (typeof window === "undefined" || !window.__HOME_SNAPSHOT__) {
		return;
	}

	renderizarHome(window.__HOME_SNAPSHOT__);
}

function renderizarErrorHome(error) {
	console.error("No se pudo cargar la portada:", error);
	const mensaje = "No pudimos cargar el resumen en vivo ahora mismo.";
	const detalle = "Podés entrar igual al sitio y navegar las secciones manualmente.";

	["js-leaders-compact", "js-last-match-preview", "js-editorial-story"].forEach((id) => {
		const nodo = document.getElementById(id);
		if (nodo) {
			nodo.innerHTML = `
				<div class="empty-box">
					<strong>${mensaje}</strong>
					<span>${detalle}</span>
				</div>
			`;
		}
	});
}

async function iniciarHome() {
	if (typeof window === "undefined" || !window.lectorDatos) {
		return;
	}

	try {
		const filas = await window.lectorDatos.obtenerFilasPartidos();
		const filasNormalizadas = filas.map(normalizarFilaCruda).filter((fila) => fila.partidoId && fila.jugador);
		const snapshot = construirHomeSnapshot(filasNormalizadas);
		window.__HOME_SNAPSHOT__ = snapshot;
		renderizarHome(snapshot);
	} catch (error) {
		renderizarErrorHome(error);
	}
}

const homeApi = {
	normalizarTexto,
	normalizarEntero,
	parsearFecha,
	normalizarFilaCruda,
	construirPartidos,
	construirEstadisticasTabla,
	construirEstadisticasGoleadores,
	construirHomeSnapshot,
	construirRachaEnFoco,
	construirEditorialesCandidatas,
	construirEditorialesRacha,
	elegirEditorialAleatoria
};

if (typeof window !== "undefined") {
	window.homeApi = homeApi;
	window.addEventListener("DOMContentLoaded", iniciarHome);
	window.addEventListener("resize", rehidratarHomeDesdeSnapshot);
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = homeApi;
}
