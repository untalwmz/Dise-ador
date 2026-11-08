import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Button from '../components/Button';
import { formatNumber } from '../geo';
import { useBackButton } from '../hooks';
import { fetchForecast, fetchLastYear, weatherInfo } from '../openmeteo';
import { MONTHS, climateSummary, dailyFromHourly, feelsLikeNote, nextHours } from '../weatherStats';
import { colors, common } from '../theme';

const TEMP = '#e65100';
const FEELS = '#6a1b9a';
const deg = (v, d = 0) => (v == null ? '—' : `${formatNumber(v, d)}°`);
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function WeatherScreen({ goBack, params, active }) {
  const [point, setPoint] = useState(params?.lat != null ? { lat: params.lat, lon: params.lon } : null);
  const [forecast, setForecast] = useState(null);
  const [climate, setClimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [climateError, setClimateError] = useState(null);

  useBackButton(active, goBack);

  // Sin coordenadas: usar la posición actual
  useEffect(() => {
    if (point) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('Sin permiso de ubicación');
        const last = await Location.getLastKnownPositionAsync();
        const pos = last || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        setPoint({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [point]);

  const load = useCallback(async () => {
    if (!point) return;
    setLoading(true);
    setError(null);
    setClimateError(null);
    const [f, c] = await Promise.allSettled([fetchForecast(point.lat, point.lon), fetchLastYear(point.lat, point.lon)]);
    if (f.status === 'fulfilled') setForecast(f.value);
    else setError(f.reason.message);
    if (c.status === 'fulfilled') setClimate(climateSummary(c.value.daily));
    else setClimateError(c.reason.message);
    setLoading(false);
  }, [point]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => dailyFromHourly(forecast?.hourly), [forecast]);
  const hours = useMemo(
    () => (forecast ? nextHours(forecast.hourly, forecast.current?.time || new Date().toISOString(), 24) : []),
    [forecast],
  );
  const cur = forecast?.current;
  const info = cur ? weatherInfo(cur.weather_code, cur.is_day) : null;
  const today = days[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Clima</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {params?.title ? `${params.title} · ` : ''}
            {point ? `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}` : 'Buscando ubicación…'}
            {forecast?.elevation != null ? ` · ${formatNumber(forecast.elevation, 0)} msnm` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} />}
      >
        {error && !forecast && (
          <View style={[common.card, { gap: 8 }]}>
            <Text style={{ color: colors.bad, fontWeight: '700' }}>{error}</Text>
            <Button title="Reintentar" small variant="outline" onPress={load} />
          </View>
        )}
        {!forecast && !error && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {cur && (
          <View style={[common.card, styles.hero]}>
            <View style={styles.heroTop}>
              <Text style={styles.heroIcon}>{info.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTemp}>{deg(cur.temperature_2m, 1)}</Text>
                <Text style={styles.heroDesc}>{info.text}</Text>
              </View>
              <View style={styles.feelsBox}>
                <Text style={styles.feelsLabel}>Sensación térmica</Text>
                <Text style={styles.feelsValue}>{deg(cur.apparent_temperature, 1)}</Text>
              </View>
            </View>
            <Text style={styles.note}>{feelsLikeNote(cur.temperature_2m, cur.apparent_temperature)}</Text>
            <View style={styles.statsRow}>
              <Mini label="Humedad" value={`${formatNumber(cur.relative_humidity_2m, 0)} %`} />
              <Mini label="Viento" value={`${formatNumber(cur.wind_speed_10m, 0)} km/h`} />
              <Mini label="Lluvia" value={`${formatNumber(cur.precipitation, 1)} mm`} />
            </View>
          </View>
        )}

        {today && (
          <View style={common.card}>
            <Text style={common.h2}>Hoy</Text>
            <View style={styles.compareRow}>
              <Compare title="Temperatura" color={TEMP} mean={today.tempMean} min={today.tempMin} max={today.tempMax} />
              <Compare title="Sensación térmica" color={FEELS} mean={today.appMean} min={today.appMin} max={today.appMax} />
            </View>
          </View>
        )}

        {hours.length > 2 && (
          <View style={common.card}>
            <Text style={common.h2}>Próximas 24 horas</Text>
            <Legend />
            <HourChart data={hours} />
          </View>
        )}

        {days.length > 0 && (
          <View style={common.card}>
            <Text style={common.h2}>Próximos 7 días</Text>
            <Text style={common.muted}>Promedio del día: temperatura / sensación térmica</Text>
            <DayList days={days} daily={forecast.daily} />
          </View>
        )}

        <View style={common.card}>
          <Text style={common.h2}>Temperatura promedio (últimos 12 meses)</Text>
          {climate ? (
            <>
              <Text style={common.muted}>
                {climate.from} a {climate.to} · datos históricos ERA5
              </Text>
              <View style={styles.compareRow}>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigStatValue, { color: TEMP }]}>{deg(climate.yearMean, 1)}</Text>
                  <Text style={common.muted}>Temperatura media</Text>
                </View>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigStatValue, { color: FEELS }]}>{deg(climate.yearAppMean, 1)}</Text>
                  <Text style={common.muted}>Sensación media</Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <Mini label="Máx. media" value={deg(climate.yearMaxMean, 1)} />
                <Mini label="Mín. media" value={deg(climate.yearMinMean, 1)} />
                <Mini label="Lluvia/año" value={`${formatNumber(climate.rainTotal, 0)} mm`} />
              </View>
              <View style={styles.statsRow}>
                <Mini label="Máxima absoluta" value={deg(climate.absMax, 1)} />
                <Mini label="Mínima absoluta" value={deg(climate.absMin, 1)} />
              </View>
              <Legend />
              <MonthChart months={climate.monthly} />
              <MonthTable months={climate.monthly} />
            </>
          ) : climateError ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.bad }}>{climateError}</Text>
              <Button title="Reintentar" small variant="ghost" onPress={load} />
            </View>
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          )}
        </View>

        <Text style={[common.muted, { textAlign: 'center' }]}>
          Datos: Open-Meteo (modelos meteorológicos y reanálisis ERA5 de Copernicus). La sensación térmica considera
          temperatura, humedad, viento y radiación solar.
        </Text>
      </ScrollView>
    </View>
  );
}

