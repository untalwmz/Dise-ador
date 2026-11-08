import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNmea, validChecksum, nmeaCoord, estimateAccuracy, createNmeaAssembler } from '../src/gnss/nmea.js';

// Agrega el checksum correcto a una sentencia sin él.
function withChecksum(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum ^= body.charCodeAt(i);
  return `$${body}*${sum.toString(16).toUpperCase().padStart(2, '0')}`;
}

test('checksum de una sentencia real', () => {
  // Ejemplo clásico de la especificación NMEA
  assert.equal(validChecksum('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47'), true);
  assert.equal(validChecksum('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48'), false);
});

test('coordenadas ddmm.mmmm', () => {
  assert.ok(Math.abs(nmeaCoord('4807.038', 'N') - 48.1173) < 1e-6);
  assert.ok(Math.abs(nmeaCoord('01131.000', 'W') + 11.516666) < 1e-5);
});

test('GGA RTK fijo', () => {
  const s = parseNmea(withChecksum('GNGGA,153012.00,1341.57400,N,08913.09200,W,4,24,0.6,650.12,M,-3.2,M,1.0,0001'));
  assert.equal(s.type, 'GGA');
  assert.equal(s.quality, 4);
  assert.equal(s.sats, 24);
  assert.ok(Math.abs(s.lat - 13.6929) < 1e-6);
  assert.ok(Math.abs(s.lon + 89.2182) < 1e-6);
  assert.equal(s.alt, 650.12);
  // Sin GST: HDOP 0.6 × 1.5 cm
  assert.ok(Math.abs(estimateAccuracy(s, null) - 0.009) < 1e-9);
});

test('GST da la precisión cuando coincide la época', () => {
  const gga = parseNmea(withChecksum('GPGGA,100000.00,1341.57400,N,08913.09200,W,1,10,1.2,650,M,0,M,,'));
  const gst = parseNmea(withChecksum('GPGST,100000.00,2.1,1.5,1.0,30.0,1.2,1.6,2.5'));
  assert.equal(gst.latErr, 1.2);
  assert.ok(Math.abs(estimateAccuracy(gga, gst) - 2.0) < 1e-9);
});

test('ensamblador combina GGA + GST y descarta sin solución', () => {
  const fixes = [];
  const push = createNmeaAssembler((fix) => fixes.push(fix));
  push(withChecksum('GNGGA,000001.00,,,,,0,00,99.9,,M,,M,,'));
  push(withChecksum('GNGGA,000002.00,1341.57400,N,08913.09200,W,5,18,0.8,650,M,0,M,2,0001'));
  push(withChecksum('GNGST,000002.00,0.3,0.2,0.1,0,0.06,0.08,0.1'));
  push(withChecksum('GNRMC,000002.00,A,1341.57400,N,08913.09200,W,0.0,0.0,081126,,,R'));
  push('$GNGGA,basura*00');
  // Época 3: ya sabemos que el receptor envía GST, así que se espera por ella.
  push(withChecksum('GNGGA,000003.00,1341.57400,N,08913.09200,W,5,18,0.8,650,M,0,M,2,0001'));
  assert.equal(fixes.length, 2);
  push(withChecksum('GNGST,000003.00,0.3,0.2,0.1,0,0.06,0.08,0.1'));
  assert.equal(fixes.length, 3);
  assert.equal(fixes[0], null);
  // Época 2: la GST llegó después, se usa HDOP × error típico RTK float
  assert.ok(Math.abs(fixes[1].acc - 0.24) < 1e-9);
  assert.equal(fixes[2].quality, 5);
  assert.ok(Math.abs(fixes[2].acc - 0.1) < 1e-9);
});
