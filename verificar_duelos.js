const { obtenerFilasPartidos } = require("./lector_datos.js");
const {
	normalizarFilaCruda,
	construirPartidos,
	construirAnalisisDuelo
} = require("./Duelos.js");

async function main() {
	const filas = await obtenerFilasPartidos();
	const filasNormalizadas = filas
		.map(normalizarFilaCruda)
		.filter((fila) => fila.partidoId && fila.jugador);
	const partidos = construirPartidos(filasNormalizadas);
	const conteoPares = new Map();
	partidos.forEach((partido) => {
		const nombres = Array.from(new Set((partido.jugadores || []).map((jugador) => jugador.jugador))).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
		for (let indice = 0; indice < nombres.length; indice += 1) {
			for (let cursor = indice + 1; cursor < nombres.length; cursor += 1) {
				const clave = `${nombres[indice]}|||${nombres[cursor]}`;
				conteoPares.set(clave, (conteoPares.get(clave) || 0) + 1);
			}
		}
	});
	const mejorPar = Array.from(conteoPares.entries()).sort((a, b) => b[1] - a[1])[0];
	const [jugadorA, jugadorB] = mejorPar ? mejorPar[0].split("|||") : [null, null];
	const analisis = construirAnalisisDuelo(partidos, jugadorA, jugadorB);

	console.log(`Jugador A: ${jugadorA}`);
	console.log(`Jugador B: ${jugadorB}`);
	console.log(`Coincidencias: ${analisis.totalCoincidencias}`);
	console.log(`Juntos: ${analisis.juntos.total} | Balance: ${analisis.juntos.ganados}-${analisis.juntos.empatados}-${analisis.juntos.perdidos}`);
	console.log(`En contra: ${analisis.enContra.total} | Balance: ${analisis.enContra.victoriasA}-${analisis.enContra.empates}-${analisis.enContra.victoriasB}`);
	console.log(`Goles en duelos: ${analisis.enContra.golesA}-${analisis.enContra.golesB}`);
	console.log("");

	if (analisis.juntos.partidos[0]) {
		const partido = analisis.juntos.partidos[0];
		console.log(`Primer partido juntos: ${partido.fechaTexto} · ${partido.partidoId} · ${partido.marcadorFavor}-${partido.marcadorContra}`);
	}

	if (analisis.enContra.partidos[0]) {
		const partido = analisis.enContra.partidos[0];
		console.log(`Primer partido en contra: ${partido.fechaTexto} · ${partido.partidoId} · ${partido.marcadorA}-${partido.marcadorB}`);
	}
}

main().catch((error) => {
	console.error("No se pudo verificar la pestaña Duelos:", error);
	process.exitCode = 1;
});
