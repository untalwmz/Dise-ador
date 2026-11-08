import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import SatelliteMap from '../components/SatelliteMap';
import Button from '../components/Button';
import Chips from '../components/Chips';
import { averageFixes, formatArea, formatLength, formatNumber, haversine, pathLength, polygonArea } from '../geo';
import { clearDraft, getSettings, newId, saveDraft, saveLot, saveSettings } from '../storage';
import { accuracyColor, colors, common } from '../theme';

const AVERAGING_TIMEOUT_MS = 30000;

export default function SurveyScreen({ navigate, params }) {
  const resume = params && params.resume;

  const [permission, setPermission] = useState('checking'); // checking | granted | denied | error
  const [settings, setSettings] = useState(resume ? resume.settings : null);
  const [status, setStatus] = useState(resume ? 'paused' : 'ready'); // ready | recording | paused
  const [points, setPoints] = useState(resume ? resume.points : []);
  const [current, setCurrent] = useState(null);
  const [averaging, setAveraging] = useState(null); // { samples, target, startedAt }
  const [follow, setFollow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [rejected, setRejected] = useState(0);

  const startedAt = useRef(resume ? resume.startedAt : Date.now());
  const pointsRef = useRef(points);
  const statusRef = useRef(status);
  const settingsRef = useRef(settings);
  const averagingRef = useRef(null);
  pointsRef.current = points;
  statusRef.current = status;
  settingsRef.current = settings;

  // Ajustes guardados
  useEffect(() => {
    if (!settings) getSettings().then(setSettings);
  }, [settings]);

  const addPoint = useCallback((p) => {
    setPoints((prev) => [...prev, p]);
  }, []);

  const finishAveraging = useCallback(
    (samples) => {
      averagingRef.current = null;
      setAveraging(null);
      const avg = averageFixes(samples);
      if (avg) addPoint(avg);
    },
    [addPoint],
  );

  // Procesa cada lectura del GPS
  const handleFix = useCallback(
    (loc) => {
      const c = loc.coords;
      const fix = {
        lat: c.latitude,
        lon: c.longitude,
        alt: c.altitude,
        acc: c.accuracy,
        t: loc.timestamp,
      };
      setCurrent(fix);
      const s = settingsRef.current;
      if (!s) return;
      const goodEnough = fix.acc != null && fix.acc <= s.maxAccuracy;

      // Marcando un vértice: acumulamos lecturas buenas y promediamos
      const av = averagingRef.current;
      if (av) {
        if (goodEnough) av.samples.push(fix);
        const elapsed = Date.now() - av.startedAt;
        if (av.samples.length >= av.target) {
          finishAveraging(av.samples);
        } else if (elapsed > AVERAGING_TIMEOUT_MS) {
          if (av.samples.length) finishAveraging(av.samples);
          else {
            averagingRef.current = null;
            setAveraging(null);
            Alert.alert(
              'Señal GPS débil',
              `No se obtuvo ninguna lectura con precisión mejor que ${s.maxAccuracy} m. Muévete a un lugar despejado o aumenta la precisión máxima.`,
            );
          }
        } else {
          setAveraging({ ...av, samples: av.samples.slice() });
        }
        return;
      }

      if (statusRef.current !== 'recording' || s.mode !== 'auto') return;
      if (!goodEnough) {
        setRejected((r) => r + 1);
        return;
      }
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || haversine(last, fix) >= s.interval) addPoint(fix);
    },
    [addPoint, finishAveraging],
  );

  // Permisos + suscripción al GPS
  useEffect(() => {
    let sub = null;
    let cancelled = false;
    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted') {
          if (!cancelled) setPermission('denied');
          return;
        }
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled && Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            // el usuario no activó la ubicación
          }
        }
        if (cancelled) return;
        setPermission('granted');
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 0,
          },
          handleFix,
          () => setPermission('error'),
        );
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) setPermission('error');
      }
    })();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [handleFix]);

  // Pantalla siempre encendida mientras se mide
  useEffect(() => {
    activateKeepAwakeAsync('survey').catch(() => {});
    return () => {
      deactivateKeepAwake('survey').catch(() => {});
    };
  }, []);

  // Guardado automático del borrador
  useEffect(() => {
    if (status === 'ready' || !settings) return;
    saveDraft({ startedAt: startedAt.current, points, settings });
  }, [points, status, settings]);

  const leave = useCallback(() => {
    if (!pointsRef.current.length) {
      navigate('home');
      return;
    }
    Alert.alert('Salir del levantamiento', 'El levantamiento queda guardado como borrador y podrás continuarlo después.', [
      { text: 'Seguir midiendo', style: 'cancel' },
      { text: 'Salir', onPress: () => navigate('home') },
    ]);
  }, [navigate]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => h.remove();
  }, [leave]);

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const start = () => {
    startedAt.current = Date.now();
    setStatus('recording');
  };

  const markVertex = () => {
    if (averagingRef.current) return;
    const av = { samples: [], target: settings.averageSamples, startedAt: Date.now() };
    averagingRef.current = av;
    setAveraging(av);
  };

  const cancelAveraging = () => {
    averagingRef.current = null;
    setAveraging(null);
  };

  const undo = () => setPoints((prev) => prev.slice(0, -1));

  const finish = () => {
    if (points.length < 3) {
      Alert.alert('Faltan puntos', 'Se necesitan al menos 3 vértices para calcular un área.');
      return;
    }
    setStatus('paused');
    setName(`Lote ${new Date().toLocaleDateString('es')}`);
    setShowSave(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const lot = {
        id: newId(),
        name: name.trim() || 'Lote sin nombre',
        notes: notes.trim(),
        createdAt: startedAt.current,
        mode: settings.mode,
        points,
        area: polygonArea(points),
        perimeter: pathLength(points, true),
      };
      await saveLot(lot);
      await clearDraft();
      setShowSave(false);
      navigate('detail', { id: lot.id });
    } catch (e) {
      Alert.alert('Error', `No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Métricas en vivo
  const area = useMemo(() => polygonArea(points), [points]);
  const perimeter = useMemo(() => pathLength(points, points.length >= 3), [points]);
  const toStart = points.length && current ? haversine(current, points[0]) : null;
  const nearStart =
    points.length >= 3 && toStart != null && toStart <= Math.max(5, (settings?.interval || 2) * 2) && perimeter > 20;

  const mapData = useMemo(() => ({ points, current, closed: false, follow }), [points, current, follow]);

  if (permission === 'denied') {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={common.h2}>Permiso de ubicación denegado</Text>
        <Text style={[common.muted, styles.centerText]}>
          La app necesita acceso a la ubicación precisa para medir el terreno.
        </Text>
        <Button title="Abrir ajustes" onPress={() => Linking.openSettings()} />
        <Button title="Volver" variant="ghost" onPress={() => navigate('home')} />
      </View>
    );
  }

  if (!settings) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const recording = status === 'recording';
  const accTxt = current?.acc != null ? `±${formatNumber(current.acc, 1)} m` : 'Buscando…';

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <SatelliteMap data={mapData} onFollowChange={setFollow} />
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable onPress={leave} style={styles.roundBtn}>
            <Text style={styles.roundBtnText}>←</Text>
          </Pressable>
          <View style={[styles.gpsBadge, { backgroundColor: accuracyColor(current?.acc) }]}>
            <Text style={styles.gpsText}>
              {permission === 'error' ? 'GPS no disponible' : `GPS ${accTxt}`}
            </Text>
          </View>
        </View>
        {!follow && (
          <Pressable onPress={() => setFollow(true)} style={styles.recenter}>
            <Text style={styles.recenterText}>◎ Centrar</Text>
          </Pressable>
        )}
        {status !== 'ready' && (
          <View style={[styles.statusPill, { backgroundColor: recording ? colors.danger : colors.textMuted }]}>
            <Text style={styles.statusText}>{recording ? '● GRABANDO' : 'Ⅱ EN PAUSA'}</Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.stats}>
          <Stat label="Vértices" value={String(points.length)} />
          <Stat label="Perímetro" value={formatLength(perimeter)} />
          <Stat label="Área" value={points.length >= 3 ? formatArea(area) : '—'} />
          <Stat
            label="Al inicio"
            value={toStart != null ? formatLength(toStart) : '—'}
            highlight={nearStart}
          />
        </View>

        {nearStart && recording && (
          <Text style={styles.hint}>Estás cerca del punto de inicio. Puedes pulsar «Terminar» para cerrar el lote.</Text>
        )}
        {recording && settings.mode === 'auto' && current?.acc != null && current.acc > settings.maxAccuracy && (
          <Text style={[styles.hint, { color: colors.bad }]}>
            Precisión insuficiente (±{formatNumber(current.acc, 0)} m): no se están registrando puntos. Espera en un lugar
            despejado.
          </Text>
        )}

        {status === 'ready' ? (
          <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 10 }}>
            <Text style={styles.label}>Modo de medición</Text>
            <Chips
              value={settings.mode}
              onChange={(mode) => updateSettings({ mode })}
              options={[
                { value: 'auto', label: '🚶 Caminata (automático)' },
                { value: 'manual', label: '📍 Vértices (manual)' },
              ]}
            />
            <Text style={common.muted}>
              {settings.mode === 'auto'
                ? 'Camina por el borde del lote; se registra un punto cada cierto número de metros.'
                : 'Párate en cada esquina y pulsa «Marcar vértice»: se promedian varias lecturas para mayor exactitud.'}
            </Text>
            {settings.mode === 'auto' ? (
              <>
                <Text style={styles.label}>Registrar un punto cada</Text>
                <Chips
                  value={settings.interval}
                  onChange={(interval) => updateSettings({ interval })}
                  options={[1, 2, 5, 10].map((v) => ({ value: v, label: `${v} m` }))}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Lecturas a promediar por vértice</Text>
                <Chips
                  value={settings.averageSamples}
                  onChange={(averageSamples) => updateSettings({ averageSamples })}
                  options={[5, 10, 20, 30].map((v) => ({ value: v, label: `${v}` }))}
                />
              </>
            )}
            <Text style={styles.label}>Precisión GPS máxima aceptada</Text>
            <Chips
              value={settings.maxAccuracy}
              onChange={(maxAccuracy) => updateSettings({ maxAccuracy })}
              options={[5, 10, 15, 25].map((v) => ({ value: v, label: `±${v} m` }))}
            />
            <Button title="▶  Iniciar levantamiento" onPress={start} disabled={!current} />
            {!current && <Text style={[common.muted, styles.centerText]}>Esperando señal GPS…</Text>}
          </ScrollView>
        ) : (
          <View style={{ gap: 10 }}>
            {settings.mode === 'manual' && recording && (
              averaging ? (
                <View style={styles.averaging}>
                  <Text style={styles.averagingText}>
                    Promediando… {averaging.samples.length}/{averaging.target} lecturas. ¡No te muevas!
                  </Text>
                  <Button title="Cancelar" small variant="ghost" onPress={cancelAveraging} />
                </View>
              ) : (
                <Button title={`📍  Marcar vértice V${points.length + 1}`} variant="accent" onPress={markVertex} />
              )
            )}
            <View style={styles.controls}>
              {recording ? (
                <Button title="Ⅱ Pausa" variant="outline" small onPress={() => setStatus('paused')} style={styles.flex} />
              ) : (
                <Button title="▶ Seguir" variant="outline" small onPress={() => setStatus('recording')} style={styles.flex} />
              )}
              <Button
                title="↶ Deshacer"
                variant="ghost"
                small
                onPress={undo}
                disabled={!points.length || !!averaging}
                style={styles.flex}
              />
              <Button title="✓ Terminar" small onPress={finish} disabled={!!averaging} style={styles.flex} />
            </View>
            {rejected > 0 && settings.mode === 'auto' && (
              <Text style={[common.muted, styles.centerText]}>{rejected} lecturas descartadas por baja precisión</Text>
            )}
          </View>
        )}
      </View>

      <Modal visible={showSave} transparent animationType="slide" onRequestClose={() => setShowSave(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={common.h2}>Guardar lote</Text>
            <Text style={common.muted}>
              {points.length} vértices · {formatArea(area)} · perímetro {formatLength(pathLength(points, true))}
            </Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Ej. Parcela El Roble" />
            <Text style={styles.label}>Notas (opcional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Propietario, colindantes, observaciones…"
            />
            <View style={styles.controls}>
              <Button title="Seguir midiendo" variant="ghost" small onPress={() => setShowSave(false)} style={styles.flex} />
              <Button title="Guardar" small onPress={save} loading={saving} style={styles.flex} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <View style={[styles.stat, highlight && styles.statHighlight]}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { textAlign: 'center' },
  mapWrap: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  roundBtnText: { fontSize: 22, fontWeight: '700', color: colors.text },
  gpsBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, elevation: 3 },
  gpsText: { color: '#fff', fontWeight: '800' },
  recenter: {
    position: 'absolute',
    right: 10,
    bottom: 40,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 3,
  },
  recenterText: { fontWeight: '700', color: colors.primary },
  statusPill: {
    position: 'absolute',
    left: 10,
    bottom: 40,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  panel: {
    backgroundColor: '#fff',
    padding: 14,
    gap: 10,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginTop: -14,
    elevation: 8,
  },
  stats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.bg },
  statHighlight: { backgroundColor: '#c8e6c9' },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  hint: { color: colors.primaryDark, fontWeight: '600', textAlign: 'center' },
  label: { fontWeight: '700', color: colors.text, marginTop: 4 },
  controls: { flexDirection: 'row', gap: 8 },
  averaging: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 10,
  },
  averagingText: { flex: 1, fontWeight: '700', color: colors.accent },
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { backgroundColor: '#fff', padding: 20, gap: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
});
