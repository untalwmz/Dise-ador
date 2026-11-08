// Altitud sobre el nivel del mar (MSNM).
//
// El GPS de Android entrega la altura sobre el ELIPSOIDE WGS84, no sobre el nivel
// del mar. La diferencia (ondulación del geoide) va de -105 a +85 m según el lugar
// (≈ +26 m en el sur de Colombia). La corregimos con el modelo EGM96.
import { meanSeaLevel } from 'egm96-universal';

/** Ondulación del geoide EGM96 (m) en ese punto. */
export function geoidUndulation(lat, lon) {
  return meanSeaLevel(lat, lon);
}

/** Altura elipsoidal WGS84 -> altitud ortométrica (MSNM, EGM96). */
export function ellipsoidToMsl(lat, lon, ellipsoidAlt) {
  if (ellipsoidAlt == null || Number.isNaN(ellipsoidAlt)) return null;
  return ellipsoidAlt - meanSeaLevel(lat, lon);
}

/**
 * Altitud a partir de presión barométrica (fórmula internacional), calibrada con
 * la presión a nivel del mar del momento (p0, hPa) y la temperatura (°C).
 */
export function pressureToAltitude(p, p0, tempC = 15) {
  if (!p || !p0) return null;
  const T0 = (tempC ?? 15) + 273.15;
  // Fórmula hipsométrica con gradiente estándar 0,0065 K/m
  return (T0 / 0.0065) * (1 - Math.pow(p / p0, 0.190263));
}

/**
 * Combina estimaciones independientes { value, sigma } por mínimos cuadrados
 * ponderados (1/σ²). Devuelve { value, sigma } o null.
 */
export function combineEstimates(list) {
  const valid = list.filter((e) => e && e.value != null && Number.isFinite(e.value) && e.sigma > 0);
  if (!valid.length) return null;
  let w = 0;
  let v = 0;
  for (const e of valid) {
    const wi = 1 / (e.sigma * e.sigma);
    w += wi;
    v += e.value * wi;
  }
  return { value: v / w, sigma: Math.sqrt(1 / w) };
}

/** Media y desviación estándar de la media de una serie. */
export function meanWithError(values) {
  const xs = values.filter((x) => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (xs.length < 2) return { mean, sd: null, n: 1 };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1));
  return { mean, sd, n: xs.length };
}
