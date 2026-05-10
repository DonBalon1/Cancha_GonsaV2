const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirResumenPartidos,
	construirEstadisticasJugadores,
	construirCatalogoRecords,
	obtenerAniosDisponibles
} = require("./Records.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidos = construirResumenPartidos(filasNormalizadas);
	const jugadores = construirEstadisticasJugadores(filasNormalizadas, partidos);
	const catalogo = construirCatalogoRecords(filasNormalizadas, partidos, jugadores);
	const anios = obtenerAniosDisponibles(filasNormalizadas);

	console.log(`Años: ${anios.join(", ")}`);
	console.log(`Partidos: ${partidos.length}`);
	console.log(`Jugadores: ${jugadores.length}`);
	console.log("");

	catalogo.forEach((seccion) => {
		console.log(`== ${seccion.titulo.toUpperCase()} ==`);
		seccion.cards.forEach((card) => {
			const lideres = card.lideres.map((lider) => lider.nombre).join(", ");
			console.log(`- ${card.titulo}: ${card.valor} ${card.unidad} :: ${lideres}`);
		});
		console.log("");
	});
}

main().catch((error) => {
	console.error("No se pudo verificar la pestaña Récords:", error);
	process.exitCode = 1;
});
