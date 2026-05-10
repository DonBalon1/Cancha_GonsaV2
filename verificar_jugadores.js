const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	obtenerAniosDisponibles,
	filtrarFilasPorAnio,
	construirResumenPartidos,
	construirEstadisticasJugadores,
	calcularPosicionesPorPuntos
} = require("./Jugadores.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const anios = obtenerAniosDisponibles(filasNormalizadas);
	const anio = anios[0] ?? "historico";
	const filasFiltradas = filtrarFilasPorAnio(filasNormalizadas, anio);
	const partidos = construirResumenPartidos(filasFiltradas);
	const ranking = calcularPosicionesPorPuntos(construirEstadisticasJugadores(filasFiltradas, partidos));
	const jugador = ranking[0];

	if (!jugador) {
		console.log("No hay jugadores disponibles");
		return;
	}

	console.log(`Jugador: ${jugador.jugador}`);
	console.log(`Año: ${anio}`);
	console.log(`Posición: #${jugador.posicionTabla}`);
	console.log(`Puntos: ${jugador.puntos} | Goles: ${jugador.goles} | PJ: ${jugador.partidosJugados}`);
	console.log(`Últimos 3 partidos:`);
	jugador.historialOrdenado.slice(0, 3).forEach((partido) => {
		console.log(` - ${partido.fechaTexto} · Partido ${partido.partidoId} · ${partido.resultado} · goles=${partido.goles}`);
	});
}

main().catch((error) => {
	console.error("No se pudo verificar la pestaña Jugadores:", error);
	process.exitCode = 1;
});
