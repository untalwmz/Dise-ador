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

## Pantalla de medición

- Mapa a pantalla completa con tarjeta de **Distancia total** y **Tamaño del área**; toca cada valor
  para cambiar la unidad (metros, km, varas, pies… / m², hectáreas, fanegadas, varas², manzanas, acres).
- **＋** agrega un vértice en la mira central (dibujar sobre la imagen satelital).
- **GPS** agrega tu posición promediando varias lecturas; **Caminar** registra el borde mientras caminas.
- Los vértices se pueden **arrastrar** para corregirlos; ↶ deshace, ⛶ encuadra el lote, ✓ guarda.
- Botones de **Altitud** y **Clima** sin perder la medición en curso.

## Imágenes satelitales

Gratuitas y sin cuenta ni clave: **Esri Clarity** (más nítida, por defecto) y **Esri estándar** (más
reciente). Se elige en el botón de capas ▤. La ubicación del teléfono usa el servicio de Google
(Fused Location Provider de Google Play Services) a través de expo-location.

## Altitud (MSNM)

El GPS del teléfono da la altura sobre el elipsoide WGS84, no sobre el nivel del mar. La app la
corrige con el geoide **EGM96** (≈ 26 m en el sur de Colombia) y la combina, según su precisión, con:
el **barómetro** del teléfono calibrado con la presión al nivel del mar del momento, y el **modelo de
terreno Copernicus** (90 m). Con un receptor externo se usa su altitud MSNM (centimétrica con RTK fijo).
«Promediar 60 s» reduce el error del GPS.

## Clima

Temperatura y **sensación térmica** actuales, promedio de hoy, gráfica de 24 h, 7 días y los
**promedios mensuales de los últimos 12 meses** (reanálisis ERA5). Datos de Open-Meteo, sin clave.

## Receptor GPS externo (Bluetooth)

Botón **📡 Receptor** en la pantalla principal (o «Cambiar» antes de iniciar una medición).

- Compatible con receptores GNSS que envían **NMEA por Bluetooth clásico (SPP)**: Garmin GLO,
  Bad Elf, Trimble R1/R2, Emlid Reach, ArduSimple, receptores RTK genéricos, etc.
- Empareja el receptor en los ajustes de Bluetooth de Android y luego elígelo en la lista.
- Muestra el tipo de solución (GPS, DGPS, **RTK flotante**, **RTK fijo**), satélites, HDOP y precisión.
  La precisión se toma de la sentencia GST cuando el receptor la envía; si no, se estima con HDOP.
- Reconexión automática si se pierde la señal Bluetooth.
- Para RTK, las correcciones (NTRIP o base) se configuran en la app del fabricante del receptor;
  esta app lee la posición ya corregida.
- Receptores USB u otros: usa una app de «ubicación simulada» y elige «GPS del teléfono».

Código: `modules/bluetooth-gnss` (módulo nativo Kotlin) y `src/gnss/` (parser NMEA y conexión).

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
push que toque esta carpeta, y se publica como **Release** con el nombre del APK
(`topografo-gps-vX.Y.Z-buildN.apk`): descárgalo desde la sección *Releases* del repositorio.

## Estructura

- `src/geo.js` — UTM, área, perímetro, rumbos, promedio de lecturas, simplificación.
- `src/exporters.js` — KML, GeoJSON, CSV, informe.
- `src/screens/SurveyScreen.js` — medición en campo.
- `src/screens/DetailScreen.js` — resultados y exportación.
- `src/components/LeafletMap.js` — mapa Leaflet con imágenes Esri (Clarity / estándar).
- `src/altitude.js`, `src/screens/AltitudeScreen.js` — geoide EGM96, barómetro, combinación.
- `src/openmeteo.js`, `src/weatherStats.js`, `src/screens/WeatherScreen.js` — clima.
