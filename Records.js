const FILTRO_HISTORICO = "historico";
const MIN_PARTIDOS_PROMEDIO_TEMPORADA = 5;

const estadoRecords = {
	filasCrudas: [],
	filasNormalizadas: [],
	partidos: [],
	jugadores: [],
	aniosDisponibles: []
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

function formatearNumero(valor, decimales = 0) {
	return Number(valor || 0).toLocaleString("es-AR", {
		minimumFractionDigits: decimales,
		maximumFractionDigits: decimales
	});
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
				.map((fila) => fila.anio)
				.filter((anio) => anio !== null)
		)
	).sort((actual, siguiente) => siguiente - actual);
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
					const rival = Array.from(partido.equipos.values()).find((item) => item.equipo !== equipo.equipo) || { goles: 0, autogoles: 0, equipo: "Rival" };
					const golesAFavor = equipo.goles + rival.autogoles;
					const golesEnContra = rival.goles + equipo.autogoles;

					return {
						...equipo,
						golesAFavor,
						golesEnContra,
						diferencia: golesAFavor - golesEnContra,
						jugadores: [...equipo.jugadores].sort((actual, siguiente) => {
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

function calcularVecesGoleador(partidos) {
	const conteo = new Map();

	partidos.forEach((partido) => {
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

function construirEstadisticasJugadores(filasNormalizadas, partidos) {
	const partidosMap = new Map(partidos.map((partido) => [partido.partidoId, partido]));
	const jugadores = new Map();
	const totalPartidos = partidos.length;
	const vecesGoleadorMap = calcularVecesGoleador(partidos);

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
			anio: fila.anio,
			resultado: resultadoNormalizado,
			goles: fila.goles,
			autogoles: fila.autogoles,
			puntos: fila.puntos,
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
				vecesGoleador: vecesGoleadorMap.get(jugador.jugador) || 0,
				porcentajeVictorias: jugador.partidosJugados ? (jugador.ganados / jugador.partidosJugados) * 100 : 0,
				porcentajePresencias: totalPartidos ? (jugador.partidosJugados / totalPartidos) * 100 : 0,
				puntosPorPartido: jugador.partidosJugados ? jugador.puntos / jugador.partidosJugados : 0,
				golesPorPartido: jugador.partidosJugados ? jugador.goles / jugador.partidosJugados : 0,
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
			if (siguiente.goles !== actual.goles) {
				return siguiente.goles - actual.goles;
			}
			return actual.jugador.localeCompare(siguiente.jugador, "es", { sensitivity: "base" });
		});
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
	let actual = 0;
	let mejor = 0;

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

function crearComparadorNombreYDetalle() {
	return (actual, siguiente) => {
		const nombre = actual.nombre.localeCompare(siguiente.nombre, "es", { sensitivity: "base" });
		if (nombre !== 0) {
			return nombre;
		}
		return String(actual.detalle || "").localeCompare(String(siguiente.detalle || ""), "es", { sensitivity: "base" });
	};
}

function resolverRecord(registros, obtenerValor, opciones = {}) {
	const {
		minimo = 1,
		tolerancia = 0.000001,
		ordenar = null
	} = opciones;

	if (!Array.isArray(registros) || registros.length === 0) {
		return null;
	}

	const comparadorSecundario = ordenar || crearComparadorNombreYDetalle();
	const registrosOrdenados = [...registros].sort((actual, siguiente) => {
		const valorSiguiente = Number(obtenerValor(siguiente)) || 0;
		const valorActual = Number(obtenerValor(actual)) || 0;

		if (valorSiguiente !== valorActual) {
			return valorSiguiente - valorActual;
		}

		return comparadorSecundario(actual, siguiente);
	});

	const maximo = registrosOrdenados.reduce((valorMaximo, registro) => Math.max(valorMaximo, Number(obtenerValor(registro)) || 0), Number.NEGATIVE_INFINITY);
	if (!Number.isFinite(maximo) || maximo < minimo) {
		return null;
	}

	const grupos = [];
	let grupoActual = null;

	registrosOrdenados.forEach((registro, indice) => {
		const valor = Number(obtenerValor(registro)) || 0;

		if (!grupoActual || Math.abs(valor - grupoActual.valor) > tolerancia) {
			grupoActual = {
				puesto: indice + 1,
				valor,
				registros: []
			};
			grupos.push(grupoActual);
		}

		grupoActual.registros.push(registro);
	});

	const lideres = grupos[0]?.registros || [];

	return {
		valor: maximo,
		lideres,
		podio: grupos.slice(0, 3)
	};
}

function construirUrlJugador(nombreJugador) {
	const parametros = new URLSearchParams({
		anio: FILTRO_HISTORICO,
		minPj: "0",
		jugador: nombreJugador
	});
	return `./Jugadores.html?${parametros.toString()}`;
}

function construirUrlPartido(partidoId) {
	const parametros = new URLSearchParams({ partido: String(partidoId) });
	return `./Resumen.html?${parametros.toString()}`;
}

function construirDetalleMarcador(equipo) {
	return `${equipo.golesAFavor}-${equipo.golesEnContra}`;
}

function construirRutaImagenJugador(nombreJugador) {
	return `./assets/jugadores/jugador-${normalizarTexto(nombreJugador)}.png`;
}

function construirAvatarJugador(nombreJugador) {
	const imagen = construirRutaImagenJugador(nombreJugador);
	const placeholder = "./assets/jugadores/jugador-vacio.png";
	return `
		<img
			class="leader-row__avatar"
			src="${escaparHtml(imagen)}"
			alt="${escaparHtml(nombreJugador)}"
			loading="lazy"
			onerror="this.onerror=null;this.src='${placeholder}';"
		>
	`;
}

function construirActuacionesPartido(filasNormalizadas, partidos) {
	const partidosMap = new Map(partidos.map((partido) => [partido.partidoId, partido]));

	return filasNormalizadas.map((fila) => {
		const partido = partidosMap.get(fila.partidoId);
		const equipo = (partido?.equipos || []).find((item) => item.equipo === fila.equipo) || {
			equipo: fila.equipo,
			golesAFavor: fila.goles,
			golesEnContra: 0,
			diferencia: fila.goles
		};
		const rival = (partido?.equipos || []).find((item) => item.equipo !== fila.equipo) || { equipo: "Rival" };

		return {
			nombre: fila.jugador,
			jugador: fila.jugador,
			partidoId: fila.partidoId,
			fecha: fila.fecha,
			fechaTexto: fila.fechaTexto,
			anio: fila.anio,
			equipo: fila.equipo,
			rival: rival.equipo,
			goles: fila.goles,
			puntos: fila.puntos,
			autogoles: fila.autogoles,
			impacto: fila.goles + fila.puntos,
			marcador: construirDetalleMarcador(equipo),
			detalle: `${fila.fechaTexto} · Partido ${fila.partidoId}`,
			extra: fila.puntos > 0 ? `${fila.puntos} pts en cancha` : "Sin puntos en cancha",
			avatar: construirRutaImagenJugador(fila.jugador),
			urlJugador: construirUrlJugador(fila.jugador),
			urlPartido: construirUrlPartido(fila.partidoId)
		};
	});
}

function construirRegistrosPartidosGlobales(partidos) {
	return partidos.map((partido) => {
		const [equipoA, equipoB] = partido.equipos;
		const marcadorA = equipoA?.golesAFavor ?? 0;
		const marcadorB = equipoB?.golesAFavor ?? 0;

		return {
			nombre: `Partido ${partido.partidoId}`,
			totalGoles: marcadorA + marcadorB,
			diferencia: Math.abs(marcadorA - marcadorB),
			detalle: partido.fechaTexto,
			extra: `Resultado ${marcadorA}-${marcadorB}`,
			urlPartido: construirUrlPartido(partido.partidoId)
		};
	});
}

function construirTemporadasJugador(filasNormalizadas) {
	const temporadas = [];
	const anios = obtenerAniosDisponibles(filasNormalizadas);

	anios.forEach((anio) => {
		const filasAnio = filasNormalizadas.filter((fila) => fila.anio === anio);
		const partidosAnio = construirResumenPartidos(filasAnio);
		const jugadoresAnio = construirEstadisticasJugadores(filasAnio, partidosAnio);

		jugadoresAnio.forEach((jugador) => {
			temporadas.push({
				nombre: jugador.jugador,
				jugador: jugador.jugador,
				anio,
				puntos: jugador.puntos,
				goles: jugador.goles,
				partidosJugados: jugador.partidosJugados,
				puntosPorPartido: jugador.puntosPorPartido,
				golesPorPartido: jugador.golesPorPartido,
				detalle: `Temporada ${anio} · ${jugador.partidosJugados} PJ`,
				extra: `${jugador.puntos} pts · ${jugador.goles} goles`,
				avatar: construirRutaImagenJugador(jugador.jugador),
				urlJugador: construirUrlJugador(jugador.jugador)
			});
		});
	});

	return temporadas;
}

function construirRegistrosHistoricos(jugadores) {
	return jugadores.map((jugador) => ({
		nombre: jugador.jugador,
		jugador: jugador.jugador,
		puntos: jugador.puntos,
		goles: jugador.goles,
		partidosJugados: jugador.partidosJugados,
		vecesGoleador: jugador.vecesGoleador,
		puntosPorPartido: jugador.puntosPorPartido,
		golesPorPartido: jugador.golesPorPartido,
		detalle: `${jugador.partidosJugados} PJ · ${formatearNumero(jugador.puntosPorPartido, 2)} PxP`,
		extra: `${jugador.puntos} pts · ${jugador.goles} goles`,
		avatar: construirRutaImagenJugador(jugador.jugador),
		urlJugador: construirUrlJugador(jugador.jugador)
	}));
}

function crearTarjetaRecord({ titulo, subtitulo, icono, unidad, decimales = 0, resultado, lideresMapper }) {
	if (!resultado) {
		return null;
	}

	return {
		titulo,
		subtitulo,
		icono,
		unidad,
		decimales,
		valor: resultado.valor,
		valorFormateado: formatearNumero(resultado.valor, decimales),
		lideres: resultado.lideres.map(lideresMapper),
		podio: (resultado.podio || []).map((grupo) => ({
			puesto: grupo.puesto,
			valor: grupo.valor,
			valorFormateado: formatearNumero(grupo.valor, decimales),
			participantes: grupo.registros.map(lideresMapper)
		}))
	};
}

function construirCatalogoRecords(filasNormalizadas, partidos, jugadores) {
	const actuacionesPartido = construirActuacionesPartido(filasNormalizadas, partidos);
	const partidosGlobales = construirRegistrosPartidosGlobales(partidos);
	const temporadas = construirTemporadasJugador(filasNormalizadas);
	const historicos = construirRegistrosHistoricos(jugadores);

	const secciones = [
		{
			tema: "partido",
			titulo: "Partido",
			descripcion: "Marcas que nacen en una sola fecha: actuaciones top, partidos abiertos y goleadas pesadas.",
			cards: [
				crearTarjetaRecord({
					titulo: "Más goles de un jugador en un partido",
					subtitulo: "La mejor actuación goleadora en una sola noche.",
					icono: "⚽",
					unidad: "goles",
					resultado: resolverRecord(actuacionesPartido, (registro) => registro.goles),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: registro.extra,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador,
						urlPartido: registro.urlPartido
					})
				}),
				crearTarjetaRecord({
					titulo: "Partido con más goles totales",
					subtitulo: "El cruce más abierto y frenético de todo el historial.",
					icono: "🎆",
					unidad: "goles",
					resultado: resolverRecord(partidosGlobales, (registro) => registro.totalGoles),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: registro.extra,
						urlPartido: registro.urlPartido
					})
				}),
				crearTarjetaRecord({
					titulo: "Mayor goleada registrada",
					subtitulo: "La diferencia de gol más amplia en un partido.",
					icono: "🔥",
					unidad: "goles",
					resultado: resolverRecord(partidosGlobales, (registro) => registro.diferencia),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: registro.extra,
						urlPartido: registro.urlPartido
					})
				})
			].filter(Boolean)
		},
		{
			tema: "temporada",
			titulo: "Temporada",
			descripcion: "Los picos más altos cuando se mira un año completo de competencia.",
			cards: [
				crearTarjetaRecord({
					titulo: "Más puntos en una temporada",
					subtitulo: "La campaña con mayor cosecha total de puntos.",
					icono: "📈",
					unidad: "pts",
					resultado: resolverRecord(temporadas, (registro) => registro.puntos),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: `${registro.puntos} pts · ${registro.goles} goles`,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				}),
				crearTarjetaRecord({
					titulo: "Más goles en una temporada",
					subtitulo: "El techo goleador más alto en un mismo año.",
					icono: "🥅",
					unidad: "goles",
					resultado: resolverRecord(temporadas, (registro) => registro.goles),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: `${registro.goles} goles · ${registro.puntos} pts`,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				}),
				crearTarjetaRecord({
					titulo: "Mejor PxP de una temporada",
					subtitulo: `Promedio de puntos por partido con piso de ${MIN_PARTIDOS_PROMEDIO_TEMPORADA} PJ.`,
					icono: "🎯",
					unidad: "PxP",
					decimales: 2,
					resultado: resolverRecord(
						temporadas.filter((registro) => registro.partidosJugados >= MIN_PARTIDOS_PROMEDIO_TEMPORADA),
						(registro) => registro.puntosPorPartido,
						{ minimo: 0.01 }
					),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: `${registro.puntos} pts en ${registro.partidosJugados} PJ`,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				})
			].filter(Boolean)
		},
		{
			tema: "historico",
			titulo: "Histórico",
			descripcion: "Los acumulados más pesados de toda la historia del torneo.",
			cards: [
				crearTarjetaRecord({
					titulo: "Máximo puntaje histórico",
					subtitulo: "El jugador con más puntos sumados en toda la historia.",
					icono: "👑",
					unidad: "pts",
					resultado: resolverRecord(historicos, (registro) => registro.puntos),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: registro.extra,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				}),
				crearTarjetaRecord({
					titulo: "Máximo goleador histórico",
					subtitulo: "El artillero con más goles convertidos en el acumulado total.",
					icono: "🎖️",
					unidad: "goles",
					resultado: resolverRecord(historicos, (registro) => registro.goles),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: `${registro.goles} goles · ${registro.puntos} pts`,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				}),
				crearTarjetaRecord({
					titulo: "Más partidos jugados",
					subtitulo: "La presencia histórica más alta del torneo.",
					icono: "🧱",
					unidad: "PJ",
					resultado: resolverRecord(historicos, (registro) => registro.partidosJugados),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: `${registro.partidosJugados} PJ · ${registro.puntos} pts`,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				}),
				crearTarjetaRecord({
					titulo: "Veces goleador del partido",
					subtitulo: "Cantidad de jornadas como máximo anotador del encuentro.",
					icono: "🌟",
					unidad: "veces",
					resultado: resolverRecord(historicos, (registro) => registro.vecesGoleador),
					lideresMapper: (registro) => ({
						nombre: registro.nombre,
						detalle: registro.detalle,
						extra: `${registro.vecesGoleador} partidos como goleador top`,
						avatar: registro.avatar,
						urlJugador: registro.urlJugador
					})
				})
			].filter(Boolean)
		}
	];

	return secciones.filter((seccion) => seccion.cards.length > 0);
}

