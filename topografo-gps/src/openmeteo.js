// Cliente de Open-Meteo (gratuito, sin API key): elevación, clima y datos históricos.
// https://open-meteo.com — modelos meteorológicos nacionales y reanálisis ERA5.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ELEVATION = 'https://api.open-meteo.com/v1/elevation';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

async function getJSON(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
      throw new Error(body?.reason || `Error del servidor (${res.status})`);
    }
    return body;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Sin respuesta del servidor (¿hay internet?)');
    if (e.message === 'Network request failed') throw new Error('Sin conexión a internet');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const ll = (lat, lon) => `latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`;

/** Elevación del terreno (MSNM) según el modelo Copernicus DEM (90 m). */
export async function fetchElevation(lat, lon) {
  const j = await getJSON(`${ELEVATION}?${ll(lat, lon)}`);
  const v = j.elevation && j.elevation[0];
  return Number.isFinite(v) ? v : null;
}

/** Presión al nivel del mar y temperatura actuales (para calibrar el barómetro). */
export async function fetchPressure(lat, lon) {
  const j = await getJSON(`${FORECAST}?${ll(lat, lon)}&current=pressure_msl,surface_pressure,temperature_2m&timezone=auto`);
  return {
    pressureMsl: j.current?.pressure_msl ?? null,
    surfacePressure: j.current?.surface_pressure ?? null,
    temperature: j.current?.temperature_2m ?? null,
    modelElevation: j.elevation ?? null,
  };
}

/** Pronóstico: actual, 7 días por hora y diario. */
export async function fetchForecast(lat, lon) {
  const current = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'wind_speed_10m',
    'precipitation',
    'weather_code',
    'is_day',
  ].join(',');
  const hourly = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation_probability'].join(',');
  const daily = ['weather_code', 'precipitation_sum', 'sunrise', 'sunset', 'uv_index_max'].join(',');
  return getJSON(
    `${FORECAST}?${ll(lat, lon)}&current=${current}&hourly=${hourly}&daily=${daily}&timezone=auto&forecast_days=7&wind_speed_unit=kmh`,
  );
}

const isoDate = (d) => d.toISOString().slice(0, 10);

/** Últimos 12 meses de datos diarios (reanálisis ERA5; llega con ~5 días de retraso). */
export async function fetchLastYear(lat, lon) {
  const end = new Date(Date.now() - 7 * 86400000);
  const start = new Date(end.getTime() - 365 * 86400000);
  const daily = ['temperature_2m_mean', 'apparent_temperature_mean', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'].join(',');
  return getJSON(`${ARCHIVE}?${ll(lat, lon)}&start_date=${isoDate(start)}&end_date=${isoDate(end)}&daily=${daily}&timezone=auto`, 25000);
}

// Códigos WMO de estado del tiempo -> texto e ícono
export function weatherInfo(code, isDay = 1) {
  const map = {
    0: ['Despejado', isDay ? '☀️' : '🌙'],
    1: ['Mayormente despejado', isDay ? '🌤' : '🌙'],
    2: ['Parcialmente nublado', '⛅'],
    3: ['Nublado', '☁️'],
    45: ['Niebla', '🌫'],
    48: ['Niebla con escarcha', '🌫'],
    51: ['Llovizna ligera', '🌦'],
    53: ['Llovizna', '🌦'],
    55: ['Llovizna intensa', '🌧'],
    61: ['Lluvia ligera', '🌦'],
    63: ['Lluvia', '🌧'],
    65: ['Lluvia fuerte', '🌧'],
    66: ['Lluvia helada', '🌧'],
    67: ['Lluvia helada fuerte', '🌧'],
    71: ['Nieve ligera', '🌨'],
    73: ['Nieve', '🌨'],
    75: ['Nieve fuerte', '❄️'],
    80: ['Chubascos', '🌦'],
    81: ['Chubascos fuertes', '🌧'],
    82: ['Aguaceros violentos', '⛈'],
    95: ['Tormenta', '⛈'],
    96: ['Tormenta con granizo', '⛈'],
    99: ['Tormenta con granizo fuerte', '⛈'],
  };
  const [text, icon] = map[code] || ['—', '🌡'];
  return { text, icon };
}
