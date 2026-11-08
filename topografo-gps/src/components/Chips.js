import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

// Selector de opciones en forma de "chips".
export default function Chips({ options, value, onChange, disabled }) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => !disabled && onChange(o.value)}
            style={[styles.chip, active && styles.active, disabled && styles.disabled]}
          >
            <Text style={[styles.text, active && styles.activeText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
  activeText: { color: '#fff' },
  disabled: { opacity: 0.5 },
});
