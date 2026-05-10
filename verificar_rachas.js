const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirResumenPartidos,
	construirEstadisticasJugadores,
	construirBloquesRachas
} = require("./Rachas.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidos = construirResumenPartidos(filasNormalizadas);
	const jugadores = construirEstadisticasJugadores(filasNormalizadas, partidos);
	const bloques = construirBloquesRachas(jugadores);

	console.log(`Partidos: ${partidos.length}`);
	console.log(`Jugadores: ${jugadores.length}`);
	console.log("");

	bloques.forEach((bloque) => {
		const propietarios = bloque.propietarios.map((persona) => persona.nombre).join(", ");
		console.log(`== ${bloque.titulo.toUpperCase()} ==`);
		console.log(`Récord: ${bloque.valorRecord} partidos · ${bloque.estadoRecord}`);
		console.log(`Dueño(s): ${propietarios}`);

		if (bloque.perseguidores.length) {
			bloque.perseguidores.forEach((perseguidor, indice) => {
				console.log(`Perseguidor ${indice + 1}: ${perseguidor.nombre} · ${perseguidor.valorActual} partidos · ${perseguidor.extra}`);
			});
		} else {
			console.log("Perseguidores: sin perseguidores activos");
		}

		console.log("");
	});
}

main().catch((error) => {
	console.error("No se pudo verificar la pestaña Rachas:", error);
	process.exitCode = 1;
});
