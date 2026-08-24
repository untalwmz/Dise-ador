import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PhonePreview from '../components/PhonePreview';
import FieldGroup from '../components/FieldGroup';
import ColorField from '../components/ColorField';
import SegmentedControl from '../components/SegmentedControl';
import IconPicker from '../components/IconPicker';
import {
  GRADIENT_DIRECTIONS,
  GRADIENT_PRESETS,
  SPINNER_STYLES,
} from '../constants/presets';
import { DEFAULT_CONFIG, SplashConfig } from '../types';
import { exportSplashAsTSX, copySplashToClipboard } from '../utils/exportProject';

export default function DesignerScreen() {
  const [config, setConfig] = useState<SplashConfig>(DEFAULT_CONFIG);
  const [exporting, setExporting] = useState(false);

  const update = <K extends keyof SplashConfig>(key: K, value: SplashConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const reset = () => setConfig(DEFAULT_CONFIG);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportSplashAsTSX(config);
    } catch (e) {
      Alert.alert('Error al exportar', 'No se pudo generar el archivo TSX.');
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = async () => {
    await copySplashToClipboard(config);
    Alert.alert('Copiado', 'El código de SplashScreen.tsx se copió al portapapeles.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Splash Screen Designer</Text>
          <Pressable onPress={reset} style={styles.resetBtn}>
            <Ionicons name="refresh" size={18} color="#F8FAFC" />
          </Pressable>
        </View>

        <View style={styles.previewWrap}>
          <PhonePreview config={config} />
        </View>

        <FieldGroup label="Texto">
          <Text style={styles.subLabel}>Título</Text>
          <TextInput
            value={config.appTitle}
            onChangeText={(v) => update('appTitle', v)}
            style={styles.input}
            placeholder="Mi App"
            placeholderTextColor="#475569"
          />
          <Text style={[styles.subLabel, { marginTop: 12 }]}>Subtítulo</Text>
          <TextInput
            value={config.subtitle}
            onChangeText={(v) => update('subtitle', v)}
            style={styles.input}
            placeholder="Cargando..."
            placeholderTextColor="#475569"
          />
        </FieldGroup>

        <FieldGroup label="Color del título">
          <ColorField value={config.titleColor} onChange={(v) => update('titleColor', v)} />
        </FieldGroup>

        <FieldGroup label="Color del subtítulo">
          <ColorField value={config.subtitleColor} onChange={(v) => update('subtitleColor', v)} />
        </FieldGroup>

        <FieldGroup label="Fondo">
          <SegmentedControl
            options={[
              { label: 'Sólido', value: 'solid' },
              { label: 'Degradado', value: 'gradient' },
            ]}
            value={config.backgroundMode}
            onChange={(v) => update('backgroundMode', v)}
          />
        </FieldGroup>

        {config.backgroundMode === 'solid' ? (
          <FieldGroup label="Color de fondo">
            <ColorField value={config.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
          </FieldGroup>
        ) : (
          <>
            <FieldGroup label="Degradados sugeridos">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {GRADIENT_PRESETS.map((g) => (
                    <Pressable
                      key={g.label}
                      onPress={() => update('gradientColors', g.colors)}
                      style={styles.gradientChip}
                    >
                      <View style={[styles.gradientDot, { backgroundColor: g.colors[0] }]} />
                      <View style={[styles.gradientDot, { backgroundColor: g.colors[1], marginLeft: -8 }]} />
                      <Text style={styles.gradientLabel}>{g.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </FieldGroup>
            <FieldGroup label="Color inicial">
              <ColorField
                value={config.gradientColors[0]}
                onChange={(v) => update('gradientColors', [v, config.gradientColors[1]])}
              />
            </FieldGroup>
            <FieldGroup label="Color final">
              <ColorField
                value={config.gradientColors[1]}
                onChange={(v) => update('gradientColors', [config.gradientColors[0], v])}
              />
            </FieldGroup>
            <FieldGroup label="Dirección">
              <SegmentedControl
                options={GRADIENT_DIRECTIONS}
                value={config.gradientDirection}
                onChange={(v) => update('gradientDirection', v)}
              />
            </FieldGroup>
          </>
        )}

        <FieldGroup label="Color de acento">
          <ColorField value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        </FieldGroup>

        <FieldGroup label="Ícono">
          <IconPicker
            value={config.icon}
            accentColor={config.accentColor}
            onChange={(v) => update('icon', v)}
          />
        </FieldGroup>

        <FieldGroup label="Indicador de carga">
          <SegmentedControl
            options={SPINNER_STYLES}
            value={config.spinner}
            onChange={(v) => update('spinner', v)}
          />
        </FieldGroup>

        <FieldGroup label="Divisor de marca">
          <SegmentedControl
            options={[
              { label: 'Mostrar', value: 'yes' },
              { label: 'Ocultar', value: 'no' },
            ]}
            value={config.showBrandDivider ? 'yes' : 'no'}
            onChange={(v) => update('showBrandDivider', v === 'yes')}
          />
        </FieldGroup>

        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={handleExport} disabled={exporting}>
            <Ionicons name="download-outline" size={18} color="#0B0F19" />
            <Text style={styles.primaryBtnText}>
              {exporting ? 'Generando...' : 'Exportar SplashScreen.tsx'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={handleCopy}>
            <Ionicons name="copy-outline" size={18} color="#F8FAFC" />
            <Text style={styles.secondaryBtnText}>Copiar código</Text>
          </Pressable>
        </View>

        <Text style={styles.footerNote}>
          El archivo generado es un componente TSX independiente ({'<'}SplashScreen /{'>'}) que puedes
          copiar dentro de cualquier proyecto Expo / React Native.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F19' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '700' },
  resetBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: { marginBottom: 28 },
  subLabel: { color: '#64748B', fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#161B26',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 15,
  },
  gradientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B26',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 4,
  },
  gradientDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  gradientLabel: { color: '#CBD5E1', fontSize: 12, marginLeft: 10 },
  actions: { marginTop: 12, gap: 10 },
  primaryBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#0B0F19', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: '#161B26',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: { color: '#F8FAFC', fontWeight: '600', fontSize: 15 },
  footerNote: { color: '#475569', fontSize: 12, marginTop: 18, lineHeight: 18, textAlign: 'center' },
});
