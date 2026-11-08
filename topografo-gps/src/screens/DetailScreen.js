import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import MapCanvas from '../components/MapCanvas';
import Sketch from '../components/Sketch';
import Button from '../components/Button';
import Chips from '../components/Chips';
import { AREA_UNITS, computeSurvey, formatAccuracy, formatDMS, formatLength, formatNumber, pathLength, polygonArea, simplify } from '../geo';
import { safeFileName, toCSV, toGeoJSON, toKML, toReport } from '../exporters';
import { deleteLot, getLot, getSettings, saveLot } from '../storage';
import { useBackButton } from '../hooks';
import { ellipsoidToMsl, meanWithError } from '../altitude';
import { colors, common } from '../theme';

const EXPORTS = [
  { key: 'kml', label: 'KML (Google Earth)', ext: 'kml', mime: 'application/vnd.google-earth.kml+xml', fn: toKML },
  { key: 'geojson', label: 'GeoJSON (QGIS)', ext: 'geojson', mime: 'application/geo+json', fn: toGeoJSON },
  { key: 'csv', label: 'CSV (Excel/CAD)', ext: 'csv', mime: 'text/csv', fn: toCSV },
  { key: 'txt', label: 'Informe (texto)', ext: 'txt', mime: 'text/plain', fn: toReport },
];