function Mini({ label, value }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function Compare({ title, color, mean, min, max }) {
  return (
    <View style={[styles.compare, { borderColor: color }]}>
      <Text style={[styles.compareTitle, { color }]}>{title}</Text>
      <Text style={[styles.compareMean, { color }]}>{deg(mean, 1)}</Text>
      <Text style={common.muted}>promedio</Text>
      <Text style={styles.compareRange}>
        ↓ {deg(min)} · ↑ {deg(max)}
      </Text>
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: TEMP }]} />
      <Text style={styles.legendText}>Temperatura</Text>
      <View style={[styles.legendDot, { backgroundColor: FEELS, marginLeft: 14 }]} />
      <Text style={styles.legendText}>Sensación térmica</Text>
    </View>
  );
}

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

function HourChart({ data }) {
  const [width, onLayout] = useWidth();
  const height = 170;
  const pad = { l: 30, r: 8, t: 14, b: 22 };
  const vals = data.flatMap((d) => [d.temp, d.app]).filter((v) => v != null);
  const min = Math.floor(Math.min(...vals) - 1);
  const max = Math.ceil(Math.max(...vals) + 1);
  const x = (i) => pad.l + (i * (width - pad.l - pad.r)) / (data.length - 1);
  const y = (v) => pad.t + ((max - v) * (height - pad.t - pad.b)) / (max - min || 1);
  const path = (key) =>
    data
      .map((d, i) => (d[key] == null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const ticks = [min, (min + max) / 2, max];
  return (
    <View onLayout={onLayout} style={{ height, marginTop: 6 }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <G key={t}>
              <Line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={pad.l - 4} y={y(t) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">
                {Math.round(t)}°
              </SvgText>
            </G>
          ))}
          <Path d={path('app')} stroke={FEELS} strokeWidth={2.5} fill="none" strokeDasharray="5 4" />
          <Path d={path('temp')} stroke={TEMP} strokeWidth={2.5} fill="none" />
          {data.map((d, i) =>
            i % 3 === 0 ? (
              <G key={d.time}>
                {d.temp != null && <Circle cx={x(i)} cy={y(d.temp)} r={2.5} fill={TEMP} />}
                <SvgText x={x(i)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                  {d.time.slice(11, 13)}h
                </SvgText>
                {d.temp != null && (
                  <SvgText x={x(i)} y={y(d.temp) - 6} fontSize={9} fill={TEMP} textAnchor="middle" fontWeight="bold">
                    {Math.round(d.temp)}°
                  </SvgText>
                )}
              </G>
            ) : null,
          )}
        </Svg>
      )}
    </View>
  );
}

