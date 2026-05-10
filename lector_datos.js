const LECTOR_DATOS_CONFIG = {
	googleSheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTL_7kNw3ciV7eoNYvpN1Gh0K7M1-gtirgTj1W8APjer2EO8AzrFmMi2OBC1WJFXU1o7PPq_jhUnPZn/pubhtml?gid=1609934683&single=true"
};

function repararTextoMojibake(valor) {
	const texto = String(valor ?? "");
	if (!/[ÃÂ]/.test(texto)) {
		return texto;
	}

	try {
		return decodeURIComponent(escape(texto));
	} catch (error) {
		return texto;
	}
}

function convertirUrlGoogleSheetsACsv(urlPublica) {
	const url = new URL(urlPublica);
	const gid = url.searchParams.get("gid") || "0";
	return `${url.origin}${url.pathname.replace("/pubhtml", "/pub")}?gid=${gid}&single=true&output=csv`;
}

function dividirLineaCsv(linea) {
	const valores = [];
	let valorActual = "";
	let dentroDeComillas = false;

	for (let indice = 0; indice < linea.length; indice += 1) {
		const caracter = linea[indice];
		const siguienteCaracter = linea[indice + 1];

		if (caracter === '"') {
			if (dentroDeComillas && siguienteCaracter === '"') {
				valorActual += '"';
				indice += 1;
			} else {
				dentroDeComillas = !dentroDeComillas;
			}
			continue;
		}

		if (caracter === "," && !dentroDeComillas) {
			valores.push(valorActual.trim());
			valorActual = "";
			continue;
		}

		valorActual += caracter;
	}

	valores.push(valorActual.trim());
	return valores;
}

function parsearCsv(textoCsv) {
	const lineas = textoCsv
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/)
		.filter((linea) => linea.trim().length > 0);

	if (lineas.length === 0) {
		return [];
	}

	const encabezados = dividirLineaCsv(lineas[0]);

	return lineas.slice(1).map((linea) => {
		const columnas = dividirLineaCsv(linea);
		return encabezados.reduce((fila, encabezado, indice) => {
			fila[encabezado] = repararTextoMojibake(columnas[indice] ?? "");
			return fila;
		}, {});
	});
}

async function obtenerFilasPartidos(urlPublica = LECTOR_DATOS_CONFIG.googleSheetUrl) {
	const urlCsv = convertirUrlGoogleSheetsACsv(urlPublica);
	const respuesta = await fetch(urlCsv, {
		method: "GET",
		headers: {
			Accept: "text/csv"
		}
	});

	if (!respuesta.ok) {
		throw new Error(`No se pudieron leer los datos. Estado HTTP: ${respuesta.status}`);
	}

	const textoCsv = await respuesta.text();
	return parsearCsv(textoCsv);
}

const lectorDatosApi = {
	config: LECTOR_DATOS_CONFIG,
	obtenerFilasPartidos,
	convertirUrlGoogleSheetsACsv,
	parsearCsv,
	repararTextoMojibake
};

if (typeof window !== "undefined") {
	window.lectorDatos = lectorDatosApi;
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = lectorDatosApi;
}
