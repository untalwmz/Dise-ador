import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipsoidToMsl, geoidUndulation, pressureToAltitude, combineEstimates, meanWithError } from '../src/altitude.js';
import { dailyFromHourly, nextHours, climateSummary, feelsLikeNote } from '../src/weatherStats.js';

test('geoide EGM96: valores de referencia', () => {
  // (0,0) = 17,16 m es el valor publicado por la NGA
  assert.ok(Math.abs(geoidUndulation(0, 0) - 17.16) < 0.01);
  // Sur de Colombia: ≈ +26 m, así que la altura elipsoidal del GPS se pasa ~26 m
  const n = geoidUndulation(1.8545, -76.241);
  assert.ok(n > 20 && n < 32, `N=${n}`);
  assert.ok(Math.abs(ellipsoidToMsl(1.8545, -76.241, 1550) - (1550 - n)) < 1e-9);
  assert.equal(ellipsoidToMsl(0, 0, null), null);
});

test('altitud barométrica', () => {
  // Atmósfera estándar: 1013,25 hPa en el mar; ~898,7 hPa a 1000 m
  assert.ok(Math.abs(pressureToAltitude(1013.25, 1013.25, 15)) < 0.01);
  const h = pressureToAltitude(898.76, 1013.25, 15);
  assert.ok(Math.abs(h - 1000) < 5, `h=${h}`);
});

test('combinación ponderada de estimaciones', () => {
  const r = combineEstimates([
    { value: 100, sigma: 1 },
    { value: 110, sigma: 10 },
    { value: null, sigma: 2 },
  ]);
  assert.ok(Math.abs(r.value - 100.099) < 0.01);
  assert.ok(r.sigma < 1);
  assert.equal(combineEstimates([]), null);
  const m = meanWithError([1, 2, 3]);
  assert.equal(m.mean, 2);
  assert.equal(m.n, 3);
});

test('clima: agregados diarios desde la serie horaria', () => {
  const hourly = {
    time: ['2026-11-08T00:00', '2026-11-08T12:00', '2026-11-09T00:00'],
    temperature_2m: [18, 26, 17],
    apparent_temperature: [19, 30, 16],
    relative_humidity_2m: [90, 60, 95],
    precipitation_probability: [10, 70, 5],
  };
  const d = dailyFromHourly(hourly);
  assert.equal(d.length, 2);
  assert.equal(d[0].tempMean, 22);
  assert.equal(d[0].appMax, 30);
  assert.equal(d[0].rainProb, 70);
  const nh = nextHours(hourly, '2026-11-08T11:30', 2);
  assert.equal(nh.length, 2);
  assert.equal(nh[0].temp, 26);
});

test('clima: promedios mensuales y anuales', () => {
  const time = [];
  const mean = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    time.push(d.toISOString().slice(0, 10));
    mean.push(i < 31 ? 20 : 24);
  }
  const s = climateSummary({
    time,
    temperature_2m_mean: mean,
    apparent_temperature_mean: mean.map((x) => x + 1),
    temperature_2m_max: mean.map((x) => x + 5),
    temperature_2m_min: mean.map((x) => x - 5),
    precipitation_sum: mean.map(() => 1),
  });
  // Febrero tiene solo 9 días -> se descarta
  assert.equal(s.monthly.length, 1);
  assert.equal(s.monthly[0].tempMean, 20);
  assert.equal(s.monthly[0].appMean, 21);
  assert.equal(s.rainTotal, 40);
  assert.ok(Math.abs(s.yearMean - (31 * 20 + 9 * 24) / 40) < 1e-9);
  assert.match(feelsLikeNote(25, 29), /caluroso/);
});