export default function DetailScreen({ navigate, push, params, active }) {
  const [lot, setLot] = useState(null);
  const [view, setView] = useState('map');
  const [exporting, setExporting] = useState(null);
  const [tolerance, setTolerance] = useState(1);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    getLot(params.id).then((l) => {
      if (!l) navigate('home');
      else setLot(l);
    });
  }, [params.id, navigate]);

  useBackButton(active, () => navigate('home'));

  const report = useMemo(() => (lot ? computeSurvey(lot.points) : null), [lot]);
  const mapSides = useMemo(
    () =>
      report && lot.points.length <= 40
        ? report.sides.map((s) => ({ from: s.from, to: s.to, label: `${formatNumber(s.length, 1)} m` }))
        : [],
    [lot, report],
  );
  // Altitud MSNM de los vértices medidos con GPS (los antiguos sin altMsl se corrigen con EGM96)
  const altStats = useMemo(() => {
    if (!lot) return null;
    const vals = lot.points
      .map((p) => (p.altMsl != null ? p.altMsl : p.alt != null && lot.source !== 'external' ? ellipsoidToMsl(p.lat, p.lon, p.alt) : p.alt))
      .filter((v) => v != null);
    if (!vals.length) return null;
    const m = meanWithError(vals);
    return { ...m, min: Math.min(...vals), max: Math.max(...vals) };
  }, [lot]);

  if (!lot || !report) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const share = async (exp) => {
    setExporting(exp.key);
    try {
      const content = exp.fn(lot, lot.points);
      const file = new File(Paths.cache, `${safeFileName(lot.name)}.${exp.ext}`);
      file.create({ overwrite: true });
      await file.write(content);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Compartir archivos no está disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: exp.mime, dialogTitle: `Exportar ${lot.name}` });
    } catch (e) {
      Alert.alert('Error al exportar', e.message);
    } finally {
      setExporting(null);
    }
  };

  const simplified = simplify(lot.points, tolerance);
  const applySimplify = () => {
    if (simplified.length === lot.points.length) {
      Alert.alert('Sin cambios', 'Con esa tolerancia no hay vértices que eliminar.');
      return;
    }
    const newArea = polygonArea(simplified);
    Alert.alert(
      'Simplificar vértices',
      `Pasar de ${lot.points.length} a ${simplified.length} vértices.\nÁrea: ${formatNumber(report.area, 1)} → ${formatNumber(
        newArea,
        1,
      )} m².\nSe guarda una copia de los puntos originales.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Simplificar',
          onPress: async () => {
            const updated = {
              ...lot,
              rawPoints: lot.rawPoints || lot.points,
              points: simplified,
              area: newArea,
              perimeter: pathLength(simplified, true),
            };
            await saveLot(updated);
            setLot(updated);
          },
        },
      ],
    );
  };

  const restore = async () => {
    const updated = {
      ...lot,
      points: lot.rawPoints,
      rawPoints: undefined,
      area: polygonArea(lot.rawPoints),
      perimeter: pathLength(lot.rawPoints, true),
    };
    await saveLot(updated);
    setLot(updated);
  };

  const remove = () =>
    Alert.alert('Eliminar lote', `¿Eliminar «${lot.name}»? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteLot(lot.id);
          navigate('home');
        },
      },
    ]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigate('home')} style={styles.back} hitSlop={10}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {lot.name}
          </Text>
          <Text style={styles.subtitle}>
            {new Date(lot.createdAt).toLocaleString('es')} · UTM {report.zone}
            {report.hemisphere}
            {lot.receiver ? ` · 📡 ${lot.receiver}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.viewToggle}>
          <Chips
            value={view}
            onChange={setView}
            options={[
              { value: 'map', label: '🛰 Satélite' },
              { value: 'sketch', label: '✏️ Croquis' },
            ]}
          />
        </View>
        {view === 'map' ? (
          <View style={styles.mapBox}>
            <MapCanvas
              provider={settings?.mapProvider}
              mapType={settings?.mapType || 'satellite'}
              points={lot.points}
              sides={mapSides}
              fitKey={lot.id + lot.points.length}
              follow={false}
            />
          </View>
        ) : (
          <Sketch points={lot.points} sides={report.sides} height={300} />
        )}

        <View style={[common.card, styles.areaCard]}>
          <Text style={styles.areaLabel}>ÁREA</Text>
          <Text style={styles.areaBig}>{formatNumber(report.area, 2)} m²</Text>
          <Text style={styles.areaHa}>{formatNumber(report.area / 10000, 4)} hectáreas</Text>
          {report.areaUncertainty != null && (
            <Text style={common.muted}>Incertidumbre aprox. ± {formatNumber(report.areaUncertainty, report.areaUncertainty < 10 ? 2 : 0)} m²</Text>
          )}
          <View style={styles.unitGrid}>
            {AREA_UNITS.filter((u) => !['m2', 'ha'].includes(u.key)).map((u) => (
              <View key={u.key} style={styles.unit}>
                <Text style={styles.unitValue}>{formatNumber(report.area / u.factor, u.decimals)}</Text>
                <Text style={common.muted}>{u.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.divider} />
          <View style={common.row}>
            <Metric label="Perímetro" value={formatLength(report.perimeter)} />
            <Metric label="Vértices" value={String(lot.points.length)} />
            <Metric label="Precisión media" value={report.meanAcc != null ? `±${formatAccuracy(report.meanAcc)}` : '—'} />
          </View>
        </View>

        <View style={[common.card, { gap: 8 }]}>
          <Text style={common.h2}>Altitud y clima del lote</Text>
          {altStats ? (
            <View style={common.row}>
              <Metric label="Altitud media" value={`${formatNumber(altStats.mean, 0)} msnm`} />
              <Metric label="Mínima" value={`${formatNumber(altStats.min, 0)} m`} />
              <Metric label="Máxima" value={`${formatNumber(altStats.max, 0)} m`} />
            </View>
          ) : (
            <Text style={common.muted}>Este lote no tiene altitudes GPS (vértices dibujados en el mapa).</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title="⛰ Altitud precisa"
              small
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => push('altitude', { lat: report.centroid.lat, lon: report.centroid.lon, title: lot.name })}
            />
            <Button
              title="🌡 Clima"
              small
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => push('weather', { lat: report.centroid.lat, lon: report.centroid.lon, title: lot.name })}
            />
          </View>
        </View>

        {report.selfIntersecting && (
          <View style={[common.card, styles.warn]}>
            <Text style={styles.warnText}>
              ⚠️ El contorno se cruza a sí mismo; el área calculada puede no ser correcta. Revisa el croquis o vuelve a
              medir.
            </Text>
          </View>
        )}

        <View style={common.card}>
          <Text style={common.h2}>Exportar</Text>
          <View style={styles.exportGrid}>
            {EXPORTS.map((e) => (
              <Button
                key={e.key}
                title={e.label}
                variant="outline"
                small
                loading={exporting === e.key}
                onPress={() => share(e)}
                style={styles.exportBtn}
              />
            ))}
          </View>
        </View>

        <View style={common.card}>
          <Text style={common.h2}>Cuadro de construcción</Text>
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.td, styles.c1, styles.thText]}>Lado</Text>
            <Text style={[styles.td, styles.c2, styles.thText]}>Rumbo</Text>
            <Text style={[styles.td, styles.c3, styles.thText]}>Dist. (m)</Text>
          </View>
          {report.sides.map((s) => (
            <View key={s.from} style={styles.tr}>
              <Text style={[styles.td, styles.c1]}>
                V{s.from}–V{s.to}
              </Text>
              <View style={styles.c2}>
                <Text style={styles.td}>{s.bearing}</Text>
                <Text style={styles.small}>Az. {formatDMS(s.azimuth)}</Text>
              </View>
              <Text style={[styles.td, styles.c3, styles.num]}>{formatNumber(s.length, 2)}</Text>
            </View>
          ))}
        </View>

        <View style={common.card}>
          <Text style={common.h2}>Coordenadas UTM {report.zone}{report.hemisphere} (WGS84)</Text>
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.td, styles.c1, styles.thText]}>Vért.</Text>
            <Text style={[styles.td, styles.cE, styles.thText]}>Este (m)</Text>
            <Text style={[styles.td, styles.cE, styles.thText]}>Norte (m)</Text>
            <Text style={[styles.td, styles.cA, styles.thText]}>±</Text>
          </View>
          {report.vertices.map((v) => (
            <View key={v.index} style={styles.tr}>
              <Text style={[styles.td, styles.c1]}>V{v.index}</Text>
              <Text style={[styles.td, styles.cE, styles.num]}>{v.utm.easting.toFixed(2)}</Text>
              <Text style={[styles.td, styles.cE, styles.num]}>{v.utm.northing.toFixed(2)}</Text>
              <Text style={[styles.td, styles.cA, styles.num]}>{v.acc != null ? v.acc.toFixed(v.acc < 1 ? 2 : 1) : '—'}</Text>
            </View>
          ))}
        </View>

        <View style={[common.card, { gap: 8 }]}>
          <Text style={common.h2}>Simplificar vértices</Text>
          <Text style={common.muted}>
            En modo caminata se registran muchos puntos. Puedes eliminar los que están casi en línea recta para dejar
            solo las esquinas reales.
          </Text>
          <Chips
            value={tolerance}
            onChange={setTolerance}
            options={[0.5, 1, 2, 3].map((v) => ({ value: v, label: `Tolerancia ${v} m` }))}
          />
          <Text style={common.muted}>
            Resultado: {simplified.length} vértices · {formatNumber(polygonArea(simplified), 1)} m²
          </Text>
          <Button title="Simplificar" variant="outline" small onPress={applySimplify} />
          {lot.rawPoints && (
            <Button
              title={`Restaurar ${lot.rawPoints.length} puntos originales`}
              variant="ghost"
              small
              onPress={restore}
            />
          )}
        </View>

        {lot.notes ? (
          <View style={common.card}>
            <Text style={common.h2}>Notas</Text>
            <Text style={{ color: colors.text, marginTop: 4 }}>{lot.notes}</Text>
          </View>
        ) : null}

        <Text style={[common.muted, { textAlign: 'center', paddingHorizontal: 10 }]}>
          {lot.source === 'external'
            ? `Medición con receptor externo${lot.receiver ? ` (${lot.receiver})` : ''}. La exactitud depende del tipo de solución (RTK fijo, DGPS, etc.) y de las correcciones usadas.`
            : 'Medición con el GPS del teléfono (precisión típica 3–5 m). Útil como referencia; no sustituye un levantamiento topográfico certificado.'}
        </Text>

        <Button title="Eliminar lote" variant="danger" small onPress={remove} />
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={common.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  title: { color: '#fff', fontSize: 19, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  viewToggle: { alignItems: 'flex-start' },
  mapBox: { height: 300, borderRadius: 12, overflow: 'hidden' },
  areaCard: { alignItems: 'center', gap: 2 },
  areaLabel: { color: colors.textMuted, fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
  areaBig: { fontSize: 32, fontWeight: '900', color: colors.primaryDark },
  areaHa: { fontSize: 18, fontWeight: '700', color: colors.text },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10, gap: 6 },
  unit: { alignItems: 'center', minWidth: '45%', paddingVertical: 4 },
  unitValue: { fontWeight: '700', color: colors.text, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.border, alignSelf: 'stretch', marginVertical: 10 },
  metricValue: { fontWeight: '800', fontSize: 15, color: colors.text },
  warn: { borderColor: colors.fair, backgroundColor: '#fff8e1' },
  warnText: { color: '#6d4c00', fontWeight: '600' },
  exportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  exportBtn: { flexBasis: '47%', flexGrow: 1 },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: { marginTop: 8 },
  thText: { fontWeight: '800', color: colors.textMuted, fontSize: 12 },
  td: { color: colors.text, fontSize: 13 },
  small: { color: colors.textMuted, fontSize: 11 },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  c1: { width: 62 },
  c2: { flex: 1 },
  c3: { width: 78 },
  cE: { flex: 1 },
  cA: { width: 40 },
});