function renderizarFilaLider(lider) {
	const avatar = lider.avatar ? construirAvatarJugador(lider.nombre) : "";
	const nombre = lider.urlJugador
		? `<a href="${escaparHtml(lider.urlJugador)}">${escaparHtml(lider.nombre)}</a>`
		: escaparHtml(lider.nombre);

	return `
		<div class="leader-row">
			<div class="leader-row__main-wrap">
				${avatar}
				<div class="leader-row__main">
					<span class="leader-row__name">${nombre}</span>
					${lider.detalle ? `<span class="leader-row__detail">${escaparHtml(lider.detalle)}</span>` : ""}
					${lider.extra ? `<span class="leader-row__extra">${escaparHtml(lider.extra)}</span>` : ""}
				</div>
			</div>
			<div class="leader-row__actions">
				${lider.urlJugador ? `<a class="link-pill" href="${escaparHtml(lider.urlJugador)}">Ver jugador</a>` : ""}
				${lider.urlPartido ? `<a class="link-pill" href="${escaparHtml(lider.urlPartido)}">Ver partido</a>` : ""}
			</div>
		</div>
	`;
}

function renderizarFilaPodio(participante) {
	const avatar = participante.avatar ? construirAvatarJugador(participante.nombre) : "";
	const nombre = participante.urlJugador
		? `<a href="${escaparHtml(participante.urlJugador)}">${escaparHtml(participante.nombre)}</a>`
		: escaparHtml(participante.nombre);

	return `
		<div class="podium-row">
			<div class="podium-row__main-wrap">
				${avatar}
				<div class="podium-row__main">
					<span class="podium-row__name">${nombre}</span>
					${participante.detalle ? `<span class="podium-row__detail">${escaparHtml(participante.detalle)}</span>` : ""}
					${participante.extra ? `<span class="podium-row__extra">${escaparHtml(participante.extra)}</span>` : ""}
				</div>
			</div>
			<div class="podium-row__actions">
				${participante.urlJugador ? `<a class="link-pill" href="${escaparHtml(participante.urlJugador)}">Ver jugador</a>` : ""}
				${participante.urlPartido ? `<a class="link-pill" href="${escaparHtml(participante.urlPartido)}">Ver partido</a>` : ""}
			</div>
		</div>
	`;
}

