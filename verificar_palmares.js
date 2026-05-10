const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirEdicionesPalmares
} = require("./Palmares.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador && fila.anio !== null);
	const ediciones = construirEdicionesPalmares(filasNormalizadas);

	console.log(`Ediciones: ${ediciones.length}`);
	ediciones.forEach((edicion) => {
		const campeones = edicion.podio[0]?.jugadores.map((jugador) => jugador.jugador).join(", ") || "-";
		const subcampeones = edicion.podio[1]?.jugadores.map((jugador) => jugador.jugador).join(", ") || "-";
		const terceros = edicion.podio[2]?.jugadores.map((jugador) => jugador.jugador).join(", ") || "-";
		const goleadores = edicion.goleadores.map((jugador) => `${jugador.jugador} (${jugador.goles})`).join(", ") || "-";
		const top3 = edicion.topGoleadores.map((jugador) => `${jugador.jugador} ${jugador.goles}`).join(" | ") || "-";

		console.log(`\n${edicion.anio} · ${edicion.estado} · ${edicion.partidos} PJ`);
		console.log(`Campeón/es: ${campeones}`);
		console.log(`2° puesto: ${subcampeones}`);
		console.log(`3° puesto: ${terceros}`);
		console.log(`Goleador/es: ${goleadores}`);
		console.log(`Top 3 goles: ${top3}`);
	});
}

main().catch((error) => {
	console.error("No se pudo verificar el palmarés:", error);
	process.exitCode = 1;
});
