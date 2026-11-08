# Topógrafo GPS

App Android para medir terrenos caminando su perímetro con el GPS del teléfono.

## Funciones

- **Modo caminata**: camina por el borde del lote y la app registra un punto cada 1, 2, 5 o 10 m.
- **Modo vértices**: párate en cada esquina y pulsa «Marcar vértice»; se promedian 5–30 lecturas GPS
  (ponderadas por su precisión) para obtener un punto más exacto.
- Filtro de precisión: descarta lecturas peores que ±5/10/15/25 m.
- Mapa **satelital** en vivo (Esri World Imagery, sin API key) y **croquis** que funciona sin internet.
- Resultados: área en m², hectáreas, acres, manzanas, varas² y fanegadas; perímetro; incertidumbre aprox.
- **Cuadro de construcción**: rumbo (N 45°30'00" E), azimut y distancia de cada lado.
- Coordenadas **UTM** WGS84 de cada vértice.
- Simplificación de vértices (Douglas-Peucker) con posibilidad de restaurar los puntos originales.
- Exportar a **KML** (Google Earth), **GeoJSON** (QGIS), **CSV** (Excel/CAD) e informe de texto.
- Borrador automático: si la app se cierra a mitad de una medición, se puede continuar.
- La pantalla se mantiene encendida durante la medición.

## Precisión

El GPS de un teléfono tiene una precisión típica de 3–5 m a cielo abierto. Para mejores resultados:
usa el modo vértices en las esquinas, espera a que el indicador GPS esté en verde (≤ 5 m) y evita
árboles y edificios altos. La app es una herramienta de referencia y no sustituye un levantamiento
con equipo topográfico certificado.

Los cálculos de área y distancias usan el elipsoide WGS84 y están verificados contra PROJ
(`npm test`).

## Desarrollo

```bash
cd topografo-gps
npm install
npm test                   # pruebas de los cálculos geodésicos
npx expo run:android       # compilar e instalar en un teléfono conectado
```

El APK se compila automáticamente con GitHub Actions (`.github/workflows/topografo-apk.yml`) en cada
push que toque esta carpeta; se descarga desde la pestaña **Actions → artefacto `topografo-gps-apk`**.
En `main`, además, se publica como Release.

## Estructura

- `src/geo.js` — UTM, área, perímetro, rumbos, promedio de lecturas, simplificación.
- `src/exporters.js` — KML, GeoJSON, CSV, informe.
- `src/screens/SurveyScreen.js` — medición en campo.
- `src/screens/DetailScreen.js` — resultados y exportación.
- `src/components/SatelliteMap.js` — mapa Leaflet en WebView.