function obtenerMedallaPodio(puesto) {
	if (puesto === 1) {
		return "🥇";
	}
	if (puesto === 2) {
		return "🥈";
	}
	if (puesto === 3) {
		return "🥉";
	}
	return "🏅";
}

function renderizarGrupoPodio(grupo, unidad) {
	const etiquetaEmpate = grupo.participantes.length > 1 ? ` · Empate entre ${grupo.participantes.length}` : "";
	const medalla = obtenerMedallaPodio(grupo.puesto);

	return `
		<div class="podium-group podium-group--${grupo.puesto}">
			<div class="podium-group__head">
				<span class="podium-group__place"><span class="podium-group__medal">${medalla}</span><span class="podium-group__place-text">${grupo.puesto}° puesto</span></span>
				<span class="podium-group__value">${escaparHtml(grupo.valorFormateado)} ${escaparHtml(unidad)}${escaparHtml(etiquetaEmpate)}</span>
			</div>
			<div class="podium-group__rows">
				${grupo.participantes.map(renderizarFilaPodio).join("")}
			</div>
		</div>
	`;
}

function renderizarTarjetaRecord(card, tema, cardId) {
	const textoEmpate = card.lideres.length > 1 ? `Empate entre ${card.lideres.length}` : "Único líder";
	const podiumId = `podium-${cardId}`;
	const mostrarPodio = Array.isArray(card.podio) && card.podio.length > 0;

	return `
		<article class="record-card record-card--${escaparHtml(tema)}" data-record-card>
			<div class="record-card__top">
				<div>
					<h3 class="record-card__title">${escaparHtml(card.titulo)}</h3>
					<p class="record-card__subtitle">${escaparHtml(card.subtitulo)}</p>
				</div>
				<span class="record-card__icon">${card.icono}</span>
			</div>

			<div class="record-card__value">
				<span class="record-card__value-note">Récord vigente</span>
				<div class="record-card__value-main">
					<span class="record-card__number">${escaparHtml(card.valorFormateado)}</span>
					<span class="record-card__unit">${escaparHtml(card.unidad)}</span>
				</div>
			</div>

			<div class="record-card__leaders">
				<div class="record-card__leaders-head">
					<p class="record-card__leaders-title">Dueño del récord</p>
					<span class="record-card__badge">${escaparHtml(textoEmpate)}</span>
				</div>
				${card.lideres.map(renderizarFilaLider).join("")}
			</div>

			${mostrarPodio ? `
				<div class="record-card__footer">
					<button
						type="button"
						class="record-card__toggle"
						data-podium-toggle="${escaparHtml(podiumId)}"
						aria-controls="${escaparHtml(podiumId)}"
						aria-expanded="false"
					>
						<span class="record-card__toggle-label">Ver podio</span>
						<span class="record-card__toggle-icon" aria-hidden="true">▼</span>
					</button>
					<div class="record-card__podium" id="${escaparHtml(podiumId)}" hidden>
						<div class="record-card__podium-head">
							<p class="record-card__podium-title">Podio del récord</p>
							<span class="record-card__podium-meta">Top 3 por puesto real</span>
						</div>
						<div class="podium-list">
							${card.podio.map((grupo) => renderizarGrupoPodio(grupo, card.unidad)).join("")}
						</div>
					</div>
				</div>
			` : ""}
		</article>
	`;
}

