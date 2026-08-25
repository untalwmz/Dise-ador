import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { SWATCHES } from '../constants/presets';

const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

export default function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.swatchPreview, { backgroundColor: HEX_RE.test(value) ? value : '#000' }]} />
        <TextInput
          value={value}
          onChangeText={onChange}
          autoCapitalize="characters"
          placeholder="#RRGGBB"
          placeholderTextColor="#475569"
          style={styles.input}
          maxLength={7}
        />
      </View>
      <View style={styles.grid}>
        {SWATCHES.map((c) => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={[
              styles.swatch,
              { backgroundColor: c },
              value.toUpperCase() === c.toUpperCase() && styles.swatchActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  swatchPreview: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  input: {
    flex: 1,
    backgroundColor: '#161B26',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 15,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: '#F8FAFC',
  },
});
