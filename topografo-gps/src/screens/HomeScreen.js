import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import { clearDraft, getDraft, listLots } from '../storage';
import { formatArea, formatLength, polygonArea, pathLength } from '../geo';
import { colors, common } from '../theme';

export default function HomeScreen({ navigate }) {
  const [lots, setLots] = useState([]);
  const [draft, setDraft] = useState(null);

  const load = useCallback(async () => {
    setLots(await listLots());
    const d = await getDraft();
    setDraft(d && d.points && d.points.length ? d : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const discardDraft = () =>
    Alert.alert('Descartar levantamiento', '¿Borrar el levantamiento sin terminar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await clearDraft();
          setDraft(null);
        },
      },
    ]);

  const totalArea = lots.reduce((s, l) => s + (l.area || 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Topógrafo GPS</Text>
        <Text style={styles.subtitle}>Mide tu terreno caminando su perímetro</Text>
      </View>

      {draft && (
        <View style={[common.card, styles.draft]}>
          <Text style={common.h2}>Levantamiento sin terminar</Text>
          <Text style={common.muted}>
            {draft.points.length} puntos · {new Date(draft.startedAt).toLocaleString('es')}
          </Text>
          <View style={styles.draftButtons}>
            <Button title="Continuar" small onPress={() => navigate('survey', { resume: draft })} style={{ flex: 1 }} />
            <Button title="Descartar" small variant="ghost" onPress={discardDraft} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      <FlatList
        data={lots}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          lots.length ? (
            <Text style={styles.sectionLabel}>
              {lots.length} {lots.length === 1 ? 'lote medido' : 'lotes medidos'} · {formatArea(totalArea)} en total
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📐</Text>
            <Text style={common.h2}>Aún no has medido ningún lote</Text>
            <Text style={[common.muted, styles.center]}>
              Párate en una esquina del terreno, pulsa «Nuevo levantamiento» y camina por todo el borde hasta
              volver al punto de inicio.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigate('detail', { id: item.id })}
            style={({ pressed }) => [common.card, styles.item, pressed && { opacity: 0.8 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={common.muted}>
                {new Date(item.createdAt).toLocaleDateString('es')} · {item.points.length} vértices ·{' '}
                {formatLength(item.perimeter ?? pathLength(item.points, true))}
              </Text>
            </View>
            <Text style={styles.itemArea}>{formatArea(item.area ?? polygonArea(item.points))}</Text>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Button title="＋  Nuevo levantamiento" onPress={() => navigate('survey')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  draft: { margin: 16, marginBottom: 0, borderColor: colors.accent, borderWidth: 2, gap: 4 },
  draftButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  sectionLabel: { color: colors.textMuted, fontWeight: '600', marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 },
  itemArea: { fontSize: 16, fontWeight: '800', color: colors.primaryDark },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, gap: 8 },
  emptyIcon: { fontSize: 48 },
  center: { textAlign: 'center', lineHeight: 19 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
});
