import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import MapCanvas, { IMAGERY } from '../components/MapCanvas';
import Button from '../components/Button';
import Chips from '../components/Chips';
import {
  AREA_UNITS,
  LENGTH_UNITS,
  averageFixes,
  formatAccuracy,
  formatInUnit,
  formatNumber,
  haversine,
  pathLength,
  polygonArea,
} from '../geo';
import { FIX_TYPES } from '../gnss/nmea';
import { useLocationFeed } from '../gnss/useLocationFeed';
import { useBackButton } from '../hooks';
import { clearDraft, getSettings, newId, saveDraft, saveLot, saveSettings } from '../storage';
import { accuracyColor, colors, common } from '../theme';

const AVERAGING_TIMEOUT_MS = 30000;
const MAP_TYPES = [
  { value: 'satellite', label: 'Satélite' },
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'standard', label: 'Calles' },
];

export default function SurveyScreen({ navigate, push, params, active }) {
  const resume = params && params.resume;

  const [settings, setSettings] = useState(null);
  const [points, setPoints] = useState(resume ? resume.points : []);
  const [current, setCurrent] = useState(null);
  const [center, setCenter] = useState(null);
  const [walking, setWalking] = useState(false);
  const [averaging, setAveraging] = useState(null);
  const [follow, setFollow] = useState(!resume);
  const [fitKey, setFitKey] = useState(resume ? 1 : 0);
  const [sheet, setSheet] = useState(null); // null | 'menu' | 'settings' | 'layers' | 'lengthUnit' | 'areaUnit' | 'save'
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const startedAt = useRef(resume ? resume.startedAt : Date.now());
  const pointsRef = useRef(points);
  const walkingRef = useRef(walking);
  const settingsRef = useRef(settings);
  const averagingRef = useRef(null);
  pointsRef.current = points;
  walkingRef.current = walking;
  settingsRef.current = settings;

  useEffect(() => {
    getSettings().then((s) => setSettings(resume?.settings ? { ...s, ...resume.settings } : s));
  }, [resume]);

  const updateSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const addPoint = useCallback((p) => setPoints((prev) => [...prev, p]), []);

  const finishAveraging = useCallback(
    (samples) => {
      averagingRef.current = null;
      setAveraging(null);
      const avg = averageFixes(samples);
      if (avg) addPoint({ ...avg, origin: 'gps' });
    },
    [addPoint],
  );

  const handleFix = useCallback(
    (fix) => {
      setCurrent(fix);
      const s = settingsRef.current;
      if (!s || !fix) return;
      const goodEnough = fix.acc != null && fix.acc <= s.maxAccuracy;

      const av = averagingRef.current;
      if (av) {
        if (goodEnough) av.samples.push(fix);
        if (av.samples.length >= av.target) finishAveraging(av.samples);
        else if (Date.now() - av.startedAt > AVERAGING_TIMEOUT_MS) {
          if (av.samples.length) finishAveraging(av.samples);
          else {
            averagingRef.current = null;
            setAveraging(null);
            Alert.alert(
              'Señal GPS débil',
              `No hubo lecturas con precisión mejor que ±${formatAccuracy(s.maxAccuracy)}. Busca un lugar despejado o sube la precisión máxima en Ajustes.`,
            );
          }
        } else setAveraging({ ...av, samples: av.samples.slice() });
        return;
      }

      if (!walkingRef.current || !goodEnough) return;
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || haversine(last, fix) >= s.interval) addPoint({ ...fix, origin: 'gps' });
    },
    [addPoint, finishAveraging],
  );

  const { permission, ext } = useLocationFeed(settings, handleFix);

  useEffect(() => {
    activateKeepAwakeAsync('survey').catch(() => {});
    return () => {
      deactivateKeepAwake('survey').catch(() => {});
    };
  }, []);

  // Borrador automático
  useEffect(() => {
    if (!settings) return;
    if (points.length) saveDraft({ startedAt: startedAt.current, points, settings: { mode: settings.mode } });
  }, [points, settings]);

  const leave = useCallback(() => {
    if (!pointsRef.current.length) {
      navigate('home');
      return;
    }
    Alert.alert('Salir', 'El levantamiento queda guardado como borrador y podrás continuarlo después.', [
      { text: 'Seguir midiendo', style: 'cancel' },
      { text: 'Salir', onPress: () => navigate('home') },
    ]);
  }, [navigate]);

  useBackButton(active, () => (sheet ? setSheet(null) : leave()));

  // --- Acciones ---
  const addAtCrosshair = () => {
    if (!center) return;
    addPoint({ lat: center.lat, lon: center.lon, acc: null, alt: null, altMsl: null, t: Date.now(), origin: 'map' });
  };

  const addGpsPoint = () => {
    if (averagingRef.current) return;
    if (!current) {
      Alert.alert('Sin señal', 'Todavía no hay posición GPS.');
      return;
    }
    const av = { samples: [], target: settings.averageSamples, startedAt: Date.now() };
    averagingRef.current = av;
    setAveraging(av);
  };

  const toggleWalk = () => {
    if (!walking && !current) {
      Alert.alert('Sin señal', 'Espera a tener posición GPS para registrar caminando.');
      return;
    }
    setWalking((w) => !w);
    if (!walking) setFollow(true);
  };

  const undo = () => setPoints((prev) => prev.slice(0, -1));

  const moveVertex = (i, ll) =>
    setPoints((prev) => prev.map((p, j) => (j === i ? { ...p, lat: ll.lat, lon: ll.lon, origin: 'map', acc: null } : p)));

  const clearAll = () =>
    Alert.alert('Borrar todo', '¿Eliminar todos los vértices de esta medición?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          setPoints([]);
          setWalking(false);
          await clearDraft();
        },
      },
    ]);

  const openSave = () => {
    if (points.length < 3) {
      Alert.alert('Faltan puntos', 'Se necesitan al menos 3 vértices para calcular un área.');
      return;
    }
    setWalking(false);
    setName((n) => n || `Lote ${new Date().toLocaleDateString('es')}`);
    setSheet('save');
  };

  const save = async () => {
    setSaving(true);
    try {
      const lot = {
        id: newId(),
        name: name.trim() || 'Lote sin nombre',
        notes: notes.trim(),
        createdAt: startedAt.current,
        source: settings.source,
        receiver: settings.source === 'external' ? settings.externalDevice?.name || null : null,
        points,
        area: polygonArea(points),
        perimeter: pathLength(points, true),
      };
      await saveLot(lot);
      await clearDraft();
      setSheet(null);
      navigate('detail', { id: lot.id });
    } catch (e) {
      Alert.alert('Error', `No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // --- Métricas ---
  const lengthUnit = LENGTH_UNITS.find((u) => u.key === settings?.lengthUnit) || LENGTH_UNITS[0];
  const areaUnit = AREA_UNITS.find((u) => u.key === settings?.areaUnit) || AREA_UNITS[0];
  const area = useMemo(() => polygonArea(points), [points]);
  const perimeter = useMemo(() => pathLength(points, points.length >= 3), [points]);
  const sides = useMemo(() => {
    if (points.length < 2 || points.length > 60) return [];
    const n = points.length >= 3 ? points.length : 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      out.push({ from: i + 1, to: ((i + 1) % points.length) + 1, label: formatInUnit(haversine(a, b), lengthUnit) });
    }
    return out;
  }, [points, lengthUnit]);

  const toLast = center && points.length ? haversine(center, points[points.length - 1]) : null;
  const toFirst = center && points.length >= 2 ? haversine(center, points[0]) : null;
  const gpsToStart = current && points.length >= 3 ? haversine(current, points[0]) : null;
  const nearStart = walking && gpsToStart != null && gpsToStart <= Math.max(5, (settings?.interval || 2) * 2) && perimeter > 20;

  if (permission === 'denied') {
    return (
      <View style={styles.centerBox}>
        <Text style={common.h2}>Permiso de ubicación denegado</Text>
        <Text style={[common.muted, { textAlign: 'center' }]}>La app necesita la ubicación precisa para medir.</Text>
        <Button title="Abrir ajustes" onPress={() => Linking.openSettings()} />
        <Button title="Volver" variant="ghost" onPress={() => navigate('home')} />
      </View>
    );
  }
  if (!settings) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const isExternal = settings.source === 'external';
  let gpsLabel;
  if (isExternal && ext.status !== 'connected') gpsLabel = ext.status === 'disconnected' ? 'Receptor desconectado' : 'Conectando…';
  else if (permission === 'error') gpsLabel = 'GPS no disponible';
  else if (current?.acc != null) {
    const ft = isExternal && current.quality != null ? FIX_TYPES[current.quality]?.short : 'GPS';
    gpsLabel = `${ft} ±${formatAccuracy(current.acc)}`;
  } else gpsLabel = 'Buscando GPS…';

  return (
    <View style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <Pressable onPress={leave} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Medir terreno
        </Text>
        <Pressable onPress={() => push('gps')} style={[styles.gpsChip, { backgroundColor: accuracyColor(current?.acc) }]}>
          <Text style={styles.gpsChipText} numberOfLines={1}>
            {isExternal ? '📡 ' : ''}
            {gpsLabel}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <MapCanvas
          imagery={settings.imagery}
          points={points}
          sides={sides}
          current={current}
          follow={follow}
          onFollowChange={setFollow}
          mapType={settings.mapType}
          crosshair
          onCenterChange={setCenter}
          editable={!walking}
          onVertexMove={moveVertex}
          fitKey={fitKey}
        />

        {/* Mira central */}
        <View pointerEvents="none" style={styles.crossWrap}>
          <View style={styles.cross}>
            <View style={styles.crossH} />
            <View style={styles.crossV} />
            <View style={styles.crossDot} />
          </View>
          {(toLast != null || toFirst != null) && (
            <View style={styles.crossInfo}>
              <Text style={styles.crossInfoText}>
                {toLast != null ? `↤ ${formatInUnit(toLast, lengthUnit)}` : ''}
                {toFirst != null ? `   V1 ${formatInUnit(toFirst, lengthUnit)}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Tarjeta de medidas */}
        <View style={styles.measureCard}>
          <Text style={styles.measureLabel}>Distancia total</Text>
          <Pressable style={styles.measurePill} onPress={() => setSheet('lengthUnit')}>
            <Text style={styles.measureValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatNumber(perimeter / lengthUnit.factor, lengthUnit.decimals)} {lengthUnit.long.split(' (')[0]}
            </Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
          <Text style={styles.measureLabel}>Tamaño del área</Text>
          <Pressable style={styles.measurePill} onPress={() => setSheet('areaUnit')}>
            <Text style={styles.measureValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatNumber(area / areaUnit.factor, areaUnit.decimals)} {areaUnit.long.split(' (')[0]}
            </Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
        </View>

        {/* Barra izquierda */}
        <View style={styles.leftBar}>
          <ToolButton icon="⌖" label="GPS" onPress={addGpsPoint} active={!!averaging} />
          <ToolButton icon="🚶" label={walking ? 'Grabando' : 'Caminar'} onPress={toggleWalk} active={walking} danger={walking} />
          <ToolButton icon="⛰" label="Altitud" onPress={() => push('altitude')} />
          <ToolButton
            icon="🌡"
            label="Clima"
            onPress={() => {
              const at = current || center;
              push('weather', at ? { lat: at.lat, lon: at.lon } : undefined);
            }}
          />
        </View>

        {/* Botones derecha */}
        <View style={styles.rightBar}>
          <Pressable onPress={() => setFollow(true)} style={[styles.roundBig, follow && styles.roundActive]}>
            <Text style={[styles.roundIcon, follow && { color: '#fff' }]}>◎</Text>
          </Pressable>
          <Pressable onPress={() => setSheet('layers')} style={styles.round}>
            <Text style={styles.roundIconSm}>▤</Text>
          </Pressable>
        </View>

        {/* Avisos */}
        <View style={styles.banners} pointerEvents="box-none">
          {averaging && (
            <View style={[styles.banner, { backgroundColor: '#fff3e0' }]}>
              <Text style={[styles.bannerText, { color: colors.accent }]}>
                Promediando GPS… {averaging.samples.length}/{averaging.target} ¡No te muevas!
              </Text>
              <Pressable
                onPress={() => {
                  averagingRef.current = null;
                  setAveraging(null);
                }}
              >
                <Text style={styles.bannerAction}>Cancelar</Text>
              </Pressable>
            </View>
          )}
          {walking && current?.acc != null && current.acc > settings.maxAccuracy && (
            <View style={[styles.banner, { backgroundColor: '#ffebee' }]}>
              <Text style={[styles.bannerText, { color: colors.bad }]}>
                Precisión insuficiente (±{formatAccuracy(current.acc)}): no se registran puntos.
              </Text>
            </View>
          )}
          {nearStart && (
            <View style={[styles.banner, { backgroundColor: '#e8f5e9' }]}>
              <Text style={[styles.bannerText, { color: colors.primaryDark }]}>Llegaste al inicio. Pulsa ⋮ → Guardar lote.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Barra inferior */}
      <View style={styles.bottomBar}>
        <BottomButton icon="↶" onPress={undo} disabled={!points.length} />
        <BottomButton icon="⛶" onPress={() => setFitKey((k) => k + 1)} disabled={!points.length} />
        <View style={{ width: 84 }} />
        <BottomButton icon="✓" onPress={openSave} disabled={points.length < 3} />
        <Pressable onPress={() => setSheet('menu')} style={styles.menuBtn}>
          <Text style={styles.menuIcon}>⋮</Text>
        </Pressable>
        <Pressable onPress={addAtCrosshair} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
          <Text style={styles.fabIcon}>＋</Text>
        </Pressable>
      </View>

      {/* Hojas inferiores */}
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title="Opciones">
        <MenuItem icon="✓" text="Guardar lote" onPress={openSave} />
        <MenuItem icon="⚙" text="Ajustes de medición" onPress={() => setSheet('settings')} />
        <MenuItem icon="📡" text="Receptor GPS" onPress={() => { setSheet(null); push('gps'); }} />
        <MenuItem icon="⛰" text="Altitud (MSNM)" onPress={() => { setSheet(null); push('altitude'); }} />
        <MenuItem icon="🗑" text="Borrar todos los puntos" danger onPress={() => { setSheet(null); clearAll(); }} />
        <Text style={[common.muted, { marginTop: 8 }]}>
          Consejo: arrastra un vértice para corregirlo. «＋» agrega un punto en la mira; «GPS» agrega tu posición
          promediando {settings.averageSamples} lecturas.
        </Text>
      </Sheet>

      <Sheet visible={sheet === 'layers'} onClose={() => setSheet(null)} title="Mapa">
        <Text style={styles.label}>Tipo de mapa</Text>
        <Chips value={settings.mapType} onChange={(mapType) => updateSettings({ mapType })} options={MAP_TYPES} />
        <Text style={styles.label}>Imágenes</Text>
        <Chips value={settings.imagery} onChange={(imagery) => updateSettings({ imagery })} options={IMAGERY} />
        <Text style={common.muted}>
          Si la imagen se ve borrosa o vieja en tu zona, prueba la otra fuente. Ambas son gratuitas y no requieren cuenta.
        </Text>
      </Sheet>

      <Sheet visible={sheet === 'settings'} onClose={() => setSheet(null)} title="Ajustes de medición">
        <Text style={styles.label}>Al caminar, registrar un punto cada</Text>
        <Chips
          value={settings.interval}
          onChange={(interval) => updateSettings({ interval })}
          options={(isExternal ? [0.5, 1, 2, 5, 10] : [1, 2, 5, 10]).map((v) => ({ value: v, label: `${v} m` }))}
        />
        <Text style={styles.label}>Lecturas a promediar en el botón GPS</Text>
        <Chips
          value={settings.averageSamples}
          onChange={(averageSamples) => updateSettings({ averageSamples })}
          options={[1, 5, 10, 20, 30].map((v) => ({ value: v, label: `${v}` }))}
        />
        <Text style={styles.label}>Precisión GPS máxima aceptada</Text>
        <Chips
          value={settings.maxAccuracy}
          onChange={(maxAccuracy) => updateSettings({ maxAccuracy })}
          options={(isExternal ? [0.05, 0.1, 0.5, 1, 2, 5] : [5, 10, 15, 25]).map((v) => ({
            value: v,
            label: `±${formatAccuracy(v)}`,
          }))}
        />
      </Sheet>

      <UnitSheet
        visible={sheet === 'lengthUnit'}
        title="Unidad de distancia"
        units={LENGTH_UNITS}
        value={lengthUnit.key}
        onChange={(lengthUnit) => {
          updateSettings({ lengthUnit });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <UnitSheet
        visible={sheet === 'areaUnit'}
        title="Unidad de área"
        units={AREA_UNITS}
        value={areaUnit.key}
        onChange={(areaUnit) => {
          updateSettings({ areaUnit });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />

      <Modal visible={sheet === 'save'} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
          <View style={styles.sheet}>
            <Text style={common.h2}>Guardar lote</Text>
            <Text style={common.muted}>
              {points.length} vértices · {formatInUnit(area, areaUnit)} · perímetro {formatInUnit(pathLength(points, true), lengthUnit)}
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
            <View style={styles.row}>
              <Button title="Seguir midiendo" variant="ghost" small onPress={() => setSheet(null)} style={{ flex: 1 }} />
              <Button title="Guardar" small onPress={save} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ToolButton({ icon, label, onPress, active, danger }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}>
      <View style={[styles.toolCircle, active && { backgroundColor: danger ? colors.danger : colors.fab }]}>
        <Text style={[styles.toolIcon, active && { color: '#fff' }]}>{icon}</Text>
      </View>
      <Text style={styles.toolLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function BottomButton({ icon, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.bottomBtn, disabled && { opacity: 0.35 }]} hitSlop={6}>
      <Text style={styles.bottomIcon}>{icon}</Text>
    </Pressable>
  );
}

function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={common.h2}>{title}</Text>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 10, paddingTop: 6 }}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({ icon, text, onPress, danger }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.bg }]}>
      <Text style={styles.menuItemIcon}>{icon}</Text>
      <Text style={[styles.menuItemText, danger && { color: colors.danger }]}>{text}</Text>
    </Pressable>
  );
}

