const home = require('./index.js');

const filas = [];

function agregarFila(partido, fecha, equipo, jugador, resultado, goles, puntos) {
	filas.push(
		home.normalizarFilaCruda({
			partido_id: String(partido),
			Fecha: fecha,
			Equipo: String(equipo),
			Jugador: jugador,
			Resultado: resultado,
			Goles: String(goles),
			Autogoles: '0',
			Puntos: String(puntos)
		})
	);
}

const fechas = [
	'01/03/2025',
	'08/03/2025',
	'15/03/2025',
	'22/03/2025',
	'29/03/2025',
	'05/04/2025',
	'12/04/2026',
	'19/04/2026',
	'26/04/2026',
	'03/05/2026',
	'09/05/2026'
];

for (let index = 0; index < 6; index += 1) {
	agregarFila(index + 1, fechas[index], 1, 'Don Balón', 'ganador', 1, 3);
	agregarFila(index + 1, fechas[index], 2, 'Rival A', 'perdedor', 0, 0);
}

for (let index = 6; index < 11; index += 1) {
	agregarFila(index + 1, fechas[index], 1, 'Fedegol', 'ganador', 1, 3);
	agregarFila(index + 1, fechas[index], 2, 'Rival B', 'perdedor', 0, 0);
}

for (let index = 7; index < 11; index += 1) {
	agregarFila(index + 100, fechas[index], 1, 'Cede', 'ganador', 1, 3);
	agregarFila(index + 100, fechas[index], 2, 'Rival C', 'perdedor', 0, 0);
}

const snapshot = home.construirHomeSnapshot(filas);

const editorialesRacha = home.construirEditorialesRacha(snapshot.tablaHistorica || []);

console.log("Racha en foco:");
console.log(JSON.stringify(snapshot.rachaEnFoco, null, 2));
console.log("\nEditoriales de racha candidatas:");
console.log(JSON.stringify(editorialesRacha, null, 2));