function renderizarSeccionesRecords(secciones) {
	return secciones.map((seccion, seccionIndice) => `
		<section class="panel records-section records-section--${escaparHtml(seccion.tema)}">
			<header class="section-head">
				<div>
					<h2>${escaparHtml(seccion.titulo)}</h2>
					<p>${escaparHtml(seccion.descripcion)}</p>
				</div>
				<span class="section-chip">${seccion.cards.length} récord${seccion.cards.length === 1 ? "" : "s"}</span>
			</header>
			<div class="records-grid">
				${seccion.cards.map((card, cardIndice) => renderizarTarjetaRecord(card, seccion.tema, `${seccion.tema}-${seccionIndice}-${cardIndice}`)).join("")}
			</div>
		</section>
	`).join("");
}

function configurarPodios(shell) {
	if (!shell) {
		return;
	}

	function actualizarToggle(toggle, abierto) {
		toggle.setAttribute("aria-expanded", abierto ? "true" : "false");
		const label = toggle.querySelector(".record-card__toggle-label");
		const icono = toggle.querySelector(".record-card__toggle-icon");
		if (label) {
			label.textContent = abierto ? "Ocultar podio" : "Ver podio";
		}
		if (icono) {
			icono.textContent = abierto ? "▲" : "▼";
		}
	}

	shell.addEventListener("click", (evento) => {
		const boton = evento.target.closest("[data-podium-toggle]");
		if (!boton || !shell.contains(boton)) {
			return;
		}

		const podiumId = boton.getAttribute("data-podium-toggle");
		const panelObjetivo = podiumId ? document.getElementById(podiumId) : null;
		if (!panelObjetivo) {
			return;
		}

		const estaAbierto = boton.getAttribute("aria-expanded") === "true";

		shell.querySelectorAll("[data-podium-toggle]").forEach((toggle) => {
			actualizarToggle(toggle, false);
		});

		shell.querySelectorAll(".record-card__podium").forEach((panel) => {
			panel.hidden = true;
			panel.classList.remove("is-open");
		});

		shell.querySelectorAll("[data-record-card]").forEach((card) => {
			card.classList.remove("record-card--podium-open");
		});

		if (!estaAbierto) {
			actualizarToggle(boton, true);
			panelObjetivo.hidden = false;
			panelObjetivo.classList.add("is-open");
			boton.closest("[data-record-card]")?.classList.add("record-card--podium-open");
		}
	});
}

