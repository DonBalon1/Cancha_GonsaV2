const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirResumenPartidos,
	construirEstadisticasGoleadores,
	formatearDecimal,
	formatearPorcentaje
} = require("./Goleadores.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidosMap = construirResumenPartidos(filasNormalizadas);
	const estadisticas = construirEstadisticasGoleadores(filasNormalizadas, partidosMap);

	console.log(`Registros: ${filasNormalizadas.length}`);
	console.log(`Jugadores: ${estadisticas.length}`);
	console.log("Top 10 goleadores:");

	estadisticas.slice(0, 10).forEach((jugador, indice) => {
		console.log(
			`${indice + 1}. ${jugador.jugador} | ${jugador.goles} goles | Veces goleador ${jugador.vecesGoleador} | ` +
			`GxP ${formatearDecimal(jugador.golesPorPartido)} | Dif ${jugador.diferenciaGol} | ` +
			`Efect. ${formatearPorcentaje(jugador.efectividadGol)}`
		);
	});
}

main().catch((error) => {
	console.error("No se pudo verificar la tabla de goleadores:", error);
	process.exitCode = 1;
});