function DayList({ days, daily }) {
  const all = days.flatMap((d) => [d.tempMin, d.tempMax]).filter((v) => v != null);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return (
    <View style={{ marginTop: 8 }}>
      {days.map((d, i) => {
        const idx = daily?.time ? daily.time.indexOf(d.date) : -1;
        const w = idx >= 0 ? weatherInfo(daily.weather_code[idx], 1) : null;
        const left = ((d.tempMin - lo) / (hi - lo || 1)) * 100;
        const right = ((hi - d.tempMax) / (hi - lo || 1)) * 100;
        const dt = new Date(`${d.date}T12:00:00`);
        return (
          <View key={d.date} style={styles.dayRow}>
            <Text style={styles.dayName}>{i === 0 ? 'Hoy' : DAYS[dt.getDay()]}</Text>
            <Text style={styles.dayIcon}>{w ? w.icon : ''}</Text>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.rangeTrack}>
                <View style={[styles.rangeBar, { left: `${left}%`, right: `${right}%` }]} />
              </View>
              <Text style={styles.dayMeans}>
                <Text style={{ color: TEMP, fontWeight: '800' }}>{deg(d.tempMean, 1)}</Text>
                {'  /  '}
                <Text style={{ color: FEELS, fontWeight: '800' }}>{deg(d.appMean, 1)}</Text>
                {d.rainProb != null ? `   💧${Math.round(d.rainProb)}%` : ''}
              </Text>
            </View>
            <Text style={styles.dayMinMax}>
              {deg(d.tempMin)} / {deg(d.tempMax)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function MonthChart({ months }) {
  const [width, onLayout] = useWidth();
  const height = 180;
  if (!months.length) return null;
  const pad = { l: 28, r: 6, t: 12, b: 22 };
  const vals = months.flatMap((m) => [m.tempMean, m.appMean]).filter((v) => v != null);
  const min = Math.floor(Math.min(...vals) - 2);
  const max = Math.ceil(Math.max(...vals) + 1);
  const slot = (width - pad.l - pad.r) / months.length;
  const y = (v) => pad.t + ((max - v) * (height - pad.t - pad.b)) / (max - min || 1);
  return (
    <View onLayout={onLayout} style={{ height, marginTop: 6 }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[min, (min + max) / 2, max].map((t) => (
            <G key={t}>
              <Line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={colors.border} />
              <SvgText x={pad.l - 4} y={y(t) + 3} fontSize={10} fill={colors.textMuted} textAnchor="end">
                {Math.round(t)}°
              </SvgText>
            </G>
          ))}
          {months.map((m, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const bw = Math.max(4, slot * 0.34);
            return (
              <G key={m.key}>
                {m.tempMean != null && (
                  <Rect x={cx - bw - 1} y={y(m.tempMean)} width={bw} height={height - pad.b - y(m.tempMean)} fill={TEMP} rx={2} />
                )}
                {m.appMean != null && (
                  <Rect x={cx + 1} y={y(m.appMean)} width={bw} height={height - pad.b - y(m.appMean)} fill={FEELS} rx={2} />
                )}
                <SvgText x={cx} y={height - 7} fontSize={9} fill={colors.textMuted} textAnchor="middle">
                  {MONTHS[m.month - 1]}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

function MonthTable({ months }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={[styles.tr, styles.th]}>
        <Text style={[styles.td, styles.cM, styles.thText]}>Mes</Text>
        <Text style={[styles.td, styles.cN, styles.thText]}>Temp.</Text>
        <Text style={[styles.td, styles.cN, styles.thText]}>Sensación</Text>
        <Text style={[styles.td, styles.cN, styles.thText]}>Mín/Máx</Text>
        <Text style={[styles.td, styles.cN, styles.thText]}>Lluvia</Text>
      </View>
      {months.map((m) => (
        <View key={m.key} style={styles.tr}>
          <Text style={[styles.td, styles.cM]}>
            {MONTHS[m.month - 1]} {String(m.year).slice(2)}
          </Text>
          <Text style={[styles.td, styles.cN, { color: TEMP, fontWeight: '700' }]}>{deg(m.tempMean, 1)}</Text>
          <Text style={[styles.td, styles.cN, { color: FEELS, fontWeight: '700' }]}>{deg(m.appMean, 1)}</Text>
          <Text style={[styles.td, styles.cN]}>
            {deg(m.tempMin)}/{deg(m.tempMax)}
          </Text>
          <Text style={[styles.td, styles.cN]}>{formatNumber(m.rain, 0)} mm</Text>
        </View>
      ))}
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
  hero: { gap: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { fontSize: 52 },
  heroTemp: { fontSize: 44, fontWeight: '900', color: TEMP },
  heroDesc: { fontSize: 15, color: colors.text, fontWeight: '600' },
  feelsBox: { alignItems: 'center', backgroundColor: '#f3e5f5', borderRadius: 12, padding: 10 },
  feelsLabel: { fontSize: 11, color: FEELS, fontWeight: '700' },
  feelsValue: { fontSize: 28, fontWeight: '900', color: FEELS },
  note: { color: colors.textMuted, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', marginTop: 6 },
  miniValue: { fontWeight: '800', fontSize: 15, color: colors.text },
  miniLabel: { fontSize: 11, color: colors.textMuted },
  compareRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  compare: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderRadius: 12, padding: 10 },
  compareTitle: { fontWeight: '800', fontSize: 13 },
  compareMean: { fontSize: 28, fontWeight: '900' },
  compareRange: { fontSize: 13, color: colors.text, fontWeight: '600', marginTop: 2 },
  bigStat: { flex: 1, alignItems: 'center' },
  bigStatValue: { fontSize: 30, fontWeight: '900' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  legendText: { fontSize: 12, color: colors.text },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayName: { width: 34, fontWeight: '800', color: colors.text },
  dayIcon: { width: 26, fontSize: 18 },
  rangeTrack: { height: 6, borderRadius: 3, backgroundColor: '#eceff1' },
  rangeBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3, backgroundColor: TEMP },
  dayMeans: { fontSize: 12, color: colors.textMuted },
  dayMinMax: { width: 70, textAlign: 'right', fontSize: 12, color: colors.text, fontWeight: '600' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { marginTop: 4 },
  thText: { fontWeight: '800', color: colors.textMuted, fontSize: 11 },
  td: { fontSize: 12, color: colors.text },
  cM: { width: 56 },
  cN: { flex: 1, textAlign: 'right' },
});