function obtenerRangoAniosTexto(aniosDisponibles) {
	if (!Array.isArray(aniosDisponibles) || aniosDisponibles.length === 0) {
		return "--";
	}

	const aniosOrdenados = [...aniosDisponibles].sort((actual, siguiente) => actual - siguiente);
	const anioInicial = aniosOrdenados[0];
	const anioFinal = aniosOrdenados[aniosOrdenados.length - 1];

	return anioInicial === anioFinal ? String(anioInicial) : `${anioInicial} - ${anioFinal}`;
}

function actualizarResumenGeneral(secciones) {
	const nodoAnios = document.getElementById("js-summary-years");
	const nodoPartidos = document.getElementById("js-summary-matches");
	const nodoJugadores = document.getElementById("js-summary-players");
	const nodoCards = document.getElementById("js-summary-cards");

	if (!nodoAnios || !nodoPartidos || !nodoJugadores || !nodoCards) {
		return;
	}

	const totalCards = secciones.reduce((total, seccion) => total + seccion.cards.length, 0);
	nodoAnios.textContent = obtenerRangoAniosTexto(estadoRecords.aniosDisponibles);
	nodoPartidos.textContent = formatearNumero(estadoRecords.partidos.length);
	nodoJugadores.textContent = formatearNumero(estadoRecords.jugadores.length);
	nodoCards.textContent = String(totalCards);
}

