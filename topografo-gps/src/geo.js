// Cálculos geodésicos para levantamientos de lotes.
// Todo es JavaScript puro (sin dependencias) para poder probarlo con `node --test`.

// Elipsoide WGS84
const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Zona UTM (1..60) para una longitud. */
export function utmZone(lon) {
  return Math.min(60, Math.floor((lon + 180) / 6) + 1);
}

/**
 * Convierte lat/lon (WGS84) a UTM. Se puede forzar la zona para que todos los
 * puntos de un mismo lote queden en la misma zona.
 */
export function toUTM(lat, lon, forcedZone) {
  const zone = forcedZone || utmZone(lon);
  const lon0 = toRad((zone - 1) * 6 - 180 + 3);
  const phi = toRad(lat);
  const lam = toRad(lon);

  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);

  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const Aa = cos * (lam - lon0);

  const e4 = E2 * E2;
  const e6 = e4 * E2;
  const M =
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));

  const easting =
    K0 *
      N *
      (Aa +
        ((1 - T + C) * Aa ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120) +
    500000;

  let northing =
    K0 *
    (M +
      N *
        tan *
        ((Aa * Aa) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
  if (lat < 0) northing += 10000000;

  return { easting, northing, zone, hemisphere: lat >= 0 ? 'N' : 'S' };
}

/** Distancia en metros entre dos puntos (Haversine sobre radio medio). */
export function haversine(a, b) {
  const R = 6371008.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Proyecta los puntos a un plano local (metros, X=Este, Y=Norte) centrado en
 * el centroide. Para lotes de hasta varios km el error es despreciable y es más
 * exacto que usar UTM directamente (no tiene factor de escala).
 */
export function toLocal(points) {
  if (!points.length) return { xy: [], origin: null };
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon0 = points.reduce((s, p) => s + p.lon, 0) / points.length;
  const phi0 = toRad(lat0);
  const sin = Math.sin(phi0);
  const w = 1 - E2 * sin * sin;
  const Rn = A / Math.sqrt(w); // radio de curvatura primer vertical
  const Rm = (A * (1 - E2)) / (w * Math.sqrt(w)); // radio meridiano
  const xy = points.map((p) => ({
    x: toRad(p.lon - lon0) * Rn * Math.cos(phi0),
    y: toRad(p.lat - lat0) * Rm,
  }));
  return { xy, origin: { lat: lat0, lon: lon0 } };
}

/** Área (m²) de un polígono por la fórmula del trapecio (Gauss). */
export function polygonArea(points) {
  if (points.length < 3) return 0;
  const { xy } = toLocal(points);
  let s = 0;
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i];
    const q = xy[(i + 1) % xy.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** Longitud del recorrido (m). Si `closed`, incluye el lado que cierra. */
export function pathLength(points, closed = false) {
  if (points.length < 2) return 0;
  const { xy } = toLocal(points);
  let total = 0;
  const n = closed ? xy.length : xy.length - 1;
  for (let i = 0; i < n; i++) {
    const p = xy[i];
    const q = xy[(i + 1) % xy.length];
    total += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return total;
}

/** Azimut (0-360°, desde el norte en sentido horario) de a hacia b. */
export function azimuth(a, b) {
  const { xy } = toLocal([a, b]);
  const dx = xy[1].x - xy[0].x;
  const dy = xy[1].y - xy[0].y;
  let az = toDeg(Math.atan2(dx, dy));
  if (az < 0) az += 360;
  return az;
}

/** Grados decimales a texto 12°34'56". */
export function formatDMS(deg, secondsDecimals = 0) {
  const sign = deg < 0 ? '-' : '';
  let v = Math.abs(deg);
  let d = Math.floor(v);
  let m = Math.floor((v - d) * 60);
  let s = (v - d - m / 60) * 3600;
  const factor = 10 ** secondsDecimals;
  s = Math.round(s * factor) / factor;
  if (s >= 60) {
    s -= 60;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  return `${sign}${d}°${String(m).padStart(2, '0')}'${s
    .toFixed(secondsDecimals)
    .padStart(secondsDecimals ? 3 + secondsDecimals : 2, '0')}"`;
}

/** Azimut a rumbo topográfico, ej. "N 45°30'00\" E". */
export function azimuthToBearing(az) {
  let ns;
  let ew;
  let angle;
  if (az <= 90) {
    ns = 'N';
    ew = 'E';
    angle = az;
  } else if (az <= 180) {
    ns = 'S';
    ew = 'E';
    angle = 180 - az;
  } else if (az <= 270) {
    ns = 'S';
    ew = 'O';
    angle = az - 180;
  } else {
    ns = 'N';
    ew = 'O';
    angle = 360 - az;
  }
  return `${ns} ${formatDMS(angle)} ${ew}`;
}

/** Simplificación Douglas-Peucker (tolerancia en metros). Conserva extremos. */
export function simplify(points, tolerance) {
  if (points.length <= 3 || !tolerance) return points.slice();
  const { xy } = toLocal(points);
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;

  const distToSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(xy[i], xy[s], xy[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tolerance) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = points.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : points.slice();
}

/**
 * Promedio ponderado (1/precisión²) de varias lecturas GPS, para marcar un
 * vértice con más exactitud quedándose quieto unos segundos.
 */
export function averageFixes(samples) {
  if (!samples.length) return null;
  let wSum = 0;
  let lat = 0;
  let lon = 0;
  let alt = 0;
  let altW = 0;
  let msl = 0;
  let mslW = 0;
  for (const s of samples) {
    const acc = Math.max(s.acc || 10, 0.005);
    const w = 1 / (acc * acc);
    wSum += w;
    lat += s.lat * w;
    lon += s.lon * w;
    if (s.alt != null) {
      alt += s.alt * w;
      altW += w;
    }
    if (s.altMsl != null) {
      msl += s.altMsl * w;
      mslW += w;
    }
  }
  const best = Math.min(...samples.map((s) => s.acc || 10));
  // La precisión combinada mejora aprox. con sqrt(n), pero no la dejamos
  // por debajo de la mejor lectura individual / 2 para no ser optimistas.
  const combined = Math.max(1 / Math.sqrt(wSum), best / 2);
  return {
    lat: lat / wSum,
    lon: lon / wSum,
    alt: altW ? alt / altW : null,
    altMsl: mslW ? msl / mslW : null,
    acc: combined,
    t: samples[samples.length - 1].t,
    samples: samples.length,
  };
}

/** ¿Algún par de lados no adyacentes se cruza? (polígono "torcido") */
export function isSelfIntersecting(points) {
  const n = points.length;
  if (n < 4) return false;
  const { xy } = toLocal(points);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const intersects = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (intersects(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Calcula todo el informe de un lote cerrado. */
export function computeSurvey(points) {
  const n = points.length;
  const zone = n ? utmZone(points[0].lon) : null;
  const vertices = points.map((p, i) => {
    const utm = toUTM(p.lat, p.lon, zone);
    return { ...p, index: i + 1, utm };
  });
  const sides = [];
  if (n >= 2) {
    const count = n >= 3 ? n : 1;
    for (let i = 0; i < count; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const az = azimuth(a, b);
      const { xy } = toLocal([a, b]);
      sides.push({
        from: i + 1,
        to: ((i + 1) % n) + 1,
        length: Math.hypot(xy[1].x - xy[0].x, xy[1].y - xy[0].y),
        azimuth: az,
        bearing: azimuthToBearing(az),
      });
    }
  }
  const area = polygonArea(points);
  const perimeter = n >= 3 ? pathLength(points, true) : pathLength(points, false);
  const accs = points.map((p) => p.acc).filter((a) => a != null);
  const meanAcc = accs.length ? accs.reduce((s, a) => s + a, 0) / accs.length : null;
  // Incertidumbre aproximada del área: perímetro × error medio de posición.
  const areaUncertainty = meanAcc != null && n >= 3 ? perimeter * meanAcc * 0.5 : null;
  const centroid = n
    ? {
        lat: points.reduce((s, p) => s + p.lat, 0) / n,
        lon: points.reduce((s, p) => s + p.lon, 0) / n,
      }
    : null;
  return {
    zone,
    hemisphere: centroid && centroid.lat < 0 ? 'S' : 'N',
    vertices,
    sides,
    area,
    perimeter,
    meanAcc,
    areaUncertainty,
    centroid,
    selfIntersecting: isSelfIntersecting(points),
  };
}

// Conversiones de área usadas en Latinoamérica.
export const AREA_UNITS = [
  { key: 'm2', label: 'm²', long: 'Metros cuadrados', factor: 1, decimals: 2 },
  { key: 'ha', label: 'Hectáreas', long: 'Hectáreas', factor: 10000, decimals: 4 },
  { key: 'fan', label: 'Fanegadas', long: 'Fanegadas / plazas (6.400 m²)', factor: 6400, decimals: 4 },
  { key: 'v2co', label: 'Varas² (Col.)', long: 'Varas cuadradas Colombia (0,64 m²)', factor: 0.64, decimals: 2 },
  { key: 'mz', label: 'Manzanas', long: 'Manzanas (6.987 m²)', factor: 6987.37, decimals: 4 },
  { key: 'v2', label: 'Varas² (C.A.)', long: 'Varas cuadradas C. América (0,70 m²)', factor: 0.698737, decimals: 2 },
  { key: 'ac', label: 'Acres', long: 'Acres', factor: 4046.8564224, decimals: 4 },
  { key: 'km2', label: 'km²', long: 'Kilómetros cuadrados', factor: 1e6, decimals: 6 },
];

export const LENGTH_UNITS = [
  { key: 'm', label: 'm', long: 'Metros', factor: 1, decimals: 2 },
  { key: 'km', label: 'km', long: 'Kilómetros', factor: 1000, decimals: 3 },
  { key: 'vco', label: 'varas', long: 'Varas Colombia (0,80 m)', factor: 0.8, decimals: 2 },
  { key: 'vca', label: 'varas', long: 'Varas C. América (0,8359 m)', factor: 0.8359, decimals: 2 },
  { key: 'ft', label: 'ft', long: 'Pies', factor: 0.3048, decimals: 2 },
  { key: 'yd', label: 'yd', long: 'Yardas', factor: 0.9144, decimals: 2 },
];

export function formatInUnit(value, unit) {
  return `${formatNumber(value / unit.factor, unit.decimals)} ${unit.label}`;
}

export function formatNumber(v, decimals = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  // Formato fijo latinoamericano (3.627,14), igual en todos los teléfonos.
  const [int, dec] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const neg = v < 0 && Number(Math.abs(v).toFixed(decimals)) !== 0;
  return `${neg ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

export function formatArea(m2) {
  if (m2 >= 10000) return `${formatNumber(m2 / 10000, 4)} ha`;
  return `${formatNumber(m2, 1)} m²`;
}

/** Precisión con decimales según magnitud: 3,2 m · 0,45 m · 1,2 cm */
export function formatAccuracy(m) {
  if (m == null) return '—';
  if (m < 0.1) return `${formatNumber(m * 100, 1)} cm`;
  if (m < 1) return `${formatNumber(m, 2)} m`;
  return `${formatNumber(m, 1)} m`;
}

export function formatLength(m) {
  if (m >= 1000) return `${formatNumber(m / 1000, 3)} km`;
  return `${formatNumber(m, 2)} m`;
}
