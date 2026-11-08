import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import * as External from '../gnss/external';
import { FIX_TYPES } from '../gnss/nmea';
import { getSettings, saveSettings } from '../storage';
import { formatAccuracy } from '../geo';
import { accuracyColor, colors, common } from '../theme';
import { useBackButton } from '../hooks';

export default function GpsSourceScreen({ goBack, active }) {
  const [settings, setSettings] = useState(null);
  const [ext, setExt] = useState(External.getState());
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(false);
  const available = External.isAvailable();

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);
  useEffect(() => External.subscribe(setExt), []);

  useBackButton(active, goBack);

  const update = useCallback(
    (patch) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      saveSettings(next);
    },
    [settings],
  );

  const loadDevices = async () => {
    setLoading(true);
    try {
      setDevices(await External.getPairedDevices());
    } catch (e) {
      Alert.alert('Bluetooth', e.message);
    } finally {
      setLoading(false);
    }
  };

  const choose = async (device) => {
    update({ source: 'external', externalDevice: device, maxAccuracy: Math.min(settings.maxAccuracy, 5) });
    try {
      await External.connect(device);
    } catch (e) {
      Alert.alert(
        'No se pudo conectar',
        `${e.message}\n\nVerifica que el receptor esté encendido, cerca y que ninguna otra app lo esté usando.`,
      );
    }
  };

  const usePhone = async () => {
    update({ source: 'phone', maxAccuracy: Math.max(settings.maxAccuracy, 10) });
    await External.disconnect();
  };

  if (!settings) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const fix = ext.lastFix;
  const gga = ext.lastGga;
  const fixType = gga ? FIX_TYPES[gga.quality] : null;
  const isExternal = settings.source === 'external';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Receptor GPS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Option
          active={!isExternal}
          title="📱 GPS del teléfono"
          text="Precisión típica 3–5 m. También sirve para receptores conectados con una app de «ubicación simulada»."
          onPress={usePhone}
        />
        <Option
          active={isExternal}
          title="📡 Receptor externo Bluetooth"
          text="Receptores GNSS/RTK que envían NMEA por Bluetooth (Garmin GLO, Bad Elf, Emlid Reach, ArduSimple, Trimble, etc.). Precisión de submétrica a centimétrica."
          onPress={() => {
            if (!available) {
              Alert.alert('No disponible', 'Esta función requiere la app instalada desde el APK en Android.');
              return;
            }
            update({ source: 'external' });
            if (!devices) loadDevices();
          }}
        />

        {isExternal && (
          <>
            <View style={[common.card, { gap: 8 }]}>
              <View style={common.row}>
                <Text style={[common.h2, { flex: 1 }]}>Estado</Text>
                <View style={[styles.dot, { backgroundColor: STATUS_COLORS[ext.status] }]} />
                <Text style={styles.statusText}>{STATUS_LABELS[ext.status]}</Text>
              </View>
              {ext.device && <Text style={common.muted}>{ext.device.name} · {ext.device.address}</Text>}
              {ext.message && <Text style={{ color: colors.bad }}>{ext.message}</Text>}
              {ext.status === 'connected' && (
                <View style={styles.grid}>
                  <Info label="Solución" value={fixType ? fixType.label : 'Esperando datos…'} />
                  <Info label="Satélites" value={gga ? String(gga.sats) : '—'} />
                  <Info label="HDOP" value={gga?.hdop != null ? gga.hdop.toFixed(1) : '—'} />
                  <Info
                    label="Precisión"
                    value={fix?.acc != null ? `±${formatAccuracy(fix.acc)}` : '—'}
                    color={accuracyColor(fix?.acc)}
                  />
                  <Info label="Latitud" value={fix ? fix.lat.toFixed(8) : '—'} />
                  <Info label="Longitud" value={fix ? fix.lon.toFixed(8) : '—'} />
                  <Info label="Altitud" value={fix?.alt != null ? `${fix.alt.toFixed(2)} m` : '—'} />
                  <Info label="Épocas" value={String(ext.epochs)} />
                </View>
              )}
              <View style={styles.buttons}>
                {ext.status === 'disconnected' && settings.externalDevice && (
                  <Button title="Conectar" small onPress={() => choose(settings.externalDevice)} style={{ flex: 1 }} />
                )}
                {ext.status !== 'disconnected' && (
                  <Button title="Desconectar" small variant="ghost" onPress={External.disconnect} style={{ flex: 1 }} />
                )}
              </View>
            </View>

            <View style={[common.card, { gap: 8 }]}>
              <View style={common.row}>
                <Text style={[common.h2, { flex: 1 }]}>Receptores emparejados</Text>
                <Button title="Actualizar" small variant="outline" onPress={loadDevices} loading={loading} />
              </View>
              {devices && devices.length === 0 && (
                <Text style={common.muted}>No hay dispositivos emparejados.</Text>
              )}
              {devices?.map((d) => {
                const selected = settings.externalDevice?.address === d.address;
                return (
                  <Pressable key={d.address} onPress={() => choose(d)} style={[styles.device, selected && styles.deviceSel]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceName}>{d.name}</Text>
                      <Text style={common.muted}>{d.address}</Text>
                    </View>
                    {selected && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                );
              })}
              <Text style={common.muted}>
                ¿No aparece tu receptor? Primero emparéjalo en los ajustes de Bluetooth de Android.
              </Text>
              <Button
                title="Abrir ajustes de Bluetooth"
                small
                variant="ghost"
                onPress={() => Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => Linking.openSettings())}
              />
            </View>

            <View style={[common.card, { gap: 6 }]}>
              <Text style={common.h2}>Consejos</Text>
              <Text style={common.muted}>
                • Para RTK, configura las correcciones (NTRIP o base) en la app del fabricante del receptor; esta app lee
                la posición ya corregida.{'\n'}• Espera «RTK fijo» antes de marcar vértices para precisión centimétrica.
                {'\n'}• Usa el modo «Vértices» y promedia 10–30 lecturas en cada esquina.{'\n'}• La altitud mostrada es
                sobre el nivel del mar (geoide) según el receptor.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const STATUS_LABELS = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
};
const STATUS_COLORS = {
  disconnected: colors.textMuted,
  connecting: colors.fair,
  connected: colors.good,
  reconnecting: colors.fair,
};

function Option({ active, title, text, onPress }) {
  return (
    <Pressable onPress={onPress} style={[common.card, styles.option, active && styles.optionActive]}>
      <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={common.h2}>{title}</Text>
        <Text style={common.muted}>{text}</Text>
      </View>
    </Pressable>
  );
}

function Info({ label, value, color }) {
  return (
    <View style={styles.info}>
      <Text style={common.muted}>{label}</Text>
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  option: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  optionActive: { borderColor: colors.primary, borderWidth: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  statusText: { fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  info: { width: '50%' },
  infoValue: { fontWeight: '700', color: colors.text, fontSize: 15 },
  buttons: { flexDirection: 'row', gap: 8 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceSel: { borderColor: colors.primary, backgroundColor: '#e8f5e9' },
  deviceName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  check: { fontSize: 20, color: colors.primary, fontWeight: '800' },
});
