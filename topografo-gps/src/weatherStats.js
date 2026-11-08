// Cálculos sobre las series de Open-Meteo (funciones puras, probadas con node --test).

const avg = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/**
 * Agrupa la serie horaria por día: media, mínima y máxima de temperatura y de
 * sensación térmica, humedad media y probabilidad de lluvia máxima.
 */
export function dailyFromHourly(hourly) {
  if (!hourly || !hourly.time) return [];
  const days = new Map();
  hourly.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (!days.has(date)) days.set(date, { date, temp: [], app: [], hum: [], pop: [] });
    const d = days.get(date);
    d.temp.push(hourly.temperature_2m?.[i]);
    d.app.push(hourly.apparent_temperature?.[i]);
    d.hum.push(hourly.relative_humidity_2m?.[i]);
    d.pop.push(hourly.precipitation_probability?.[i]);
  });
  return [...days.values()].map((d) => {
    const temps = d.temp.filter(Number.isFinite);
    const apps = d.app.filter(Number.isFinite);
    const pops = d.pop.filter(Number.isFinite);
    return {
      date: d.date,
      tempMean: avg(temps),
      tempMin: temps.length ? Math.min(...temps) : null,
      tempMax: temps.length ? Math.max(...temps) : null,
      appMean: avg(apps),
      appMin: apps.length ? Math.min(...apps) : null,
      appMax: apps.length ? Math.max(...apps) : null,
      humidity: avg(d.hum),
      rainProb: pops.length ? Math.max(...pops) : null,
    };
  });
}

/** Próximas `hours` horas a partir de `nowIso` (hora local de la API). */
export function nextHours(hourly, nowIso, hours = 24) {
  if (!hourly || !hourly.time) return [];
  const nowHour = nowIso.slice(0, 13);
  let start = hourly.time.findIndex((t) => t.slice(0, 13) >= nowHour);
  if (start < 0) start = 0;
  const out = [];
  for (let i = start; i < Math.min(hourly.time.length, start + hours); i++) {
    out.push({
      time: hourly.time[i],
      temp: hourly.temperature_2m?.[i] ?? null,
      app: hourly.apparent_temperature?.[i] ?? null,
    });
  }
  return out;
}

/** Promedios mensuales y anuales a partir de la serie diaria del archivo histórico. */
export function climateSummary(daily) {
  if (!daily || !daily.time) return null;
  const months = new Map();
  daily.time.forEach((t, i) => {
    const key = t.slice(0, 7);
    if (!months.has(key)) months.set(key, { key, mean: [], app: [], max: [], min: [], rain: [] });
    const m = months.get(key);
    m.mean.push(daily.temperature_2m_mean?.[i]);
    m.app.push(daily.apparent_temperature_mean?.[i]);
    m.max.push(daily.temperature_2m_max?.[i]);
    m.min.push(daily.temperature_2m_min?.[i]);
    m.rain.push(daily.precipitation_sum?.[i]);
  });
  const monthly = [...months.values()]
    .filter((m) => m.mean.filter(Number.isFinite).length >= 10) // descarta meses casi vacíos
    .map((m) => ({
      key: m.key,
      month: Number(m.key.slice(5, 7)),
      year: Number(m.key.slice(0, 4)),
      tempMean: avg(m.mean),
      appMean: avg(m.app),
      tempMax: avg(m.max),
      tempMin: avg(m.min),
      rain: m.rain.filter(Number.isFinite).reduce((s, x) => s + x, 0),
    }));
  const allMax = (daily.temperature_2m_max || []).filter(Number.isFinite);
  const allMin = (daily.temperature_2m_min || []).filter(Number.isFinite);
  return {
    monthly,
    yearMean: avg(daily.temperature_2m_mean || []),
    yearAppMean: avg(daily.apparent_temperature_mean || []),
    yearMaxMean: avg(allMax),
    yearMinMean: avg(allMin),
    absMax: allMax.length ? Math.max(...allMax) : null,
    absMin: allMin.length ? Math.min(...allMin) : null,
    rainTotal: (daily.precipitation_sum || []).filter(Number.isFinite).reduce((s, x) => s + x, 0),
    from: daily.time[0],
    to: daily.time[daily.time.length - 1],
  };
}

/** Clasificación de la sensación térmica respecto a la temperatura real. */
export function feelsLikeNote(temp, app) {
  if (temp == null || app == null) return '';
  const d = app - temp;
  if (d >= 3) return 'Se siente más caluroso por la humedad';
  if (d <= -3) return 'Se siente más frío por el viento';
  return 'Se siente parecido a la temperatura real';
}

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
