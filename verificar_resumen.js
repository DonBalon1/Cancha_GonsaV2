const { obtenerFilasPartidos } = require("./lector_datos.js");
const { normalizarFilaCruda, construirPartidos, formatearFecha } = require("./Resumen.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidos = construirPartidos(filasNormalizadas);
	const partido = partidos[0];

	if (!partido) {
		console.log("No hay partidos disponibles");
		return;
	}

	console.log(`Partido ${partido.partidoId} · ${formatearFecha(partido.fecha)}`);
	partido.equipos.forEach((equipo) => {
		console.log(`Equipo ${equipo.equipoId}: ${equipo.marcador} (${equipo.resultado})`);
		equipo.jugadores.forEach((jugador) => {
			console.log(` - ${jugador.jugador}: goles=${jugador.goles} autogoles=${jugador.autogoles}`);
		});
	});
}

main().catch((error) => {
	console.error("No se pudo verificar el resumen:", error);
	process.exitCode = 1;
});