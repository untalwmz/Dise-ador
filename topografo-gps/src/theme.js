import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#2e7d32',
  header: '#5d4037',
  fab: '#2fb344',
  primaryDark: '#1b5e20',
  accent: '#ff8f00',
  danger: '#c62828',
  bg: '#f4f6f1',
  card: '#ffffff',
  text: '#1c2421',
  textMuted: '#5f6b64',
  border: '#dfe5dc',
  good: '#2e7d32',
  fair: '#f9a825',
  bad: '#c62828',
};

export function accuracyColor(acc) {
  if (acc == null) return colors.textMuted;
  if (acc <= 5) return colors.good;
  if (acc <= 10) return colors.fair;
  return colors.bad;
}

export const common = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { color: colors.textMuted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
