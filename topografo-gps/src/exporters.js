// Generación de archivos de exportación: KML (Google Earth), GeoJSON (QGIS),
// CSV (Excel / AutoCAD) y un informe de texto.
import { computeSurvey, formatNumber, formatAccuracy, AREA_UNITS, formatDMS } from './geo';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function safeFileName(name) {
  return (
    (name || 'lote')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'lote'
  );
}

export function toKML(lot, points) {
  const r = computeSurvey(points);
  const coords = [...points, points[0]].map((p) => `${p.lon},${p.lat},0`).join(' ');
  const placemarks = r.vertices
    .map(
      (v) => `    <Placemark>
      <name>V${v.index}</name>
      <styleUrl>#vertice</styleUrl>
      <Point><coordinates>${v.lon},${v.lat},0</coordinates></Point>
    </Placemark>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(lot.name)}</name>
    <Style id="lote">
      <LineStyle><color>ff00ffff</color><width>3</width></LineStyle>
      <PolyStyle><color>4000ffff</color></PolyStyle>
    </Style>
    <Style id="vertice">
      <IconStyle><scale>0.7</scale></IconStyle>
    </Style>
    <Placemark>
      <name>${esc(lot.name)}</name>
      <description>Área: ${formatNumber(r.area, 2)} m² (${formatNumber(
        r.area / 10000,
        4,
      )} ha) — Perímetro: ${formatNumber(r.perimeter, 2)} m</description>
      <styleUrl>#lote</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>
${placemarks}
  </Document>
</kml>
`;
}

export function toGeoJSON(lot, points) {
  const r = computeSurvey(points);
  const ring = [...points, points[0]].map((p) => [p.lon, p.lat]);
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            nombre: lot.name,
            fecha: new Date(lot.createdAt).toISOString(),
            area_m2: Number(r.area.toFixed(2)),
            area_ha: Number((r.area / 10000).toFixed(4)),
            perimetro_m: Number(r.perimeter.toFixed(2)),
            notas: lot.notes || '',
          },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        ...r.vertices.map((v) => ({
          type: 'Feature',
          properties: {
            vertice: `V${v.index}`,
            este: Number(v.utm.easting.toFixed(3)),
            norte: Number(v.utm.northing.toFixed(3)),
            zona_utm: `${v.utm.zone}${v.utm.hemisphere}`,
            precision_m: v.acc != null ? Number(v.acc.toFixed(3)) : null,
            altitud_m: v.alt != null ? Number(v.alt.toFixed(3)) : null,
          },
          geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        })),
      ],
    },
    null,
    2,
  );
}

export function toCSV(lot, points) {
  const r = computeSurvey(points);
  const header =
    'vertice,latitud,longitud,este_utm,norte_utm,zona_utm,altitud_m,precision_m,lado,distancia_m,azimut,rumbo';
  const rows = r.vertices.map((v, i) => {
    const s = r.sides[i];
    return [
      `V${v.index}`,
      v.lat.toFixed(8),
      v.lon.toFixed(8),
      v.utm.easting.toFixed(3),
      v.utm.northing.toFixed(3),
      `${v.utm.zone}${v.utm.hemisphere}`,
      v.alt != null ? v.alt.toFixed(3) : '',
      v.acc != null ? v.acc.toFixed(3) : '',
      s ? `V${s.from}-V${s.to}` : '',
      s ? s.length.toFixed(3) : '',
      s ? s.azimuth.toFixed(4) : '',
      s ? `"${s.bearing.replace(/"/g, '""')}"` : '',
    ].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

export function toReport(lot, points) {
  const r = computeSurvey(points);
  const lines = [];
  lines.push('INFORME DE LEVANTAMIENTO GPS');
  lines.push('============================');
  lines.push(`Lote:        ${lot.name}`);
  lines.push(`Fecha:       ${new Date(lot.createdAt).toLocaleString('es')}`);
  if (lot.notes) lines.push(`Notas:       ${lot.notes}`);
  lines.push(`Sistema:     WGS84 / UTM zona ${r.zone}${r.hemisphere}`);
  lines.push(`Vértices:    ${points.length}`);
  lines.push(
    `Equipo:      ${lot.source === 'external' ? `Receptor GNSS externo${lot.receiver ? ` (${lot.receiver})` : ''}` : 'GPS del teléfono'}`,
  );
  lines.push('');
  lines.push('ÁREA');
  for (const u of AREA_UNITS) {
    lines.push(`  ${u.label.padEnd(12)} ${formatNumber(r.area / u.factor, u.decimals)}`);
  }
  if (r.areaUncertainty != null) {
    lines.push(`  Incertidumbre aprox.: ± ${formatNumber(r.areaUncertainty, r.areaUncertainty < 10 ? 2 : 0)} m²`);
  }
  lines.push(`PERÍMETRO:   ${formatNumber(r.perimeter, 2)} m`);
  if (r.meanAcc != null) lines.push(`Precisión GPS media: ± ${formatAccuracy(r.meanAcc)}`);
  lines.push('');
  lines.push('CUADRO DE CONSTRUCCIÓN');
  lines.push('Lado       Rumbo               Distancia (m)   Azimut');
  for (const s of r.sides) {
    lines.push(
      `${`V${s.from}-V${s.to}`.padEnd(10)} ${s.bearing.padEnd(19)} ${formatNumber(
        s.length,
        2,
      ).padStart(13)}   ${formatDMS(s.azimuth)}`,
    );
  }
  lines.push('');
  lines.push('COORDENADAS');
  lines.push('Vért.  Este (m)        Norte (m)        Latitud        Longitud');
  for (const v of r.vertices) {
    lines.push(
      `${`V${v.index}`.padEnd(6)} ${v.utm.easting.toFixed(3).padEnd(15)} ${v.utm.northing
        .toFixed(3)
        .padEnd(16)} ${v.lat.toFixed(7).padEnd(14)} ${v.lon.toFixed(7)}`,
    );
  }
  lines.push('');
  lines.push(
    lot.source === 'external'
      ? 'Nota: la exactitud depende del tipo de solución del receptor (RTK fijo, flotante, DGPS) y de sus correcciones.'
      : 'Nota: medición con GPS del teléfono (precisión típica 3–5 m). No sustituye un levantamiento con equipo topográfico certificado.',
  );
  return lines.join('\n') + '\n';
}