function UnitSheet({ visible, title, units, value, onChange, onClose }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {units.map((u) => (
        <Pressable key={u.key} onPress={() => onChange(u.key)} style={[styles.menuItem, u.key === value && styles.unitActive]}>
          <Text style={[styles.menuItemText, u.key === value && { color: colors.primaryDark, fontWeight: '800' }]}>{u.long}</Text>
          {u.key === value && <Text style={{ color: colors.primaryDark, fontWeight: '800' }}>✓</Text>}
        </Pressable>
      ))}
    </Sheet>
  );
}

const shadow = { elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1b2a1f' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 8 },
  header: { backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '800' },
  gpsChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, maxWidth: 190 },
  gpsChipText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  crossWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cross: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  crossH: { position: 'absolute', width: 92, height: 2, backgroundColor: '#fff' },
  crossV: { position: 'absolute', width: 2, height: 92, backgroundColor: '#fff' },
  crossDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  crossInfo: { position: 'absolute', top: '50%', marginTop: 48, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  crossInfoText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  measureCard: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    left: 76,
    right: 70,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 14,
    padding: 8,
    gap: 2,
    ...shadow,
  },
  measureLabel: { fontSize: 12, color: colors.text, marginLeft: 4 },
  measurePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  measureValue: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  caret: { fontSize: 14, color: colors.text },

  leftBar: { position: 'absolute', top: 10, left: 8, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 30, paddingVertical: 6, gap: 4, ...shadow },
  tool: { alignItems: 'center', width: 60 },
  toolCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  toolIcon: { fontSize: 22, color: colors.text },
  toolLabel: { fontSize: 10, fontWeight: '700', color: colors.text, marginTop: 1 },

  rightBar: { position: 'absolute', top: 10, right: 8, alignItems: 'center', gap: 12 },
  roundBig: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', borderWidth: 2, borderColor: '#222', alignItems: 'center', justifyContent: 'center', ...shadow },
  roundActive: { backgroundColor: '#2196f3', borderColor: '#fff' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  roundIcon: { fontSize: 28, color: '#222', marginTop: -2 },
  roundIconSm: { fontSize: 22, color: '#222' },

  banners: { position: 'absolute', left: 10, right: 10, bottom: 16, gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8, ...shadow },
  bannerText: { flex: 1, fontWeight: '700', fontSize: 13 },
  bannerAction: { fontWeight: '800', color: colors.textMuted },

  bottomBar: {
    height: 64,
    backgroundColor: '#eceff1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  bottomBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bottomIcon: { fontSize: 26, color: '#222', fontWeight: '700' },
  menuBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.fab, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { color: '#fff', fontSize: 26, fontWeight: '900' },
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -40,
    top: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.fab,
    borderWidth: 4,
    borderColor: '#eceff1',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  fabIcon: { color: '#fff', fontSize: 44, fontWeight: '300', marginTop: -4 },

  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', padding: 18, gap: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6 },
  label: { fontWeight: '700', color: colors.text, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  menuItemIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuItemText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
  unitActive: { backgroundColor: '#e8f5e9' },
});
