import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Barometer } from 'expo-sensors';
import Button from '../components/Button';
import { combineEstimates, geoidUndulation, meanWithError, pressureToAltitude } from '../altitude';
import { formatNumber, haversine } from '../geo';
import { FIX_TYPES } from '../gnss/nmea';
import { useLocationFeed } from '../gnss/useLocationFeed';
import { useBackButton } from '../hooks';
import { fetchElevation, fetchPressure } from '../openmeteo';
import { getSettings } from '../storage';
import { colors, common } from '../theme';

const AVG_SECONDS = 60;

export default function AltitudeScreen({ goBack, params, active }) {
  const [settings, setSettings] = useState(null);
  const [current, setCurrent] = useState(null);
  const [samples, setSamples] = useState([]); // lecturas GPS acumuladas
  const [averaging, setAveraging] = useState(false);
  const [avgStart, setAvgStart] = useState(null);
  const [baro, setBaro] = useState({ available: null, pressure: null });
  const [online, setOnline] = useState({ loading: false, error: null, dem: null, pressureMsl: null, temp: null, at: null });
  const averagingRef = useRef(false);
  const lastAttempt = useRef(null); // punto de la última consulta automática
  averagingRef.current = averaging;

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);
  useBackButton(active, goBack);

  const onFix = useCallback((fix) => {
    setCurrent(fix);
    if (fix && averagingRef.current && fix.altMsl != null) setSamples((s) => [...s, fix]);
  }, []);
  const { permission } = useLocationFeed(settings, onFix);

  // Barómetro del teléfono (si tiene)
  useEffect(() => {
    let sub = null;
    let cancelled = false;
    Barometer.isAvailableAsync()
      .then((ok) => {
        if (cancelled) return;
        setBaro((b) => ({ ...b, available: ok }));
        if (!ok) return;
        Barometer.setUpdateInterval(1000);
        const readings = [];
        sub = Barometer.addListener(({ pressure }) => {
          readings.push(pressure);
          if (readings.length > 10) readings.shift();
          // media móvil de 10 s para suavizar
          setBaro({ available: true, pressure: readings.reduce((s, x) => s + x, 0) / readings.length });
        });
      })
      .catch(() => setBaro({ available: false, pressure: null }));
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, []);

  // Punto de interés: el que viene por parámetro (un lote) o la posición actual
  const target = params?.lat != null ? { lat: params.lat, lon: params.lon } : current;
  const hereIsTarget = !params?.lat || (current && haversine(current, params) < 150);

  const loadOnline = useCallback(async (pt) => {
    if (!pt) return;
    setOnline((o) => ({ ...o, loading: true, error: null }));
    try {
      const [dem, pr] = await Promise.all([fetchElevation(pt.lat, pt.lon), fetchPressure(pt.lat, pt.lon)]);
      setOnline({ loading: false, error: null, dem, pressureMsl: pr.pressureMsl, temp: pr.temperature, at: { ...pt } });
    } catch (e) {
      setOnline((o) => ({ ...o, loading: false, error: e.message }));
    }
  }, []);

  // Consulta en línea una vez que tenemos punto (y de nuevo si nos movemos >200 m).
  // Si falla, no reintenta sola en el mismo lugar: queda el botón «Reintentar».
  const targetLat = target?.lat;
  const targetLon = target?.lon;
  useEffect(() => {
    if (targetLat == null) return;
    const pt = { lat: targetLat, lon: targetLon };
    if (lastAttempt.current && haversine(lastAttempt.current, pt) < 200) return;
    lastAttempt.current = pt;
    loadOnline(pt);
  }, [targetLat, targetLon, loadOnline]);

  // Auto-detener el promedio
  useEffect(() => {
    if (!averaging) return undefined;
    const t = setTimeout(() => setAveraging(false), AVG_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [averaging]);

  const startAverage = () => {
    setSamples([]);
    setAvgStart(Date.now());
    setAveraging(true);
  };

  // --- Estimaciones ---
  const isExternal = settings?.source === 'external';
  const gps = useMemo(() => {
    const use = samples.length ? samples : current && current.altMsl != null ? [current] : [];
    if (!use.length) return null;
    const m = meanWithError(use.map((s) => s.altMsl));
    const accs = use.map((s) => s.altAcc ?? (s.acc != null ? s.acc * 1.5 : null)).filter((x) => x != null);
    const vAcc = accs.length ? accs.reduce((s, x) => s + x, 0) / accs.length : 10;
    // Los errores del GPS están correlacionados en el tiempo: ~1 muestra independiente cada 10 s.
    const nEff = Math.max(1, use.length / 10);
    const floor = isExternal && use[0].quality === 4 ? 0.02 : 1.5;
    return { value: m.mean, sigma: Math.max(vAcc / Math.sqrt(nEff), floor), n: use.length, sd: m.sd };
  }, [samples, current, isExternal]);

  const baroAlt =
    baro.pressure && online.pressureMsl ? pressureToAltitude(baro.pressure, online.pressureMsl, online.temp ?? 15) : null;

  const estimates = [
    hereIsTarget && gps ? { key: 'gps', value: gps.value, sigma: gps.sigma } : null,
    hereIsTarget && baroAlt != null ? { key: 'baro', value: baroAlt, sigma: 8 } : null,
    online.dem != null ? { key: 'dem', value: online.dem, sigma: 10 } : null,
  ].filter(Boolean);
  const best = combineEstimates(estimates);

  const N = target ? geoidUndulation(target.lat, target.lon) : null;
  const elapsed = averaging && avgStart ? Math.min(AVG_SECONDS, Math.round((Date.now() - avgStart) / 1000)) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Altitud (MSNM)</Text>
          {params?.title ? <Text style={styles.subtitle}>{params.title}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[common.card, styles.bestCard]}>
          <Text style={styles.bestLabel}>MEJOR ESTIMACIÓN</Text>
          {best ? (
            <>
              <Text style={styles.bestValue}>{formatNumber(best.value, best.sigma < 1 ? 2 : 0)} msnm</Text>
              <Text style={styles.bestSigma}>± {formatNumber(best.sigma, best.sigma < 1 ? 2 : 1)} m</Text>
              <Text style={common.muted}>Combina {estimates.length} {estimates.length === 1 ? 'fuente' : 'fuentes'} según su precisión</Text>
            </>
          ) : (
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={common.muted}>{permission === 'denied' ? 'Sin permiso de ubicación' : 'Obteniendo datos…'}</Text>
            </View>
          )}
          {target && (
            <Text style={[common.muted, { marginTop: 4 }]}>
              {target.lat.toFixed(6)}, {target.lon.toFixed(6)}
            </Text>
          )}
        </View>

        {params?.lat != null && !hereIsTarget && (
          <View style={[common.card, styles.note]}>
            <Text style={styles.noteText}>
              Estás lejos de este lote: el GPS y el barómetro miden tu posición actual, por eso solo se usa el modelo de
              terreno para el lote.
            </Text>
          </View>
        )}

        <Source
          icon={isExternal ? '📡' : '🛰'}
          title={isExternal ? 'Receptor GNSS externo' : 'GPS del teléfono (corregido a MSNM)'}
          value={gps ? `${formatNumber(gps.value, gps.sigma < 1 ? 2 : 1)} m` : '—'}
          sigma={gps ? gps.sigma : null}
          used={hereIsTarget && !!gps}
        >
          <Text style={common.muted}>
            {isExternal
              ? `Altitud sobre el geoide que reporta el receptor${current?.quality != null ? ` (${FIX_TYPES[current.quality]?.label})` : ''}.`
              : `El GPS mide la altura sobre el elipsoide WGS84; se resta la ondulación del geoide EGM96 aquí (${
                  N != null ? `${formatNumber(N, 1)} m` : '—'
                }).`}
          </Text>
          {gps && gps.n > 1 && (
            <Text style={common.muted}>
              {gps.n} lecturas promediadas · dispersión ±{formatNumber(gps.sd || 0, 1)} m
            </Text>
          )}
          {averaging ? (
            <View style={styles.avgRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.avgText}>
                Promediando… {elapsed}/{AVG_SECONDS} s · {samples.length} lecturas. Quédate quieto.
              </Text>
              <Button title="Parar" small variant="ghost" onPress={() => setAveraging(false)} />
            </View>
          ) : (
            <Button
              title={samples.length ? 'Volver a promediar 60 s' : 'Promediar 60 s (más precisión)'}
              small
              variant="outline"
              onPress={startAverage}
              disabled={!current}
            />
          )}
        </Source>

        <Source
          icon="🌀"
          title="Barómetro calibrado"
          value={baroAlt != null ? `${formatNumber(baroAlt, 1)} m` : '—'}
          sigma={baroAlt != null ? 8 : null}
          used={hereIsTarget && baroAlt != null}
        >
          <Text style={common.muted}>
            {baro.available === false
              ? 'Este teléfono no tiene barómetro.'
              : baro.pressure
                ? `Presión medida ${formatNumber(baro.pressure, 1)} hPa; presión al nivel del mar ahora ${
                    online.pressureMsl ? `${formatNumber(online.pressureMsl, 1)} hPa (Open-Meteo)` : '— (requiere internet)'
                  }.`
                : 'Leyendo el sensor…'}
          </Text>
        </Source>

        <Source
          icon="🗺"
          title="Modelo de terreno (Copernicus DEM)"
          value={online.dem != null ? `${formatNumber(online.dem, 0)} m` : '—'}
          sigma={online.dem != null ? 10 : null}
          used={online.dem != null}
        >
          <Text style={common.muted}>
            Elevación del terreno según imágenes de satélite (resolución 90 m), vía Open-Meteo.
          </Text>
          {online.loading && <ActivityIndicator color={colors.primary} />}
          {online.error && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.bad }}>{online.error}</Text>
              <Button title="Reintentar" small variant="ghost" onPress={() => loadOnline(target)} />
            </View>
          )}
        </Source>

        <View style={[common.card, { gap: 6 }]}>
          <Text style={common.h2}>Para la mayor precisión</Text>
          <Text style={common.muted}>
            • Quédate quieto a cielo abierto y usa «Promediar 60 s».{'\n'}• Un receptor externo con RTK fijo da altitud
            al centímetro y domina la estimación.{'\n'}• El barómetro es muy estable para comparar alturas entre puntos
            cercanos; su valor absoluto depende de la presión del momento.{'\n'}• La precisión vertical del GPS del
            teléfono suele ser 1,5 veces peor que la horizontal.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Source({ icon, title, value, sigma, used, children }) {
  return (
    <View style={[common.card, { gap: 6 }]}>
      <View style={common.row}>
        <Text style={styles.srcIcon}>{icon}</Text>
        <Text style={[common.h2, { flex: 1, fontSize: 15 }]}>{title}</Text>
        {used && <Text style={styles.usedTag}>en uso</Text>}
      </View>
      <Text style={styles.srcValue}>
        {value}
        {sigma != null ? <Text style={styles.srcSigma}>  ± {formatNumber(sigma, sigma < 1 ? 2 : 1)} m</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  bestCard: { alignItems: 'center', gap: 2 },
  bestLabel: { color: colors.textMuted, fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
  bestValue: { fontSize: 36, fontWeight: '900', color: colors.primaryDark },
  bestSigma: { fontSize: 16, fontWeight: '700', color: colors.text },
  note: { backgroundColor: '#fff8e1', borderColor: colors.fair },
  noteText: { color: '#6d4c00', fontWeight: '600' },
  srcIcon: { fontSize: 20, marginRight: 8 },
  srcValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  srcSigma: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  usedTag: {
    backgroundColor: '#e8f5e9',
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  avgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff3e0', borderRadius: 10, padding: 8 },
  avgText: { flex: 1, color: colors.accent, fontWeight: '700' },
});
