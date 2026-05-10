const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirResumenPartidos,
	construirEstadisticasJugadores,
	formatearDecimal,
	formatearPorcentaje
} = require("./tabla.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidosMap = construirResumenPartidos(filasNormalizadas);
	const estadisticas = construirEstadisticasJugadores(filasNormalizadas, partidosMap);

	console.log(`Registros: ${filasNormalizadas.length}`);
	console.log(`Partidos: ${partidosMap.size}`);
	console.log(`Jugadores: ${estadisticas.length}`);
	console.log("Top 10 tabla general:");

	estadisticas.slice(0, 10).forEach((jugador, indice) => {
		console.log(
			`${indice + 1}. ${jugador.jugador} | ${jugador.puntos} pts | ${jugador.ganados}-${jugador.empatados}-${jugador.perdidos} | ` +
			`${jugador.goles} goles | PxP ${formatearDecimal(jugador.puntosPorPartido)} | ` +
			`Efect. ${formatearPorcentaje(jugador.efectividadGol)}`
		);
	});
}

main().catch((error) => {
	console.error("No se pudo verificar la tabla:", error);
	process.exitCode = 1;
});