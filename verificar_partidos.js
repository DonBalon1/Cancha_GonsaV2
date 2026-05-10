const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirPartidos,
	filtrarPartidos,
	obtenerResumenGoleadoresPartido,
	obtenerTotalAutogoles,
	obtenerTotalGoles,
	formatearFecha
} = require("./Partidos.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidos = construirPartidos(filasNormalizadas);
	const anio = partidos[0]?.anio;
	const filtrados = filtrarPartidos(partidos, { anio, mes: "all", resultado: "all" }).slice(0, 3);

	if (filtrados.length === 0) {
		console.log("No hay partidos disponibles");
		return;
	}

	filtrados.forEach((partido) => {
		const [equipoA, equipoB] = partido.equipos;
		const goleadores = obtenerResumenGoleadoresPartido(partido);
		console.log(`${formatearFecha(partido.fecha)} · Partido ${partido.partidoId}`);
		console.log(`  Marcador: ${equipoA?.marcador ?? 0}-${equipoB?.marcador ?? 0}`);
		console.log(`  Goleadores: ${goleadores.texto}`);
		console.log(`  Goles totales: ${obtenerTotalGoles(partido)} | AG: ${obtenerTotalAutogoles(partido)}`);
	});
}

main().catch((error) => {
	console.error("No se pudo verificar la pestaña Partidos:", error);
	process.exitCode = 1;
});
