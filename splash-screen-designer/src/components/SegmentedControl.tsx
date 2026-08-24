import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';

interface Option<T extends string> {
  label: string;
  value: T;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#161B26',
    marginRight: 8,
  },
  pillActive: { backgroundColor: '#38BDF8' },
  label: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  labelActive: { color: '#0B0F19' },
});