function renderizarRecords() {
	const shell = document.getElementById("js-records-shell");
	const secciones = construirCatalogoRecords(estadoRecords.filasNormalizadas, estadoRecords.partidos, estadoRecords.jugadores);

	actualizarResumenGeneral(secciones);

	if (!secciones.length) {
		shell.innerHTML = `
			<div class="panel empty-state">
				<strong>Sin récords disponibles</strong>
				<span>No se encontraron datos suficientes para construir marcas históricas.</span>
			</div>
		`;
		return;
	}

	shell.innerHTML = renderizarSeccionesRecords(secciones);
}

async function inicializarRecords() {
	const shell = typeof document !== "undefined" ? document.getElementById("js-records-shell") : null;

	try {
		const lector = typeof window !== "undefined" ? window.lectorDatos : null;
		if (!lector?.obtenerFilasPartidos) {
			throw new Error("No se encontró el lector de datos.");
		}

		estadoRecords.filasCrudas = await lector.obtenerFilasPartidos();
		estadoRecords.filasNormalizadas = estadoRecords.filasCrudas
			.map(normalizarFilaCruda)
			.filter((fila) => fila.partidoId && fila.jugador);
		estadoRecords.partidos = construirResumenPartidos(estadoRecords.filasNormalizadas);
		estadoRecords.jugadores = construirEstadisticasJugadores(estadoRecords.filasNormalizadas, estadoRecords.partidos);
		estadoRecords.aniosDisponibles = obtenerAniosDisponibles(estadoRecords.filasNormalizadas);

		configurarPodios(shell);
		renderizarRecords();
	} catch (error) {
		console.error("No se pudieron cargar los récords:", error);
		if (shell) {
			shell.innerHTML = `
				<div class="panel empty-state">
					<strong>No se pudieron cargar los récords</strong>
					<span>${escaparHtml(error.message || "Revisá la conexión con la hoja de datos.")}</span>
				</div>
			`;
		}
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("DOMContentLoaded", inicializarRecords);
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		FILTRO_HISTORICO,
		MIN_PARTIDOS_PROMEDIO_TEMPORADA,
		normalizarFilaCruda,
		obtenerAniosDisponibles,
		construirResumenPartidos,
		construirEstadisticasJugadores,
		calcularRachasJugador,
		construirCatalogoRecords,
		formatearNumero,
		formatearFecha
	};
}
