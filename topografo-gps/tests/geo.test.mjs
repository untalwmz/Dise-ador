import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toUTM,
  polygonArea,
  pathLength,
  azimuth,
  azimuthToBearing,
  formatDMS,
  simplify,
  averageFixes,
  isSelfIntersecting,
  computeSurvey,
  haversine,
} from '../src/geo.js';

// Desplaza un punto `dx` metros al este y `dy` al norte (aprox. local).
// Usa los radios de curvatura del elipsoide WGS84.
function offset(p, dx, dy) {
  const a = 6378137;
  const e2 = 0.00669437999014;
  const phi = (p.lat * Math.PI) / 180;
  const w = 1 - e2 * Math.sin(phi) ** 2;
  const Rn = a / Math.sqrt(w);
  const Rm = (a * (1 - e2)) / (w * Math.sqrt(w));
  return {
    lat: p.lat + (dy / Rm) * (180 / Math.PI),
    lon: p.lon + (dx / (Rn * Math.cos(phi))) * (180 / Math.PI),
    acc: 3,
  };
}

const origin = { lat: 13.6929, lon: -89.2182 }; // San Salvador aprox.

test('UTM: punto conocido (Bogotá, zona 18N)', () => {
  // Valores de referencia calculados con PROJ (pyproj, EPSG:32618).
  const r = toUTM(4.711, -74.0721);
  assert.equal(r.zone, 18);
  assert.equal(r.hemisphere, 'N');
  assert.ok(Math.abs(r.easting - 602910.007) < 0.01, `easting ${r.easting}`);
  assert.ok(Math.abs(r.northing - 520787.259) < 0.01, `northing ${r.northing}`);
});

test('UTM: hemisferio sur (Lima, zona 18S)', () => {
  // PROJ, EPSG:32718
  const r = toUTM(-12.0464, -77.0428);
  assert.equal(r.zone, 18);
  assert.equal(r.hemisphere, 'S');
  assert.ok(Math.abs(r.easting - 277617.453) < 0.01, `easting ${r.easting}`);
  assert.ok(Math.abs(r.northing - 8667487.897) < 0.01, `northing ${r.northing}`);
});

test('área y perímetro de un cuadrado de 100 m × 100 m', () => {
  const pts = [origin, offset(origin, 100, 0), offset(origin, 100, 100), offset(origin, 0, 100)];
  const area = polygonArea(pts);
  assert.ok(Math.abs(area - 10000) < 1, `área ${area}`);
  const per = pathLength(pts, true);
  assert.ok(Math.abs(per - 400) < 0.5, `perímetro ${per}`);
});

test('área de un triángulo rectángulo 30 × 40', () => {
  const pts = [origin, offset(origin, 30, 0), offset(origin, 0, 40)];
  assert.ok(Math.abs(polygonArea(pts) - 600) < 0.1);
});

test('azimut y rumbo', () => {
  const east = offset(origin, 50, 0);
  assert.ok(Math.abs(azimuth(origin, east) - 90) < 0.1);
  const ne = offset(origin, 50, 50);
  assert.ok(Math.abs(azimuth(origin, ne) - 45) < 0.1);
  assert.equal(azimuthToBearing(45), 'N 45°00\'00" E');
  assert.equal(azimuthToBearing(135), 'S 45°00\'00" E');
  assert.equal(azimuthToBearing(225.5), 'S 45°30\'00" O');
  assert.equal(azimuthToBearing(300), 'N 60°00\'00" O');
});

test('formatDMS redondea correctamente', () => {
  assert.equal(formatDMS(10.999999), '11°00\'00"');
  assert.equal(formatDMS(12.5), '12°30\'00"');
});

test('simplify elimina puntos colineales', () => {
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push(offset(origin, i * 10, 0));
  for (let i = 1; i <= 10; i++) pts.push(offset(origin, 100, i * 10));
  for (let i = 9; i >= 0; i--) pts.push(offset(origin, i * 10, 100));
  const s = simplify(pts, 0.5);
  assert.equal(s.length, 4);
});

test('averageFixes pondera por precisión', () => {
  const r = averageFixes([
    { lat: 1, lon: 1, acc: 1, t: 1 },
    { lat: 2, lon: 2, acc: 100, t: 2 },
  ]);
  assert.ok(r.lat < 1.01);
  assert.equal(r.samples, 2);
});

test('detecta polígono cruzado (forma de moño)', () => {
  const bow = [origin, offset(origin, 100, 100), offset(origin, 100, 0), offset(origin, 0, 100)];
  assert.equal(isSelfIntersecting(bow), true);
  const sq = [origin, offset(origin, 100, 0), offset(origin, 100, 100), offset(origin, 0, 100)];
  assert.equal(isSelfIntersecting(sq), false);
});

test('computeSurvey arma vértices y lados', () => {
  const pts = [origin, offset(origin, 100, 0), offset(origin, 100, 50), offset(origin, 0, 50)];
  const r = computeSurvey(pts);
  assert.equal(r.vertices.length, 4);
  assert.equal(r.sides.length, 4);
  assert.ok(Math.abs(r.sides[0].length - 100) < 0.2);
  assert.ok(Math.abs(r.area - 5000) < 10);
  assert.equal(r.zone, 16);
});

test('haversine ~ distancia local', () => {
  const b = offset(origin, 300, 400);
  assert.ok(Math.abs(haversine(origin, b) - 500) < 2);
});

test('lote irregular coincide con el área geodésica de PROJ', () => {
  // Referencia: pyproj Geod(ellps="WGS84").polygon_area_perimeter
  const lats = [13.6929, 13.6935, 13.6951, 13.6948, 13.6932];
  const lons = [-89.2182, -89.216, -89.2165, -89.219, -89.2195];
  const pts = lats.map((lat, i) => ({ lat, lon: lons[i] }));
  assert.ok(Math.abs(polygonArea(pts) - 66064.2309) < 0.5);
  assert.ok(Math.abs(pathLength(pts, true) - 1034.2249) < 0.05);
});

test('formato de números 3.627,14', async () => {
  const { formatNumber } = await import('../src/geo.js');
  assert.equal(formatNumber(3627.144, 2), '3.627,14');
  assert.equal(formatNumber(1234567.5, 1), '1.234.567,5');
  assert.equal(formatNumber(999.996, 2), '1.000,00');
  assert.equal(formatNumber(-0.001, 2), '0,00');
  assert.equal(formatNumber(-12.5, 0), '-13');
  assert.equal(formatNumber(42, 0), '42');
  assert.equal(formatNumber(null), '—');
});
