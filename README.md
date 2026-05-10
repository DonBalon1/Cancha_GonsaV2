# Cancha Gonsa Web V2

Tabla dinámica de estadísticas para un torneo de fútbol, construida con `HTML`, `CSS` y `JavaScript` vanilla.

## Archivos principales

- `index.html`: landing inicial del sitio.
- `tabla.html`: dashboard principal con la tabla general.
- `Jugadores.html`: pestaña de perfil individual por jugador.
- `Duelos.html`: pestaña de historial directo entre dos jugadores, juntos y enfrentados.
- `Palmares.html`: pestaña de salón de trofeos con campeones, podios y goleadores por edición.
- `Goleadores.html`: pestaña de ranking de goleadores.
- `Records.html`: pestaña de récords históricos por partido, temporada, rachas e histórico.
- `Rachas.html`: pestaña narrativa de rachas con los dueños del récord y sus cazadores activos.
- `Resumen.html`: pestaña de resumen de partido con selector jerárquico.
- `Partidos.html`: pestaña de historial de partidos con filtros y acceso directo al resumen.
- `lector_datos.js`: lectura y parseo del Google Sheets público.
- `tabla.js`: procesamiento de métricas y render dinámico.
- `Jugadores.js`: procesamiento y render del perfil individual de jugadores.
- `Duelos.js`: procesamiento y render de la pestaña de duelos entre jugadores.
- `Palmares.js`: procesamiento y render del palmarés anual del torneo.
- `Goleadores.js`: procesamiento y render de la tabla de goleadores.
- `Records.js`: procesamiento y render de la pestaña de récords.
- `Rachas.js`: procesamiento y render de la pestaña de rachas.
- `Resumen.js`: selección y render del resumen detallado de un partido.
- `Partidos.js`: procesamiento y render del historial de partidos.
- `verificar_tabla.js`: verificador rápido por consola para validar el ranking.
- `verificar_jugadores.js`: verificador rápido por consola para validar la pestaña de jugadores.
- `verificar_duelos.js`: verificador rápido por consola para validar la pestaña de duelos.
- `verificar_palmares.js`: verificador rápido por consola para validar campeones y goleadores por edición.
- `verificar_goleadores.js`: verificador rápido por consola para validar la tabla de goleadores.
- `verificar_records.js`: verificador rápido por consola para validar la pestaña de récords.
- `verificar_rachas.js`: verificador rápido por consola para validar la pestaña de rachas.
- `verificar_resumen.js`: verificador rápido por consola para validar el resumen de un partido.
- `verificar_partidos.js`: verificador rápido por consola para validar el listado de partidos.

## Fuente de datos

Los datos se leen desde un Google Sheets público y se convierten automáticamente a CSV para simplificar el parseo en frontend.

## Probar la tabla

Abrí `tabla.html` con un servidor estático local. Si ya tenés Node.js, podés usar el script de verificación:

```powershell
node .\verificar_tabla.js
```

## Estado actual

- Tabla general conectada a Google Sheets.
- Pestaña de jugadores conectada a Google Sheets.
- Pestaña de duelos conectada a Google Sheets.
- Pestaña de palmarés conectada a Google Sheets.
- Tabla de goleadores conectada a Google Sheets.
- Resumen de partido conectado a Google Sheets.
- Historial de partidos conectado a Google Sheets.
- Pestaña de récords conectada a Google Sheets.
- Pestaña de rachas conectada a Google Sheets.
- Métricas calculadas por jugador.
- Responsive con scroll horizontal en mobile.
- Fallback automático de imágenes de jugadores.

## Próximos pasos sugeridos

- Agregar nuevas pestañas del dashboard.
- Incorporar filtros, ordenamientos y más vistas estadísticas.