// Parser NMEA 0183 mínimo para receptores GNSS externos.
// Sentencias: GGA (posición y tipo de solución), GST (error estimado), RMC.

/** Valida el checksum "*hh" de una sentencia. Si no trae checksum se acepta. */
export function validChecksum(line) {
  const star = line.lastIndexOf('*');
  if (star === -1) return true;
  const expected = parseInt(line.slice(star + 1, star + 3), 16);
  if (Number.isNaN(expected)) return false;
  let sum = 0;
  for (let i = 1; i < star; i++) sum ^= line.charCodeAt(i);
  return sum === expected;
}

/** "ddmm.mmmm" + hemisferio -> grados decimales. */
export function nmeaCoord(value, hemi) {
  if (!value) return null;
  const v = parseFloat(value);
  if (Number.isNaN(v)) return null;
  const deg = Math.floor(v / 100);
  const min = v - deg * 100;
  let d = deg + min / 60;
  if (hemi === 'S' || hemi === 'W') d = -d;
  return d;
}

const num = (s) => {
  if (s == null || s === '') return null;
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
};

// Calidad de la solución (campo 6 de GGA)
export const FIX_TYPES = {
  0: { label: 'Sin solución', short: 'Sin fix', uere: null },
  1: { label: 'GPS autónomo', short: 'GPS', uere: 2.5 },
  2: { label: 'DGPS / SBAS', short: 'DGPS', uere: 0.8 },
  3: { label: 'PPS', short: 'PPS', uere: 2.5 },
  4: { label: 'RTK fijo', short: 'RTK fijo', uere: 0.015 },
  5: { label: 'RTK flotante', short: 'RTK float', uere: 0.3 },
  6: { label: 'Estimado (DR)', short: 'DR', uere: 10 },
  7: { label: 'Manual', short: 'Manual', uere: null },
  8: { label: 'Simulación', short: 'Sim', uere: null },
};

/** Parsea una sentencia. Devuelve null si no es válida o no es de interés. */
export function parseNmea(line) {
  if (!line || line[0] !== '$' || !validChecksum(line)) return null;
  const body = line.slice(1, line.lastIndexOf('*') === -1 ? undefined : line.lastIndexOf('*'));
  const f = body.split(',');
  const type = f[0].slice(2);
  const talker = f[0].slice(0, 2);

  if (type === 'GGA') {
    const quality = parseInt(f[6], 10) || 0;
    return {
      type,
      talker,
      time: f[1],
      lat: nmeaCoord(f[2], f[3]),
      lon: nmeaCoord(f[4], f[5]),
      quality,
      sats: parseInt(f[7], 10) || 0,
      hdop: num(f[8]),
      // altitud sobre el geoide (MSL)
      alt: num(f[9]),
      geoidSep: num(f[11]),
      diffAge: num(f[13]),
    };
  }
  if (type === 'GST') {
    const latErr = num(f[6]);
    const lonErr = num(f[7]);
    return {
      type,
      talker,
      time: f[1],
      rms: num(f[2]),
      latErr,
      lonErr,
      altErr: num(f[8]),
    };
  }
  if (type === 'RMC') {
    return {
      type,
      talker,
      time: f[1],
      valid: f[2] === 'A',
      lat: nmeaCoord(f[3], f[4]),
      lon: nmeaCoord(f[5], f[6]),
      speedKnots: num(f[7]),
      course: num(f[8]),
      date: f[9],
    };
  }
  return null;
}

/**
 * Precisión horizontal estimada (m, ~1σ combinada).
 * Usa GST si es de la misma época; si no, HDOP × error típico según el tipo de solución.
 */
export function estimateAccuracy(gga, gst) {
  if (gst && gst.time === gga.time && gst.latErr != null && gst.lonErr != null) {
    return Math.hypot(gst.latErr, gst.lonErr);
  }
  const ft = FIX_TYPES[gga.quality];
  if (!ft || ft.uere == null) return null;
  return Math.max((gga.hdop || 1) * ft.uere, 0.005);
}

/**
 * Acumulador que convierte el flujo NMEA en "fixes" con el mismo formato que
 * usa el GPS del teléfono: { lat, lon, alt, acc, t, quality, sats, hdop }.
 */
export function createNmeaAssembler(onFix) {
  let lastGst = null;
  let pendingGga = null;

  const emit = (gga, gst) => {
    if (gga.lat == null || gga.lon == null || gga.quality === 0) {
      onFix(null, gga);
      return;
    }
    onFix(
      {
        lat: gga.lat,
        lon: gga.lon,
        alt: gga.alt,
        acc: estimateAccuracy(gga, gst),
        t: Date.now(),
        quality: gga.quality,
        sats: gga.sats,
        hdop: gga.hdop,
        source: 'external',
      },
      gga,
    );
  };

  return function push(line) {
    const s = parseNmea(line);
    if (!s) return;
    if (s.type === 'GST') {
      lastGst = s;
      // Muchos receptores envían GST después de GGA: completamos la época pendiente.
      if (pendingGga && pendingGga.time === s.time) {
        emit(pendingGga, s);
        pendingGga = null;
      }
    } else if (s.type === 'GGA') {
      if (pendingGga) emit(pendingGga, lastGst);
      if (lastGst && lastGst.time === s.time) {
        emit(s, lastGst);
        pendingGga = null;
      } else if (lastGst) {
        // El receptor emite GST: esperamos la de esta época.
        pendingGga = s;
      } else {
        emit(s, null);
      }
    }
  };
}
